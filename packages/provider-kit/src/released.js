'use strict'

/**
 * Which tickets a release contains.
 *
 * The repo lands specs with `merge --ff-only`, so history is linear and branch
 * names never reach it. A commit's `Refs:` trailer is therefore the only place
 * the ticket survives into the range a release scans — see the
 * `commit-trailers` rule. Nothing here is tracker-specific: the identifier
 * shape defaults to `KEY-123` (Linear, Jira), and a provider whose refs look
 * different (GitHub's `#123`) passes its own `refPattern`.
 *
 * The parsing half is pure and takes commits as data, so the rules below are
 * testable without git. Reading the range, and enriching refs with issue titles,
 * belong to the caller.
 */

// An issue identifier: uppercase team key, dash, number. The default, used
// whenever a caller passes no `refPattern`.
const IDENTIFIER_RE = /\b[A-Z][A-Z0-9]*-\d+\b/g
// A GitHub issue ref in the same repo: `#123`.
//
// WHAT WOULD FOOL IT: `#` is also how a commit says "issue number" in prose and
// how `owner/repo#123` names ANOTHER repo's issue. Prose is excluded by the
// trailer anchor (only a `Refs:` line is scanned); the cross-repo form is
// excluded by the lookbehind, so a ref into some other repo never lands on this
// one's release.
const GITHUB_REF_RE = /(?<![\w/.-])#\d+\b/g
// A `Refs:` trailer line. Anchored, so it is a line of its own — never prose
// that happens to mention the word.
const TRAILER_RE = /^Refs:[ \t]*(.+?)[ \t]*$/

/**
 * The refs a single commit body claims.
 *
 * Deliberately blind to three things that LOOK like trailers and are not:
 *
 *   - a line inside a ``` fence — a commit explaining the convention quotes it;
 *   - a quoted line (`> Refs: …`) — same reason, in review replies;
 *   - an indented line (4+ spaces) — markdown code, e.g. a sample message.
 *
 * Counting any of those would make a release claim work it does not contain,
 * which is worse than missing a ticket: the missing one is noticed when someone
 * looks for it, the invented one never is.
 */
function refsInBody(body, refPattern) {
  const pattern = asGlobal(refPattern) || IDENTIFIER_RE
  const found = []
  let fenced = false
  for (const raw of String(body || '').split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    if (/^\s*>/.test(line)) continue
    if (/^ {4,}|\t/.test(line)) continue
    const m = TRAILER_RE.exec(line.trim() === line ? line : line.trimStart())
    if (!m) continue
    for (const id of m[1].match(pattern) || []) found.push(id)
  }
  return found
}

