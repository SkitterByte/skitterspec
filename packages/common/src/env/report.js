'use strict'

/**
 * The phase report on the review page (feat-autonomous-run, phase 2).
 *
 * Every lifecycle skill ends with a block — a verdict sentence and a table of
 * fields (`.claude/rules/spec-reports.md`). Until now that block lived only in
 * the terminal, so its Notes and Follow-ups were lost to anyone reading the
 * page later, and an autonomous run would leave them nowhere at all.
 *
 * `spec-env review --report <file>` hands the block's rows to the engine, which
 * keeps them per phase in a `.report.json` sidecar beside the notes and
 * renders the latest at the top of the page. The served page re-renders from
 * disk on every request, which is why the rows are STORED rather than passed
 * straight into one render.
 *
 * The rows are what the model already wrote for the terminal. Nothing here
 * reads the diff, and every value is escaped: it is model-authored text
 * arriving through a file, which is exactly the input never trusted as markup.
 */

const fs = require('node:fs')
const path = require('node:path')

const REPORT_VERSION = 1
const REPORT_SUFFIX = '.report.json'

// The field vocabulary, in the order `spec-reports.md` defines. A field not in
// it is kept (a skill may know a field this engine does not) and sorts after
// the known ones, before `Follow-ups` and `Next`, which always close the table.
const FIELD_ORDER = Object.freeze([
  'Tracker',
  'Why',
  'Branch',
  'Spec',
  'Cause',
  'Built',
  'Tests',
  'Notes',
  'Landed',
  'Worktree',
  'Untouched',
  'Review',
  'Follow-ups',
  'Next',
])
const CLOSING = ['Follow-ups', 'Next']

// The fields a later page collects across phases (phase 3's aggregate).
const CARRIED = Object.freeze(['Notes', 'Follow-ups'])

function reviewReportPath(outPath) {
  return outPath.replace(/\.html$/, '') + REPORT_SUFFIX
}

function emptyReport(specFolder) {
  return { version: REPORT_VERSION, spec: specFolder, phases: {} }
}

/** Never throws. Absent is ordinary; unparseable is `corrupt` and never written over. */
function readReport(outPath, specFolder) {
  let raw
  try {
    raw = fs.readFileSync(reviewReportPath(outPath), 'utf8')
  } catch {
    return { report: emptyReport(specFolder), corrupt: false, present: false }
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    const phases = parsed.phases && typeof parsed.phases === 'object' && !Array.isArray(parsed.phases) ? parsed.phases : {}
    return { report: { version: REPORT_VERSION, spec: specFolder, phases }, corrupt: false, present: true }
  } catch {
    return { report: emptyReport(specFolder), corrupt: true, present: true }
  }
}

function writeReport(outPath, report) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(reviewReportPath(outPath), JSON.stringify(report, null, 2) + '\n')
}

/**
 * Validate what a skill handed in. Two shapes: a bare array of rows, or
 * `{ title, rows }` where `title` is the block's verdict sentence.
 *
 * A row is `{ field, value }`. An EMPTY field continues the row above it —
 * the shape `Next` takes when it lists open manual steps a row each — and is
 * kept attached to that row rather than sorted on its own.
 *
 * @returns {{ ok: true, title: string|null, rows: Array<{field: string, value: string, more: string[]}> }
 *          | { ok: false, reason: string }}
 */
function validateReport(raw) {
  const body = Array.isArray(raw) ? { rows: raw } : raw
  if (!body || typeof body !== 'object' || !Array.isArray(body.rows)) {
    return { ok: false, reason: 'a report is an array of {field, value} rows, or {title, rows}' }
  }
  const rows = []
  for (const [i, r] of body.rows.entries()) {
    if (!r || typeof r !== 'object' || typeof r.value !== 'string') {
      return { ok: false, reason: `row ${i + 1} needs a string value` }
    }
    const field = typeof r.field === 'string' ? r.field.replace(/\*\*/g, '').trim() : ''
    if (!field) {
      if (!rows.length) return { ok: false, reason: 'the first row needs a field' }
      rows[rows.length - 1].more.push(r.value)
      continue
    }
    rows.push({ field, value: r.value, more: [] })
  }
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null
  return { ok: true, title, rows: orderRows(rows) }
}

function rank(field) {
  if (CLOSING.includes(field)) return 1000 + CLOSING.indexOf(field)
  const i = FIELD_ORDER.indexOf(field)
  return i === -1 ? 500 : i
}

// A stable sort, so two unknown fields keep the order they were written in.
function orderRows(rows) {
  return rows.map((r, i) => [r, i]).sort((a, b) => rank(a[0].field) - rank(b[0].field) || a[1] - b[1]).map(([r]) => r)
}

/** Record one phase's report. Pure. Re-recording a phase replaces it. */
function recordReport(report, { phase, title = null, rows, at }) {
  const key = phase == null || phase === '' ? 'current' : String(phase)
  return { ...report, phases: { ...report.phases, [key]: { phase: key, title, rows, at } } }
}

/** The most recently recorded entry, or null — what the page shows. */
function latestReport(report) {
  const entries = Object.values((report && report.phases) || {}).filter((e) => e && Array.isArray(e.rows))
  if (!entries.length) return null
  return entries.reduce((a, b) => (String(b.at) > String(a.at) ? b : a))
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

// The two inline marks the terminal block uses most: `code` and **bold**.
// Applied AFTER escaping, to escaped text, so nothing a value carries can open
// a tag — the marks only ever produce <code> and <strong>.
function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

/**
 * The report as HTML. Empty string when there is nothing to show, so a page
 * rendered without `--report` is byte-identical to one rendered before this
 * existed.
 */
function renderReportBlock(entry) {
  if (!entry || !Array.isArray(entry.rows) || !entry.rows.length) return ''
  const heading = entry.phase && entry.phase !== 'current' ? `Phase ${escapeHtml(entry.phase)} report` : 'Report'
  const parts = ['<section class="report">', `<h2 class="report-heading">${heading}</h2>`]
  if (entry.title) parts.push(`<p class="report-title">${inline(entry.title)}</p>`)
  parts.push('<table class="report-table"><tbody>')
  for (const r of entry.rows) {
    const more = (r.more || []).map((m) => `<br>${inline(m)}`).join('')
    parts.push(`<tr><th scope="row">${escapeHtml(r.field)}</th><td>${inline(r.value)}${more}</td></tr>`)
  }
  parts.push('</tbody></table>', '</section>')
  return parts.join('\n')
}

/** The stored report's latest entry as HTML; '' when absent or unreadable. */
function reportHtmlFor(outPath, specFolder) {
  const read = readReport(outPath, specFolder)
  return read.corrupt ? '' : renderReportBlock(latestReport(read.report))
}

module.exports = {
  reportHtmlFor,
  REPORT_VERSION,
  REPORT_SUFFIX,
  FIELD_ORDER,
  CARRIED,
  reviewReportPath,
  emptyReport,
  readReport,
  writeReport,
  validateReport,
  recordReport,
  latestReport,
  renderReportBlock,
}
