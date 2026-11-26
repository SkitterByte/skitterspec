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

// --- projection ---------------------------------------------------------------

// The heading the open steps carry on a ticket, in place of the author's.
const OPEN_HEADING = 'Manual steps (open)'

const hasOpenStep = (phase) => ((phase && phase.manualSteps) || []).some((s) => !s.done)

// A phase that has started (🔄) or finished (✅). Only these put steps on the
// parent: a step in a phase nobody has started is not actionable, and a Prod
// script on a backlog ticket invites someone to run it before the code ships.
const started = (phase) => phase && (phase.state === 'in-progress' || phase.state === 'complete')

// A fence that cannot be closed early by the script it holds: one backtick
// longer than the longest run inside, never shorter than three.
function fenceFor(body) {
  const runs = String(body).match(/`+/g) || []
  return '`'.repeat(Math.max(3, ...runs.map((r) => r.length + 1)))
}

/**
 * Steps as a markdown checklist, each script a real fenced block under its
 * step — the one form every tracker renders as copyable code. The fence is
 * indented to sit inside its list item, as the author wrote it.
 */
function renderSteps(steps) {
  return (steps || [])
    .map((s) => {
      const parts = [`- [${s.mark}] ${s.text}`]
      for (const c of s.code || []) {
        const fence = fenceFor(c.body)
        const body = c.body
          .split('\n')
          .map((l) => (l ? `  ${l}` : l))
          .join('\n')
        parts.push(`  ${fence}${c.lang}\n${body}\n  ${fence}`)
      }
      return parts.join('\n\n')
    })
    .join('\n\n')
}

/**
 * The parent's open steps, grouped by phase: `[{ phase, number, steps }]` for
 * every STARTED phase with an unticked step, its ticked steps left out. Empty
 * when nothing is open — the caller then emits nothing at all, so a spec
 * without the section projects exactly as it always has.
 */
function openStepsByPhase(phases) {
  const list = (phases || []).filter((p) => p && p.name)
  return list
    .map((p, i) => ({ phase: p, number: i + 1, steps: (p.manualSteps || []).filter((s) => !s.done) }))
    .filter((g) => g.steps.length && started(g.phase))
}

const groupLabel = (g) => `Phase ${g.number} — ${g.phase.name}`

// The parent description's section (spec mode): `##` with a `###` per phase.
function openStepsSection(phases) {
  const groups = openStepsByPhase(phases)
  if (!groups.length) return ''
  return [`## ${OPEN_HEADING}`, ...groups.map((g) => `### ${groupLabel(g)}\n\n${renderSteps(g.steps)}`)].join('\n\n')
}

// The same for a summary block, which carries bold labels rather than headings.
function openStepsBlock(phases) {
  const groups = openStepsByPhase(phases)
  if (!groups.length) return ''
  return [`**${OPEN_HEADING}**`, ...groups.map((g) => `*${groupLabel(g)}*\n\n${renderSteps(g.steps)}`)].join('\n\n')
}

// A phase's own summary block: its open steps, started or not — the phase
// block is that phase's own ticket, as the hoisted section is (Decision 3).
function phaseOpenStepsBlock(phase) {
  const open = ((phase && phase.manualSteps) || []).filter((s) => !s.done)
  return open.length ? `**${OPEN_HEADING}**\n\n${renderSteps(open)}` : ''
}

/**
 * The order to emit a phase file's lines in, as original line indexes (`-1`
 * is an added blank line), with the `## Manual steps` section moved up under
 * the Goal while any step is open, and `heading` the index of the section's
 * heading line, which the caller retitles. `null` when nothing moves — no section, every step ticked, or the
 * section already first — so the caller's walk is the one it always was.
 *
 * "Under the Goal" is before the first `##` heading that is not `## Goal`: a
 * phase file opens with its h1, status line and goal, then its sections.
 */
function hoistOrder(lines, phase) {
  if (!hasOpenStep(phase)) return null
  const inFence = fenceMask(lines)
  const range = manualStepsRange(lines, inFence)
  if (!range) return null
  const at = lines.findIndex((l, i) => !inFence[i] && /^##\s/.test(l) && !/^##\s+Goal\s*$/i.test(l))
  if (at === -1 || at >= range.start) return null
  const idx = lines.map((_, i) => i)
  const section = idx.slice(range.start, range.end)
  // The section's own trailing blank lines stay with it, and a blank line
  // separates it from the section it now precedes.
  return {
    order: [...idx.slice(0, at), ...section, -1, ...idx.slice(at, range.start), ...idx.slice(range.end)],
    heading: range.start,
  }
}

module.exports = {
  OPEN_HEADING,
  parseManualSteps,
  manualStepsRange,
  renderSteps,
  openStepsByPhase,
  openStepsSection,
  openStepsBlock,
  phaseOpenStepsBlock,
  hoistOrder,
}
