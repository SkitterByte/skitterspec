'use strict'

/**
 * The SUMMARY BLOCK — what a ticket carries under `mapping.description:
 * "summary"`. The spec stays in git; the ticket gets a short, delimited block
 * (what the work is, what done looks like, what it touches) and the repo owns
 * that block and nothing else in the description. Text a team writes around it
 * survives every push.
 *
 * Writing it is a SPLICE, not a pull: the live description is read so the
 * block can be replaced in place, and nothing outside the block is parsed,
 * merged, hashed or written back to the spec.
 *
 * Pure: no I/O, no clock, no randomness.
 */

const path = require('node:path')

// The two delimiter styles. `comment` is invisible where the tracker keeps
// HTML comments verbatim (GitHub, measured 2026-11-08); `heading` is the
// fallback where it may not. Which a provider uses is its config's call
// (`summary.delimiter`), never guessed from the text.
const DELIMITERS = Object.freeze({
  comment: Object.freeze({ begin: '<!-- skitterspec:begin -->', end: '<!-- skitterspec:end -->' }),
  heading: Object.freeze({ begin: '## Skitterspec summary', end: '_— end of skitterspec summary —_' }),
})

// `spec` (the whole overview, as before) unless the config says `summary`.
// ABSENT MEANS `spec`, deliberately: a config written before this key existed
// must push exactly what it always pushed, so an upgrade rewrites no ticket.
function descriptionMode(config) {
  const mode = config && config.mapping && config.mapping.description
  return mode === 'summary' ? 'summary' : 'spec'
}

function delimitersFor(config) {
  const style = config && config.summary && config.summary.delimiter
  return DELIMITERS[style] || DELIMITERS.heading
}

const countOf = (text, needle) => text.split(needle).length - 1

/**
 * Where the block sits in a description.
 *
 * THREE STATES, and the third is why this returns more than a boolean:
 *
 *   - `present` — exactly one begin, then exactly one end after it;
 *   - `absent`  — neither delimiter appears;
 *   - `damaged` — anything else: a begin with no end, an end with no begin,
 *     two of either. Someone has edited a delimiter line, and the edges of the
 *     block cannot be told apart from the team's text around it.
 *
 * `damaged` is cannot-tell and every caller routes it to the harmless branch:
 * the description is not written, and no edit is reported. Splicing into it
 * could eat a paragraph that was never the repo's; prepending a second block
 * would leave two (`.claude/rules/negative-checks.md` rule 4).
 */
function blockOf(text, config) {
  const t = typeof text === 'string' ? text : ''
  const { begin, end } = delimitersFor(config)
  const begins = countOf(t, begin)
  const ends = countOf(t, end)
  if (begins === 0 && ends === 0) return { state: 'absent' }
  if (begins !== 1 || ends !== 1) return { state: 'damaged' }
  const start = t.indexOf(begin)
  const close = t.indexOf(end)
  if (close < start) return { state: 'damaged' }
  const stop = close + end.length
  return { state: 'present', start, end: stop, block: t.slice(start, stop) }
}

function wrapBlock(inner, config) {
  const { begin, end } = delimitersFor(config)
  return `${begin}\n${String(inner || '').trim()}\n${end}`
}

/**
 * Put `block` (a whole wrapped block) into `live`, leaving every other byte of
 * `live` as it was. An absent block goes first, above the team's text. Returns
 * null when the existing block is damaged — the caller must not write.
 */
function spliceBlock(live, block, config) {
  const text = typeof live === 'string' ? live : ''
  const at = blockOf(text, config)
  if (at.state === 'damaged') return null
  if (at.state === 'present') return text.slice(0, at.start) + block + text.slice(at.end)
  return text.trim() ? `${block}\n\n${text}` : block
}

/**
 * The part of a tracker description that is the repo's to compare: the whole
 * text in `spec` mode, the block alone in `summary` mode. Null when summary mode
 * finds no intact block — cannot-tell for drift, and the caller decides whether
 * an absent block is a loss (right after a write it is).
 */
function comparableDescription(text, config) {
  if (typeof text !== 'string') return null
  if (descriptionMode(config) !== 'summary') return text
  const at = blockOf(text, config)
  return at.state === 'present' ? at.block : null
}

// --- the block's parts ------------------------------------------------------

function firstParagraph(text) {
  const t = String(text || '').trim()
  if (!t) return ''
  return t.split(/\n\s*\n/)[0].trim()
}

// A markdown table's rows as `{ header: cell }` objects. Header and separator
// rows are consumed; a line that is not a table row ends the table.
function tableRows(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
  if (lines.length < 2) return []
  const cells = (l) =>
    l
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())
  const header = cells(lines[0]).map((h) => h.toLowerCase())
  return lines
    .slice(2)
    .map(cells)
    .map((row) => Object.fromEntries(header.map((h, i) => [h, row[i] || ''])))
}

