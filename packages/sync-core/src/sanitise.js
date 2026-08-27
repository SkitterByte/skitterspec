'use strict'

/**
 * One-time sanitiser: rewrite spec markdown so no inline emphasis or link span
 * straddles a hard line break, and repair any Linear-mangled `****` artifacts
 * already committed. This brings hand-wrapped spec files "inline" so they round-
 * trip through Linear cleanly (Linear mangles a straddling `**`/`*`/link on save).
 *
 * Deliberately minimal-diff: only a block that actually contains a straddle or a
 * mangle is reflowed — every other paragraph, table, code fence, and heading is
 * left byte-for-byte untouched. A reflowed block is re-wrapped emphasis-aware to
 * the file's own inferred width, so spans stay whole. Idempotent: a second run is
 * a no-op.
 *
 * Pure string→string (`sanitizeSpecMarkdown`); the CLI wraps it with fs walking.
 */

const { wrapEmphasisAware, collapseHyphenAware, inferWidth, DEFAULT_WIDTH } = require('./task-block.js')
const { joinEmphasisAcrossBreaks } = require('./normalize.js')

// A run of non-blank lines contains an emphasis straddle / mangle iff joining
// spans across breaks changes it.
function hasStraddle(text) {
  return joinEmphasisAcrossBreaks(text) !== text
}

// Turn a multi-line region into its clean single logical line: repair mangles and
// join straddles first (needs the newlines), then collapse whitespace — hyphen-
// aware, so a compound wrapped at the hyphen isn't spaced out.
function cleanLogicalLine(text) {
  return collapseHyphenAware(joinEmphasisAcrossBreaks(text))
}

// A bullet line: indent, marker (`- `, `* `, `+ `, `1. `, optionally a `[ ]`/`[x]`
// checkbox), then the text.
const BULLET_RE = /^(\s*)((?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?)(.*)$/
// Structural blocks we never reflow.
const PASSTHROUGH_RE = /^\s*(#{1,6}\s|>|\||[-*_]{3,}\s*$|<)/
// A GFM table separator row (only pipes/colons/dashes/spaces, with a pipe AND a
// dash). Detecting a table by this — not by any stray `|` — so a pipe inside an
// inline `code|span` doesn't make us treat a whole list as an untouchable table.
const TABLE_SEP_RE = /^[\s|:-]*\|[\s|:-]*-[\s|:-]*$|^[\s|:-]*-[\s|:-]*\|[\s|:-]*$/

// Split a block (consecutive non-blank lines) into items when it's a list; each
// item is its bullet line plus more-indented continuation lines.
function splitListItems(block) {
  const items = []
  let cur = null
  for (const line of block) {
    if (BULLET_RE.test(line)) {
      cur = [line]
      items.push(cur)
    } else if (cur) {
      cur.push(line) // continuation of the current bullet
    } else {
      return null // leading non-bullet line — not a clean list block
    }
  }
  return items
}

// Reflow one bullet item (raw lines) to width, emphasis-aware. Returns the item's
// lines unchanged when it carries no straddle.
function sanitizeItem(itemLines, width) {
  const raw = itemLines.join('\n')
  if (!hasStraddle(raw)) return { lines: itemLines, fixed: false }
  const m = BULLET_RE.exec(itemLines[0])
  const indent = m[1]
  const marker = m[2]
  const firstPrefix = indent + marker
  const hang = ' '.repeat(firstPrefix.length)
  // Body = the item's text (first line after the marker + continuations).
  const bodyRaw = [m[3], ...itemLines.slice(1)].join('\n')
  const body = cleanLogicalLine(bodyRaw)
  return { lines: wrapEmphasisAware(body, { firstPrefix, hang, width }), fixed: true }
}

// Reflow a plain prose paragraph (raw lines) to width, preserving its leading
// indent. Unchanged when it carries no straddle.
function sanitizeProse(block, width) {
  const raw = block.join('\n')
  if (!hasStraddle(raw)) return { lines: block, fixed: false }
  const indent = (/^(\s*)/.exec(block[0]) || ['', ''])[1]
  const body = cleanLogicalLine(raw)
  return { lines: wrapEmphasisAware(body, { firstPrefix: indent, hang: indent, width }), fixed: true }
}

/**
 * Sanitise one markdown document.
 * @returns {{ text:string, changed:boolean, fixes:number }} fixes = blocks/items reflowed.
 */
function sanitizeSpecMarkdown(text, { width } = {}) {
  const src = String(text)
  const lines = src.split('\n')
  const w = width || inferWidth(lines) || DEFAULT_WIDTH
  const out = []
  let i = 0
  let fixes = 0
  while (i < lines.length) {
    const line = lines[i]
    // Fenced code — copy verbatim through the closing fence.
    if (/^[ \t]*```/.test(line)) {
      out.push(line)
      i++
      while (i < lines.length && !/^[ \t]*```/.test(lines[i])) out.push(lines[i++])
      if (i < lines.length) out.push(lines[i++])
      continue
    }
    if (!line.trim()) {
      out.push(line)
      i++
      continue
    }
    // Gather a block of consecutive non-blank, non-fence lines.
    let j = i
    while (j < lines.length && lines[j].trim() && !/^[ \t]*```/.test(lines[j])) j++
    const block = lines.slice(i, j)
    i = j

    // Never reflow structural blocks (headings, tables, quotes, rules, HTML).
    if (PASSTHROUGH_RE.test(block[0]) || block.some((l) => TABLE_SEP_RE.test(l))) {
      out.push(...block)
      continue
    }

    const items = BULLET_RE.test(block[0]) ? splitListItems(block) : null
    if (items) {
      for (const it of items) {
        const r = sanitizeItem(it, w)
        out.push(...r.lines)
        if (r.fixed) fixes++
      }
    } else {
      const r = sanitizeProse(block, w)
      out.push(...r.lines)
      if (r.fixed) fixes++
    }
  }
  const result = out.join('\n')
  return { text: result, changed: result !== src, fixes }
}

module.exports = { sanitizeSpecMarkdown, hasStraddle }
