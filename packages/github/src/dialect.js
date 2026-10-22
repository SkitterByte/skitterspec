'use strict'

/**
 * The GitHub dialect — how projections are shaped for, and read back from, a
 * tracker that stores GitHub-flavoured markdown as-is.
 *
 * Near-identity, and that is the point: GitHub keeps an issue body verbatim
 * and renders `- [ ]` task lists natively, so there is no format to convert
 * and no reserialisation mangle to defend against. What the hooks carry
 * (sync-core `src/dialect.js`):
 *
 *   - `canonicalize` — light canonicalisation of the outbound projection:
 *     bullet markers unify, trailing whitespace and blank runs collapse, so
 *     semantically-equal content hashes equal.
 *   - `flattenTables` — NOT supplied. GFM renders a table inside a list item
 *     only when it is indented as the item's continuation, which the
 *     projection already does; nothing here is known to be corrupted, and
 *     re-shaping text that renders fine is a change nobody asked for.
 *   - `canonicalForCompare` — the shared markdown-form reduction (kit
 *     `src/md-compare.js`). GitHub stores what it is sent, so a read-back
 *     differs only where a PERSON edited the body on GitHub — a ticked box
 *     included — and that is drift the next push replaces, loudly.
 */

const { markdownCanonicalForCompare } = require('@skitterbyte/skitterspec-provider-kit/src/md-compare.js')

// GitHub's issue body limit, in characters. A body over it is refused by the
// API with a 422 that names only the field; refusing first names the spec.
const MAX_BODY_CHARS = 65536

function canonicalizeMarkdown(text) {
  if (text == null) return text
  return String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^(\s*)[*+-]( +)/, '$1-$2').replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const dialect = Object.freeze({
  canonicalize: canonicalizeMarkdown,
  canonicalForCompare: markdownCanonicalForCompare,
})

/**
 * Throw a named refusal when a body would exceed GitHub's limit. `what` names
 * the thing being written (a spec, a phase file) so the reader knows which
 * document to trim.
 */
function assertBodyFits(body, what) {
  const n = body == null ? 0 : String(body).length
  if (n > MAX_BODY_CHARS) {
    throw new Error(
      `${what || 'this issue body'} is ${n} characters — GitHub caps an issue body at ` +
        `${MAX_BODY_CHARS}. Trim the document (or move detail into a linked file) and push again.`,
    )
  }
}

module.exports = { dialect, canonicalizeMarkdown, assertBodyFits, MAX_BODY_CHARS }
