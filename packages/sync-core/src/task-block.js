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
// A list-marker line (unordered or ordered). Distinguished from other block
// breaks because a wrapped continuation can legitimately begin with one.
const LIST_MARKER_RE = /^[ \t]*(?:[-*+]|\d+\.)\s/

// Collapse a wrapped bullet's lines into the single logical line the rest of the
// sync engine (and Linear) works in.
function collapse(text) {
  return String(text).replace(/\s+/g, ' ').trim()
}

// Like `collapse`, but a word wrapped at a hyphen (`state-entry-with-`⏎
// `assignment`) rejoins TIGHT — one compound — instead of gaining a space. Every
// other break collapses to a single space. Use this wherever hand-wrapped prose
// is flattened to one logical line, so a hard wrap at a hyphen isn't data loss.
function collapseHyphenAware(text) {
  return String(text)
    .replace(/(\w-)[ \t]*\n[ \t]*(?=\w)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// Mark every character of `body` that lies inside an inline emphasis or link
// span — `**bold**`, `*italic*`, `[text](url)` — so wrapping can avoid breaking
// one across a line (Linear mangles a straddling `**`/`*`/link on save). Code
// spans are exempt (Linear only rejoins them, harmlessly) but their contents are
// neutralised first so a `*` inside code can't spoof an italic marker.
function spanMask(body) {
  const mask = new Array(body.length).fill(false)
  // Neutralise code-span contents to same-length filler (indices stay aligned).
  const chars = body.split('')
  let m
  const codeRe = /`[^`]*`/g
  while ((m = codeRe.exec(body)) !== null) {
    for (let i = m.index; i < m.index + m[0].length; i++) chars[i] = 'x'
  }
  let masked = chars.join('')
  const cover = (re) => {
    re.lastIndex = 0
    let mm
    while ((mm = re.exec(masked)) !== null) {
      for (let i = mm.index; i < mm.index + mm[0].length; i++) mask[i] = true
      if (mm[0].length === 0) re.lastIndex++
    }
  }
  cover(/\*\*.+?\*\*/g) // bold
  cover(/\[[^\]]*\]\([^)]*\)/g) // link
  // Neutralise the bold/link spans already found, so their asterisks aren't
  // reused when scanning for single-`*` italics.
  const m2 = masked.split('')
  for (let i = 0; i < mask.length; i++) if (mask[i]) m2[i] = 'x'
  masked = m2.join('')
  cover(/\*[^*]+?\*/g) // italic
  return mask
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
    // The hanging indent: where the bullet's text starts (marker width). A
    // continuation aligns AT this column; a genuine nested bullet is SHALLOWER.
    const hang = lines[i].length - m[3].length
    let j = i + 1
    for (; j < lines.length; j++) {
      const l = lines[j]
      if (!l.trim()) break
      if (!CONTINUATION_RE.test(l)) break
      if (BLOCK_BREAK_RE.test(l)) {
        // A list-marker line is a real nested/sibling bullet only when indented
        // shallower than the hanging indent. AT/after it, a line beginning with
        // -/*/+/N. is wrapped continuation text, not a new bullet — keep it (else
        // the task is truncated and its stamped id no longer matches, which makes
        // the next push create a duplicate issue). Headings, quotes, tables and
        // fences always break.
        const indent = l.length - l.trimStart().length
        if (!LIST_MARKER_RE.test(l) || indent < hang) break
      }
      parts.push(l.trim())
    }
    blocks.push({
      start: i,
      end: j,
      indent: m[1],
      mark: m[2].toLowerCase() === 'x' ? 'x' : ' ',
      text: collapseHyphenAware(parts.join('\n')),
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
// Wrap `body` (a single logical line) into file lines, emphasis-aware: a break is
// only taken at a word gap that lies OUTSIDE every `**`/`*`/link span, so an
// emphasis run never straddles a line (Linear mangles one that does). The first
// line is prefixed with `firstPrefix`, continuations with `hang`. An over-width
// single span overflows rather than being split.
function wrapEmphasisAware(body, { firstPrefix = '', hang = '', width = DEFAULT_WIDTH } = {}) {
  const mask = spanMask(body)
  const words = body.split(' ')
  // The index in `body` of the space that precedes each word.
  const spaceBefore = []
  let pos = 0
  for (let k = 0; k < words.length; k++) {
    if (k > 0) {
      spaceBefore[k] = pos
      pos += 1
    }
    pos += words[k].length
  }

  const out = []
  let line = firstPrefix
  let first = true
  for (let k = 0; k < words.length; k++) {
    const word = words[k]
    // Break only at a safe gap; a gap inside a span overflows instead of
    // splitting it (so an over-width single span stays whole on one line).
    const canBreak = k > 0 && !mask[spaceBefore[k]]
    if (!first && canBreak && line.length + 1 + word.length > width) {
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

function renderTaskBlock({ indent = '', done, text, id }, width = DEFAULT_WIDTH) {
  const opener = `${indent}- [${done ? 'x' : ' '}] `
  const hang = ' '.repeat(opener.length)
  const body = collapse(text) + (id ? ` (${id})` : '')
  return wrapEmphasisAware(body, { firstPrefix: opener, hang, width })
}

// Infer the wrap width a file already uses, so a rewrite doesn't reflow it to a
// different column. Only *prose* lines count — a single wide table row or a long
// line of fenced code would otherwise pull the whole file's prose to a wider
// column than the author wrapped at. Falls back to the default when there's
// nothing prose-like to learn from.
function inferWidth(lines, fallback = DEFAULT_WIDTH) {
  let inFence = false
  const widths = []
  for (const l of lines) {
    if (/^[ \t]*```/.test(l)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (!l.trim()) continue
    if (l.includes('|')) continue // table row
    widths.push(l.length)
  }
  if (!widths.length) return fallback
  const max = Math.max(...widths)
  return max > 40 && max <= 120 ? Math.max(max, 60) : fallback
}

module.exports = {
  findTaskBlocks,
  renderTaskBlock,
  wrapEmphasisAware,
  spanMask,
  collapse,
  collapseHyphenAware,
  inferWidth,
  DEFAULT_WIDTH,
}
