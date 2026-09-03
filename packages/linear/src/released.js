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

module.exports = { ticketsInRange, refsInBody }
