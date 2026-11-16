'use strict'

const { globToRegExp } = require('./glob.js')

/**
 * Decide a list of `{ run, when }` command entries against the files a change
 * brings in — shared by `afterLand` (a land) and `live.afterSwitch` (a live
 * switch), which are the same question asked about two different moves.
 *
 * `range` is those files: a list (possibly empty) when known, null when it is
 * not. Each entry gets a decision — `always` (no `when`), `matched` (with the
 * first path that hit), `skipped`, or `unknown` — and `commands` is every entry
 * but the skipped ones, in config order.
 *
 * AN UNKNOWN RANGE RUNS THE CONDITIONAL ENTRIES. A move made elsewhere, or a
 * diff git would not answer, says nothing about what changed, and only one
 * reading is harmless: a redundant generate costs seconds, a skipped one leaves
 * the tree broken with nothing pointing at why (`.claude/rules/negative-checks.md`
 * rule 4). An EMPTY known range is not unknown — a change that touches no files
 * is healthy, and it skips them.
 */
function planTriggered(raw, cwd, range = null) {
  const list = Array.isArray(raw) ? raw : []
  const entries = list.map((e) => decide(asEntry(e), range))
  const commands = entries.filter((e) => e.decision !== 'skipped').map((e) => e.run)
  return { cwd: entries.length ? cwd : null, commands, entries, range }
}

function decide(entry, range) {
  if (!entry.when) return { ...entry, decision: 'always', matched: null }
  if (range === null) return { ...entry, decision: 'unknown', matched: null }
  const res = entry.when.map(globToRegExp)
  const matched = range.find((f) => res.some((r) => r.test(f)))
  return matched === undefined
    ? { ...entry, decision: 'skipped', matched: null }
    : { ...entry, decision: 'matched', matched }
}

// Normalised config holds `{ run, when }`; a pure caller may still hand over
// the plain string an entry is written as.
function asEntry(entry) {
  return typeof entry === 'string' ? { run: entry, when: null } : { run: entry.run, when: entry.when || null }
}

// The empty form: a blocked or no-op plan, where nothing moved and nothing follows.
function noTriggered() {
  return { cwd: null, commands: [], entries: [], range: null }
}

module.exports = { planTriggered, noTriggered }
