'use strict'

/**
 * Compare what the tracker STORED against what we sent, and report lost text.
 *
 * Why this is not a pull. One-way sync's rule is about **authority**: the
 * tracker must never influence repo content. This reads a description back to
 * *check* it — it merges nothing, writes nothing, and feeds nothing into the
 * projection or the snapshot. The repo remains the only source of truth; the
 * only output is a warning for a human. Without it, a parser that silently eats
 * characters produces a mirror that looks pushed and is wrong, which is exactly
 * how the nested-table corruption went unnoticed (see the Linear provider's
 * dialect, where that flattener now lives).
 *
 * The engine is offline, so the read itself belongs to the push skill — it
 * fetches over MCP and hands the result here, the same split
 * `--workspace-states` already uses.
 *
 * Each tracker reserialises text its own way, so the reduction that makes its
 * benign transforms invisible is the provider's `config.dialect.canonicalForCompare`
 * (see `src/dialect.js`); with no dialect the identity reduction applies.
 *
 * Pure: no I/O, no clock, no randomness.
 */

const { dialectOf } = require('./dialect.js')

// The word-character stream: everything that carries meaning, with every
// reformatting artefact (whitespace, bullets, asterisk boundaries, pipes,
// separators) removed. Comparing these catches dropped characters while
// ignoring every benign transform the dialect names.
function stream(text, config) {
  return dialectOf(config).canonicalForCompare(text).replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * @param {string} sent    what we pushed
 * @param {string} stored  what the tracker returned
 * @param {object} [config] the provider config (for its dialect)
 * @returns {{ok:boolean, at:number|null, lost:number, sentContext:string, storedContext:string}}
 *   `ok` false means word characters differ — content was lost or altered.
 *   `at` is the index in the reduced stream where they first diverge, with ~40
 *   characters of each side around it so the warning names the damage.
 */
// BLIND SPOT: a `stored` the caller never fetched is indistinguishable here
// from a description the tracker really did store empty — both reduce to `''`
// and read as total loss. The evidence that the read happened lives with the
// caller, so it must pass only a description it actually read back (`verifyLines`
// gates on `typeof stored.issue === 'string'` for exactly this reason).
function compareStored(sent, stored, config) {
  const a = stream(sent, config)
  const b = stream(stored, config)
  if (a === b) return { ok: true, at: null, lost: 0, sentContext: '', storedContext: '' }

  let at = 0
  while (at < a.length && at < b.length && a[at] === b[at]) at++
  const window = (s) => s.slice(Math.max(0, at - 10), at + 30)
  return {
    ok: false,
    at,
    lost: a.length - b.length,
    sentContext: window(a),
    storedContext: window(b),
  }
}

module.exports = { compareStored, stream }
