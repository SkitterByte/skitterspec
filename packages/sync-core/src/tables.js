'use strict'

/**
 * Flatten markdown tables that sit INSIDE a list item, because Linear corrupts
 * them.
 *
 * Measured on probe SKI-28 (2026-08-28): when Linear renders a table nested in a
 * list item, every **data** cell loses its first N characters, where N is the
 * list-content indent Linear renders at — 3 per ordered-list level, 2 per bullet
 * level — regardless of the indent the source used. Source indents 3, 4 and 6
 * all lose exactly 3. The header row is never touched, column-0 tables never
 * corrupt, and the column count is irrelevant. Real damage from the field: the
 * auth header `X-Extraction-Key` was stored as `Extraction-Key`.
 *
 * The engine passes the table through byte-identically — this is Linear's
 * parser, not ours — but the projection is the only place that can stop the
 * markdown reaching it in a shape it mangles. So nested tables are re-emitted as
 * shapes SKI-28 proved survive nesting unchanged:
 *
 *   - 2 columns  → a bullet list (`- a — b`), the key/value case, and the shape
 *                  the reporter hand-repaired in production
 *   - otherwise  → a fenced code block wrapping the original rows verbatim
 *
 * This shapes the PROJECTION only. Repo files are never rewritten: the source
 * markdown is valid and renders correctly in GitHub and every editor.
 */

const { fenceMask } = require('./task-block.js')

// A table row: optional indent, then a `|`-delimited line. We only ever act on
// indented ones — a column-0 table (the `## Phases` index, every Impact map) is
// rendered correctly by Linear and must project byte-identically.
const ROW_RE = /^([ \t]+)\|(.*)\|[ \t]*$/
// The separator under the header — `|---|:--:|`. Its presence is what makes the
// block a table rather than prose that happens to contain pipes.
const SEPARATOR_RE = /^[ \t]+\|[\s:|-]+\|[ \t]*$/

// Split a row into cells on pipes that are OUTSIDE an inline-code span, so a
// documented `` `a | b` `` alternation stays one cell instead of splitting.
function splitCells(body) {
  const cells = []
  let cur = ''
  let code = false
  for (const ch of body) {
    if (ch === '`') code = !code
    if (ch === '|' && !code) {
      cells.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur.trim())
  return cells
}

/**
 * Rewrite every indented table in `md`. Returns the text unchanged when there is
 * nothing nested to flatten.
 * @param {string} md
 * @returns {string}
 */
function flattenNestedTables(md) {
  if (md == null) return md
  const lines = String(md).split('\n')
  const inFence = fenceMask(lines)
  const out = []

  for (let i = 0; i < lines.length; i++) {
    const header = ROW_RE.exec(lines[i])
    // A table shown as an EXAMPLE inside a ``` block is documentation — often of
    // this very bug — so it is left exactly as written.
    if (!header || inFence[i] || !SEPARATOR_RE.test(lines[i + 1] || '')) {
      out.push(lines[i])
      continue
    }

    const indent = header[1]
    const rows = [splitCells(header[2])]
    const raw = [lines[i], lines[i + 1]]
    let j = i + 2
    for (; j < lines.length && !inFence[j]; j++) {
      const row = ROW_RE.exec(lines[j])
      if (!row) break
      rows.push(splitCells(row[2]))
      raw.push(lines[j])
    }

    if (rows[0].length === 2) {
      // Header first, bolded: dropping it would lose content and inventing a
      // caption would invent it.
      out.push(`${indent}- **${rows[0][0]}** — **${rows[0][1]}**`)
      for (const r of rows.slice(1)) out.push(`${indent}- ${r[0]} — ${r[1]}`)
    } else {
      out.push(`${indent}\`\`\``, ...raw, `${indent}\`\`\``)
    }
    i = j - 1
  }
  return out.join('\n')
}

module.exports = { flattenNestedTables, splitCells }
