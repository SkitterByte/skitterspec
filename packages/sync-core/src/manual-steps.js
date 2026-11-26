'use strict'

/**
 * A phase file's MANUAL STEPS — the steps only a person can do (run SQL on
 * Prod, a KQL query, a shell command, a check in a UI), written under a
 * `## Manual steps` section so the projection can put the open ones on the
 * ticket, where people look (feat-manual-steps-on-ticket).
 *
 *   ## Manual steps
 *
 *   - [ ] On Prod, grant the override permission:
 *
 *     ```sql
 *     INSERT INTO permissions (code) VALUES ('order-line-override');
 *     ```
 *
 *   - [ ] Confirm the override button appears for an admin
 *
 * The section is the ONLY signal. A phase that writes its manual steps inline
 * among its tasks, the way every spec did before this existed, yields no steps
 * at all: guessing at "by hand" prose would accuse healthy specs, and their
 * projection must stay byte-identical (`.claude/rules/negative-checks.md`
 * rules 1 and 3).
 *
 * Pure: no I/O.
 */

const { fenceMask, findTaskBlocks } = require('./task-block.js')

const SECTION_RE = /^##\s+Manual steps\s*$/i
// Any heading at `##` or above closes the section; a `###` inside it is the
// author's own structure and stays in.
const SECTION_END_RE = /^#{1,2}\s/
const FENCE_OPEN_RE = /^([ \t]*)(`{3,}|~{3,})(.*)$/

/**
 * Where the section sits in `lines`: `{ start, end }` with `start` the heading
 * line and `end` one past its last line, or null when there is none. A heading
 * shown inside a fence is an example, not the section.
 */
function manualStepsRange(lines, inFence = fenceMask(lines)) {
  const start = lines.findIndex((l, i) => !inFence[i] && SECTION_RE.test(l))
  if (start === -1) return null
  let end = start + 1
  while (end < lines.length && (inFence[end] || !SECTION_END_RE.test(lines[end]))) end++
  return { start, end }
}

// The fenced block opening at `i`: its info string's first word, and its body
// with the opener's indent taken off every line (the block sits under a list
// item, and that indent is the list's, not the script's).
// The closer is found the way `fenceMask` finds it (same character, at least
// the opener's length), so two fences back to back stay two blocks.
function fenceAt(lines, i) {
  const m = FENCE_OPEN_RE.exec(lines[i])
  const indent = m[1].length
  const marker = m[2]
  const lang = m[3].trim().split(/\s+/)[0] || ''
  const body = []
  let j = i + 1
  for (; j < lines.length; j++) {
    const t = lines[j].trim()
    if (/^(`{3,}|~{3,})$/.test(t) && t[0] === marker[0] && t.length >= marker.length) {
      j++
      break
    }
    const lead = lines[j].length - lines[j].trimStart().length
    body.push(lines[j].slice(Math.min(lead, indent)))
  }
  return { block: { lang, body: body.join('\n') }, next: j }
}

/**
 * The phase's manual steps, in file order:
 * `[{ text, mark, done, code: [{ lang, body }] }]`. Empty when the phase has
 * no `## Manual steps` section, or the section holds no checkbox.
 *
 * A step is a checkbox at the section's outermost checkbox indent; a nested
 * checkbox is part of the step above it, not a step of its own. Every fenced
 * block between one step and the next is that step's code. `done` follows the
 * task parser: only `x` is done, and `[~]`, `[>]`, `[-]` are open.
 */
function parseManualSteps(lines) {
  const inFence = fenceMask(lines)
  const range = manualStepsRange(lines, inFence)
  if (!range) return []
  const boxes = findTaskBlocks(lines).filter((b) => b.checkbox && b.start > range.start && b.start < range.end)
  if (!boxes.length) return []
  const outer = Math.min(...boxes.map((b) => b.indent.length))
  const openers = boxes.filter((b) => b.indent.length === outer)
  return openers.map((b, k) => {
    const stop = k + 1 < openers.length ? openers[k + 1].start : range.end
    const code = []
    for (let i = b.end; i < stop; ) {
      if (inFence[i] && FENCE_OPEN_RE.test(lines[i])) {
        const { block, next } = fenceAt(lines, i)
        code.push(block)
        i = next
      } else {
        i++
      }
    }
    return { text: b.text, mark: b.mark, done: b.mark === 'x', code }
  })
}

module.exports = { parseManualSteps, manualStepsRange }
