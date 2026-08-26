'use strict'

// Task bullets in a phase file are hand-wrapped prose, not single lines:
//
//   - [x] Add `DbProcessEventOutbox` to `prisma/schema.prisma`, modelled on
//         `DbNotificationOutbox`: status, attempts, `nextAttemptAt`, …
//
// A Linear issue title is single-line, so the two representations differ by
// wrapping alone. This module is the one place that converts between them:
// `findTaskBlocks` reads wrapped bullets into logical tasks, `renderTaskBlock`
// writes a logical task back out re-wrapped in the file's own style.
//
// Everything here is line-index based so callers can splice whole blocks.

const DEFAULT_WIDTH = 80

// Start of a task bullet. The continuation lines that follow are any indented,
// non-empty lines that are not themselves a bullet or heading.
const TASK_START_RE = /^([ \t]*)-\s*\[([ xX])\]\s*(.*)$/
const CONTINUATION_RE = /^[ \t]+\S/
const BLOCK_BREAK_RE = /^[ \t]*(?:[-*+]\s|\d+\.\s|#{1,6}\s|>|\||```)/

// Collapse a wrapped bullet's lines into the single logical line the rest of the
// sync engine (and Linear) works in.
function collapse(text) {
  return String(text).replace(/\s+/g, ' ').trim()
}

/**
 * Find every task bullet in `lines` as a logical block.
 * @returns {Array<{start:number, end:number, indent:string, mark:string, text:string}>}
 *   `end` is exclusive. `text` is the collapsed single-line form, id included.
 */
function findTaskBlocks(lines) {
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    const m = TASK_START_RE.exec(lines[i])
    if (!m) continue
    const parts = [m[3]]
    let j = i + 1
    for (; j < lines.length; j++) {
      const l = lines[j]
      if (!l.trim()) break
      if (!CONTINUATION_RE.test(l)) break
      if (BLOCK_BREAK_RE.test(l)) break
      parts.push(l.trim())
    }
    blocks.push({
      start: i,
      end: j,
      indent: m[1],
      mark: m[2].toLowerCase() === 'x' ? 'x' : ' ',
      text: collapse(parts.join(' ')),
    })
    i = j - 1
  }
  return blocks
}

/**
 * Render a logical task back into wrapped file lines, matching the surrounding
 * style: `- [x] ` opener, continuations aligned under the text.
 * @returns {string[]}
 */
function renderTaskBlock({ indent = '', done, text, id }, width = DEFAULT_WIDTH) {
  const opener = `${indent}- [${done ? 'x' : ' '}] `
  const hang = ' '.repeat(opener.length)
  const body = collapse(text) + (id ? ` (${id})` : '')

  const out = []
  let line = opener
  let first = true
  for (const word of body.split(' ')) {
    if (!first && line.length + 1 + word.length > width) {
      out.push(line)
      line = hang + word
    } else {
      line += (first ? '' : ' ') + word
      first = false
    }
  }
  out.push(line)
  return out
}

// Infer the wrap width a file already uses, so a rewrite doesn't reflow it to a
// different column. Falls back to the default when there's nothing to learn from.
function inferWidth(lines, fallback = DEFAULT_WIDTH) {
  const widths = lines.filter((l) => l.trim()).map((l) => l.length)
  if (!widths.length) return fallback
  const max = Math.max(...widths)
  return max > 40 && max <= 120 ? Math.max(max, 60) : fallback
}

module.exports = { findTaskBlocks, renderTaskBlock, collapse, inferWidth, DEFAULT_WIDTH }
