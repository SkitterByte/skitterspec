'use strict'

/**
 * The Jira Cloud dialect — how projections are shaped for, and read back from,
 * a tracker that stores ADF rather than markdown.
 *
 * The ADF conversion itself lives in `adf.js` and is applied at the ADAPTER
 * boundary (`api.js`): the engine only ever sees markdown text. What the
 * dialect hooks carry (sync-core `src/dialect.js`):
 *
 *   - `canonicalize` — light markdown canonicalisation of the outbound
 *     projection: bullet markers unify, trailing whitespace and blank runs
 *     collapse. No emphasis surgery — ADF has no straddle mangle to defend
 *     against; the renderer joins soft-wrapped lines itself.
 *   - `flattenTables` — ADF's `listItem` cannot contain a `table` node, so a
 *     table nested in a list item is re-shaped before it reaches the renderer
 *     (shared with the Linear dialect — kit `src/md-tables.js`).
 *   - `canonicalForCompare` — the shared markdown-form reduction (kit
 *     `src/md-compare.js`): read-backs are our own `adfToText` rendering, which
 *     re-emits `-` bullets, renumbered ordered lists and `| -- |` separators
 *     whatever the source spelled, and the reduction makes exactly those
 *     differences invisible.
 */

const { flattenNestedTables } = require('@skitterbyte/skitterspec-provider-kit/src/md-tables.js')
const { markdownCanonicalForCompare } = require('@skitterbyte/skitterspec-provider-kit/src/md-compare.js')

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
  flattenTables: flattenNestedTables,
  canonicalForCompare: markdownCanonicalForCompare,
})

module.exports = { dialect, canonicalizeMarkdown }