// The Impact table as one line: each row's Detail, else its Surface. Detail is
// what names the thing (`POST /orders`); Surface alone is its category
// (`Endpoint`), which tells a ticket reader nothing.
function touches(sections) {
  const impact = sections.Impact
  if (!impact) return ''
  const named = tableRows(impact)
    .map((r) => r.detail || r.surface || '')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set(named)].join(' · ')
}

// The value of a `> **Field:** value` header line, or ''.
function headerValue(body, field) {
  const m = String(body || '').match(new RegExp(`^>\\s*\\*\\*${field}:\\*\\*\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : ''
}

// The acceptance criteria as a checklist: every list item becomes `- [ ]`,
// keeping a `[x]` the author ticked. Prose between items is kept as written.
function criteria(sections) {
  const text = sections['Acceptance criteria']
  if (!text) return ''
  return String(text)
    .trim()
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\s*)[-*+]\s+(\[[ xX]\]\s+)?(.*)$/)
      if (!m) return line
      const box = m[2] && /x/i.test(m[2]) ? '[x]' : '[ ]'
      return `${m[1]}- ${box} ${m[3]}`
    })
    .join('\n')
}

// `specs/<bucket>/<name>` — where the spec lives, for a reader who wants more.
function specPath(snapshotDir) {
  const dir = String(snapshotDir || '')
  return ['specs', path.basename(path.dirname(dir)), path.basename(dir)].join('/')
}

/**
 * The spec ticket's block content (unwrapped). Every part is skipped, never
 * invented, when its source is absent — a spec with no Summary, criteria,
 * Impact table or Gating header still gets a block: its Problem and its path.
 */
function specBlockInner({ snapshotDir, sections, body, phases }) {
  const summary =
    String(sections.Summary || '').trim() || firstParagraph(sections.Problem) || firstParagraph(sections.Symptom)
  const parts = []
  if (summary) parts.push(summary)
  const ac = criteria(sections)
  if (ac) parts.push(`**Acceptance criteria**\n\n${ac}`)
  const t = touches(sections)
  if (t) parts.push(`**Touches** ${t}`)
  const gating = headerValue(body, 'Gating')
  if (gating) parts.push(`**Gating** ${gating}`)
  const progress = progressLine(phases)
  if (progress) parts.push(progress)
  parts.push(`**Spec** \`${specPath(snapshotDir)}\``)
  return parts.join('\n\n')
}

// --- progress -----------------------------------------------------------------

// A phase's checkboxes: every task bullet, nested ones included, each counted
// once. Only `x` is done — `[~]`, `[>]`, `[-]` are not (task-block.js).
function taskCounts(phase) {
  const boxes = ((phase && phase.blocks) || []).filter((b) => b && b.checkbox)
  return { ticked: boxes.filter((b) => b.mark === 'x').length, total: boxes.length }
}

/**
 * How far along a spec is, from its phase files' own checkboxes.
 *
 * `null` when there is not a single checkbox anywhere: that is cannot-tell, not
 * 0%. A spec written without task lists has not "made no progress", and a
 * ticket reading 0% for its whole life would say exactly that.
 *
 * `phase` is the one being worked: the first in progress, else the first not
 * done, else the last (everything is done).
 */
function progressOf(phases) {
  const list = (phases || []).filter((p) => p && p.name)
  let ticked = 0
  let total = 0
  for (const p of list) {
    const c = taskCounts(p)
    ticked += c.ticked
    total += c.total
  }
  if (!total) return null
  let at = list.findIndex((p) => p.state === 'in-progress')
  if (at === -1) at = list.findIndex((p) => p.state !== 'complete')
  if (at === -1) at = list.length - 1
  return { ticked, total, percent: Math.floor((ticked / total) * 100), phase: at + 1, phases: list.length }
}

function progressLine(phases) {
  const p = progressOf(phases)
  return p ? `**Progress** ${p.percent}% · phase ${p.phase} of ${p.phases}` : ''
}

// A phase sub-issue's block content: its goal, and its task count when it has
// any checkboxes (a phase with none says nothing rather than `0 of 0`).
function phaseBlockInner(phase) {
  const goal = String((phase && phase.goal) || '').trim() || String((phase && phase.name) || '').trim()
  const { ticked, total } = taskCounts(phase)
  return total ? `${goal}\n\n**Progress** ${ticked} of ${total} tasks` : goal
}

module.exports = {
  DELIMITERS,
  descriptionMode,
  delimitersFor,
  blockOf,
  wrapBlock,
  spliceBlock,
  comparableDescription,
  specBlockInner,
  phaseBlockInner,
  progressOf,
  tableRows,
}