// `String.prototype.match` only returns every hit for a GLOBAL regex; a
// provider passing `/#\d+/` would otherwise get its first ref and lose the rest
// in silence. Anything that is not a RegExp is no pattern at all.
function asGlobal(pattern) {
  if (!(pattern instanceof RegExp)) return null
  return pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`)
}

/**
 * Whether a commit's changed paths are ENTIRELY bookkeeping.
 *
 * The problem it solves: a spec's `chore(spec): complete <name>` commit carries
 * the same `Refs:` trailer as the code it describes, but lands after the tag
 * that shipped that code — so the ticket turns up in two consecutive release
 * ranges, once for its code and once for its paperwork.
 *
 * Deliberately a POSITIVE signal: it says yes only when it actually saw paths
 * and every one of them sits under an ignored prefix. It never reasons from an
 * absence.
 *
 * WHAT WOULD FOOL THE OTHER PHRASING ("no unignored path was found"): git lists
 * no files at all for a MERGE commit (without `-m`) — verified, not assumed —
 * nor for a genuinely empty one, and a `git log` that failed outright yields no
 * paths for anything. Under that phrasing every one of those becomes a release
 * silently losing its tickets. Under this one they mean "nothing was seen, so
 * nothing is known", which keeps the pre-filter behaviour: an over-claimed
 * ticket is noticed when someone looks for it, whereas a ticket that quietly
 * belongs to no release never is.
 *
 * Matching is path-prefix, not glob: `specs` and `specs/` both mean the
 * directory, and a prefix only matches on a path SEGMENT boundary, so `specs/`
 * never swallows `specs-archive/`.
 *
 * @param {string[]|null|undefined} paths repo-relative paths the commit changed
 * @param {string[]} ignorePaths repo-relative prefixes that are bookkeeping
 */
function onlyIgnoredPaths(paths, ignorePaths) {
  if (!Array.isArray(paths) || !paths.length) return false
  const prefixes = (Array.isArray(ignorePaths) ? ignorePaths : [])
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p) => p.trim().replace(/^\.\//, '').replace(/\/+$/, ''))
    .filter(Boolean)
  if (!prefixes.length) return false
  return paths.every((raw) => {
    const file = String(raw == null ? '' : raw)
      .trim()
      .replace(/^\.\//, '')
    // An unreadable entry is an unknown, not an ignored one — it makes the whole
    // commit count, per the bias above.
    if (!file) return false
    return prefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))
  })
}

/**
 * Fold commits into the report a release needs.
 *
 * @param {Array<{sha?:string, subject?:string, body?:string, paths?:string[]}>} commits
 * @param {{ignorePaths?:string[], refPattern?:RegExp, foreignPatterns?:RegExp[]}} [options]
 *   `ignorePaths` marks bookkeeping — see `onlyIgnoredPaths`. Omitted (or
 *   empty) means nothing is ignored, so the report is what it was before the
 *   filter existed. `refPattern` is this provider's ref shape (see
 *   `refsInBody`). `foreignPatterns` are OTHER trackers' ref shapes this repo
 *   used before — a repo that moved from Linear to GitHub still has
 *   `Refs: SKS-29` all through its history, and those commits were referenced,
 *   just not to this tracker. They are counted as `historical` rather than
 *   `unreferenced`, which exists to surface a MISSED trailer.
 * @returns {{tickets: Array<{ref:string, commits:number}>, unreferenced:number, ignored:number, total:number, historical?:number}}
 *   `historical` is present only when `foreignPatterns` was given, so a
 *   provider that never moved trackers sees exactly the shape it always did.
 *   `tickets` is deduped in FIRST-SEEN order: a ticket touched by eight commits
 *   is listed once, where it first appears, not eight times. `ignored` is
 *   reported rather than merely subtracted — a filter that removes commits in
 *   silence reads as "there was nothing there".
 */
function ticketsInRange(commits, options = {}) {
  const ignorePaths = (options && options.ignorePaths) || []
  const refPattern = options && options.refPattern
  const foreign = ((options && options.foreignPatterns) || []).map(asGlobal).filter(Boolean)
  const seen = new Map()
  let unreferenced = 0
  let ignored = 0
  let historical = 0
  for (const commit of commits || []) {
    if (onlyIgnoredPaths(commit && commit.paths, ignorePaths)) {
      // Not counted as unreferenced either: that number exists to surface a
      // MISSED trailer, and a paperwork commit is not a gap someone should hunt.
      ignored++
      continue
    }
    const refs = [...new Set(refsInBody(commit && commit.body, refPattern))]
    if (!refs.length) {
      // A POSITIVE signal, never an absence: only a trailer that actually
      // carries an older tracker's ref makes a commit historical. A commit with
      // no trailer at all is still the gap `unreferenced` is there to name.
      if (foreign.some((p) => refsInBody(commit && commit.body, p).length)) historical++
      else unreferenced++
      continue
    }
    for (const ref of refs) seen.set(ref, (seen.get(ref) || 0) + 1)
  }
  const report = {
    tickets: [...seen.entries()].map(([ref, count]) => ({ ref, commits: count })),
    unreferenced,
    ignored,
    total: (commits || []).length,
  }
  if (foreign.length) report.historical = historical
  return report
}

/**
 * Name the spec behind each ticket a range contains, so a consumer can act on
 * a release without a second lookup.
 *
 * A ref no spec has stamped keeps `spec: null` and `url: null` — never a guess
 * from a similar folder name. It may be tracker-only work, or a typo in a
 * trailer, and a consumer acting on an invented match is worse than one told
 * there was none.
 *
 * Pure: it takes the spec list as data (`listSpecs` rows), so it is testable
 * without a repo.
 */
function nameTickets(tickets, specs) {
  const byRef = new Map()
  for (const s of specs || []) {
    if (s && s.identifier && !byRef.has(s.identifier)) byRef.set(s.identifier, s)
  }
  return (tickets || []).map((t) => {
    const s = byRef.get(t.ref)
    return { ...t, spec: s ? s.spec : null, url: s ? s.url || null : null }
  })
}

// The answer a removed release verb gives (`release`, `stage`). Exit 1, not a
// quiet 0: a pipeline still calling one must learn it no longer mirrors
// anything, rather than go on believing it does.
function refuseRemovedVerb(out, program, verb) {
  out.write(
    `${program} ${verb}: removed — skitterspec no longer writes release or deploy state; ` +
      `\`${program} released <range> --json\` lists the tickets a range contains, for your own tooling to act on\n`,
  )
  return 1
}

module.exports = {
  ticketsInRange,
  refuseRemovedVerb,
  nameTickets,
  refsInBody,
  onlyIgnoredPaths,
  IDENTIFIER_RE,
  GITHUB_REF_RE,
}
