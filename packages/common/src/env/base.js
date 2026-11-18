'use strict'

/**
 * `spec-env base` — which branch skitterspec will fork from and land onto, and
 * which in-flight specs forked from an older one.
 *
 * Pure: the CLI fetches, reads refs and computes merge-bases, and hands the
 * facts in. Nothing here touches git, and nothing here edits config — a
 * permanent pin is a hand edit of `baseBranch`, deliberately without a verb.
 * The gap pin is different (`env/basepin.js`): local, temporary, and retired by
 * the next match, so `--use-fallback` and `--unpin` are its verbs.
 */

const HOW = Object.freeze({
  pin: 'pinned by baseBranch',
  pattern: 'newest match',
  'gap-pin': 'pinned for the gap',
  'origin-head': 'origin/HEAD',
  local: 'local branch',
  fallback: 'nothing detected — default',
})

/**
 * Which match a spec branch forked from: the one whose merge-base with the
 * branch is newest. `matches` is newest-first; `mergeBase(name)` returns a sha
 * or null; `isAncestor(a, b)` is true when `a` is an ancestor of (or equal to) `b`.
 *
 * WHAT WOULD FOOL THIS: a release candidate cut from a base that already holds
 * the old rc's tip. Both merge-bases are then the same commit and nothing in
 * the history says which one the spec was forked from — so a tie goes to the
 * NEWER match, and the spec is not reported as behind. Being wrong that way
 * costs a row that should have printed; the rebase onto the newer match is a
 * no-op for exactly the commits the two share, so nothing lands wrong.
 */
function forkMatch(matches, mergeBase, isAncestor) {
  let best = null
  for (const name of matches) {
    const sha = mergeBase(name)
    if (!sha) continue
    // Strictly newer only: an equal merge-base keeps the newer match already held.
    if (!best || (sha !== best.sha && isAncestor(best.sha, sha))) best = { name, sha }
  }
  return best ? best.name : null
}

/**
 * Build the report. `facts`:
 *   { pattern, remote, base, how, fetch: { ok, reason } | null,
 *     matches: [{ name, date }] (newest first), forks: [{ spec, forkedFrom }],
 *     pin: { base, pattern, pinnedAt } | null — the gap pin in force,
 *     pinCleared: bool — a match retired a pin on this run,
 *     offer: { kind, label, command } | null — no match and no pin }
 * Returns `{ json, lines }`; the CLI prints one of them and always exits 0.
 */
function planBaseReport(facts) {
  const { pattern, remote, base, how } = facts
  const matches = facts.matches || []
  const fetch = facts.fetch || null
  // Behind = forked from a match that is not the base. Only meaningful when the
  // pattern chose the base: a pin is a deliberate choice of base, and the
  // matches beside it are not competing for the role.
  const stale =
    how === 'pattern' && base
      ? (facts.forks || []).filter((f) => f.forkedFrom && f.forkedFrom !== base)
      : []

  const json = {
    base: base || null,
    how,
    pattern: pattern || null,
    remote,
    fetch,
    matches: matches.map((m) => ({ ...m, base: m.name === base })),
    stale,
    pin: how === 'gap-pin' ? facts.pin || null : null,
    pinCleared: Boolean(facts.pinCleared),
    offer: facts.offer || null,
  }

  const lines = []
  if (!pattern) {
    lines.push(`spec-env base: ${base} (${HOW[how]})`)
    return { json, lines }
  }

  if (how === 'gap-pin') lines.push(`spec-env base: ${base} — no ${pattern} branch on ${remote} (${HOW[how]})`)
  else if (base) lines.push(`spec-env base: ${base} (${HOW[how]}${how === 'pin' ? ` — ${pattern} not used` : ` for ${pattern}`})`)
  else lines.push(`spec-env base: none — no branch on ${remote} matches ${pattern}`)

  if (fetch) {
    lines.push(
      fetch.ok
        ? `  fetched ${remote}`
        : `  fetch from ${remote} failed${fetch.reason ? ` (${fetch.reason})` : ''} — listing the refs already here`,
    )
  }

  if (matches.length) {
    const width = Math.max(...matches.map((m) => m.name.length))
    for (const m of matches) {
      const mark = m.name === base ? (how === 'pin' ? '  ← base (pin)' : '  ← base') : ''
      lines.push(`  ${m.name.padEnd(width)}  ${m.date || ''}${mark}`.trimEnd())
    }
  }

  if (how === 'gap-pin') {
    const since = facts.pin && facts.pin.pinnedAt ? ` since ${facts.pin.pinnedAt.slice(0, 10)}` : ''
    lines.push(`  pinned${since} · clears itself when a ${pattern} branch appears · --unpin removes it now`)
  }
  if (facts.pinCleared) lines.push(`  gap pin cleared — ${base} matches ${pattern}`)
  if (!base && facts.offer) lines.push(`  offer: ${facts.offer.label} — ${facts.offer.command}`)

  if (stale.length) {
    lines.push('  forked from an older match:')
    for (const s of stale) lines.push(`    ${s.spec} · forked from ${s.forkedFrom}`)
  }
  return { json, lines }
}

module.exports = { forkMatch, planBaseReport }
