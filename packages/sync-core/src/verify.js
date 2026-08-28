'use strict'

/**
 * Compare what Linear STORED against what we sent, and report lost text.
 *
 * Why this is not a pull. One-way sync's rule is about **authority**: Linear
 * must never influence repo content. This reads a description back to *check*
 * it — it merges nothing, writes nothing, and feeds nothing into the projection
 * or the snapshot. The repo remains the only source of truth; the only output is
 * a warning for a human. Without it, a parser that silently eats characters
 * produces a mirror that looks pushed and is wrong, which is exactly how the
 * nested-table corruption went unnoticed (see `tables.js`).
 *
 * The engine is offline, so the read itself belongs to the `/spec-push` skill —
 * it fetches over MCP and hands the result here, the same split
 * `--workspace-states` already uses.
 *
 * Pure: no I/O, no clock, no randomness.
 */

// Linear reserialises markdown on save. These transforms are all observed and
// all harmless, so they are normalised away BEFORE comparing — otherwise every
// push would report a false divergence.
function canonicalForCompare(text) {
  return String(text == null ? '' : text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        // Ordered-list markers → a placeholder. Linear renumbers lists, and the
        // digits it rewrites are alphanumeric, so a naive alphanumeric compare
        // would flag its own benign reformat as data loss. Normalising the
        // marker keeps digits significant EVERYWHERE ELSE — a port, a version, a
        // key length still count.
        .replace(/^(\s*)\d+\.(\s)/, '$1#.$2')
        // Unordered markers unify (`-`/`+` come back as `*`).
        .replace(/^(\s*)[*+-](\s)/, '$1-$2')
        // Checkbox marks case-fold. Targeted rather than lowercasing the whole
        // text, so a genuine case corruption in prose is still caught.
        .replace(/^(\s*-\s*\[)[xX](\])/, '$1x$2')
        // Table separator rows collapse (`|-------|` → `| -- |`).
        .replace(/^\s*\|[\s:|-]+\|\s*$/, '|--|')
        .replace(/[ \t]+$/, ''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// The word-character stream: everything that carries meaning, with every
// reformatting artefact (whitespace, bullets, asterisk boundaries, pipes,
// separators) removed. Comparing these catches dropped characters while
// ignoring every benign transform above.
function stream(text) {
  return canonicalForCompare(text).replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * @param {string} sent    what we pushed
 * @param {string} stored  what the tracker returned
 * @returns {{ok:boolean, at:number|null, lost:number, sentContext:string, storedContext:string}}
 *   `ok` false means word characters differ — content was lost or altered.
 *   `at` is the index in the reduced stream where they first diverge, with ~40
 *   characters of each side around it so the warning names the damage.
 */
function compareStored(sent, stored) {
  const a = stream(sent)
  const b = stream(stored)
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

module.exports = { compareStored, canonicalForCompare, stream }
