'use strict'

/**
 * Which tickets a release contains.
 *
 * The repo lands specs with `merge --ff-only`, so history is linear and branch
 * names never reach it. A commit's `Refs:` trailer is therefore the only place
 * the ticket survives into the range a release scans — see the
 * `commit-trailers` rule.
 *
 * The parsing half is pure and takes commits as data, so the rules below are
 * testable without git. Reading the range, and enriching refs with issue titles,
 * belong to the caller.
 */

// An issue identifier: uppercase team key, dash, number.
const IDENTIFIER_RE = /\b[A-Z][A-Z0-9]*-\d+\b/g
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
function refsInBody(body) {
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
    for (const id of m[1].match(IDENTIFIER_RE) || []) found.push(id)
  }
  return found
}

/**
 * Fold commits into the report a release needs.
 *
 * @param {Array<{sha?:string, subject?:string, body?:string}>} commits
 * @returns {{tickets: Array<{ref:string, commits:number}>, unreferenced:number, total:number}}
 *   `tickets` is deduped in FIRST-SEEN order: a ticket touched by eight commits
 *   is listed once, where it first appears, not eight times.
 */
function ticketsInRange(commits) {
  const seen = new Map()
  let unreferenced = 0
  for (const commit of commits || []) {
    const refs = [...new Set(refsInBody(commit && commit.body))]
    if (!refs.length) {
      unreferenced++
      continue
    }
    for (const ref of refs) seen.set(ref, (seen.get(ref) || 0) + 1)
  }
  return {
    tickets: [...seen.entries()].map(([ref, count]) => ({ ref, commits: count })),
    unreferenced,
    total: (commits || []).length,
  }
}

/**
 * Split a release's tickets into the ones a stage move may touch and the ones it
 * must not, with a reason for every exclusion.
 *
 * Three reasons to leave a ticket alone, and each is a case where acting would
 * be worse than not acting:
 *
 *   - **foreign** — the ref is not this repo's team. A range can carry another
 *     team's ref (a shared dependency, a quoted ticket), and writing to a team
 *     this repo was never configured for is the worst failure available here.
 *   - **unlinked** — the ref is this team's, but no spec in the repo claims it.
 *     It may be tracker-only work, or a typo in a trailer. Either way nothing
 *     here knows what it is, so it is reported, not moved.
 *   - **unfinished** — a spec that has not reached the ceded bucket. Its code
 *     really is in the release (it landed via `/spec-to-main`), but push still
 *     owns its workflow state and would bounce it straight back. Exactly one
 *     writer per issue at any moment beats a visible flip-flop.
 *
 * Pure: it takes the spec list as data, so the rules are testable without a repo.
 */
function partitionStageMoves({ tickets, teamKey, specs, cededBucket = 'complete' }) {
  const bucketOf = new Map()
  for (const spec of specs || []) {
    if (spec && spec.identifier) bucketOf.set(spec.identifier, spec.bucket)
  }
  const key = String(teamKey || '').trim().toUpperCase()
  const movable = []
  const foreign = []
  const unlinked = []
  const unfinished = []
  for (const ticket of tickets || []) {
    const ref = ticket && ticket.ref
    if (!ref) continue
    if (key && !ref.toUpperCase().startsWith(`${key}-`)) {
      foreign.push(ticket)
    } else if (!bucketOf.has(ref)) {
      unlinked.push(ticket)
    } else if (bucketOf.get(ref) !== cededBucket) {
      unfinished.push({ ...ticket, bucket: bucketOf.get(ref) })
    } else {
      movable.push(ticket)
    }
  }
  return { movable, foreign, unlinked, unfinished }
}

/**
 * Whether moving from `fromState` to the rung `toKey` runs against the declared
 * order — and if so, how to say it.
 *
 * WARNS, never refuses. A rollback from test and a hotfix going straight to prod
 * are both legitimate, and a check that blocked either would be wrong on healthy
 * input. An issue that is on no rung yet is entering the ladder, which is the
 * normal case and says nothing.
 *
 * `lifecycleStates` is the bucket map's own state names, and a state among them
 * means the issue is at its LIFECYCLE position, not on a rung — even when the
 * two names coincide. They routinely do: `states.complete` and a final `prod`
 * rung are both naturally "Done", and without this a spec that had merely been
 * completed would read as already deployed to prod, so its first real deploy
 * would be warned about as a move backwards. Bucket wins over ladder here for
 * the same reason it wins in `bucketForState`.
 *
 * @returns {string|null}
 */
function stageOrderWarning(stages, fromState, toKey, lifecycleStates = []) {
  const list = Array.isArray(stages) ? stages : []
  const to = list.findIndex((s) => s && s.key === toKey)
  if (to < 0) return null
  const want = String(fromState || '').toLowerCase().trim()
  if (!want) return null
  const lifecycle = new Set(
    (Array.isArray(lifecycleStates) ? lifecycleStates : [])
      .filter((n) => typeof n === 'string')
      .map((n) => n.toLowerCase().trim()),
  )
  if (lifecycle.has(want)) return null
  const from = list.findIndex((s) => s && typeof s.state === 'string' && s.state.toLowerCase().trim() === want)
  if (from < 0) return null
  if (to < from) return `moves back from "${list[from].key}"`
  if (to > from + 1) return `skips ${to - from - 1} rung(s) from "${list[from].key}"`
  return null
}

module.exports = { ticketsInRange, refsInBody, partitionStageMoves, stageOrderWarning }
