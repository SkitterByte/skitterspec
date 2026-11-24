'use strict'

/**
 * The pages an autonomous run leaves behind (feat-autonomous-run, phase 3):
 *
 *   - a SNAPSHOT per phase — that phase's review page, kept as it was when the
 *     run committed it (`reviews/<spec>/phase-<n>.html`), read-only;
 *   - the RUN INDEX — every snapshot as it lands, with its commit and report,
 *     served at `/<token>/<spec>/run` so the run can be read while it goes;
 *   - the AGGREGATE that heads the final page — every phase's Notes and
 *     Follow-ups, the stops and compactions, in one list.
 *
 * Everything here is built from records the engine already keeps (the run
 * record, the report sidecar) and is escaped on the way out. Nothing reads a
 * diff, and nothing here decides anything.
 */

const fs = require('node:fs')
const path = require('node:path')

const { readReport, reportHtmlFor, CARRIED } = require('./report.js')
const { readRun, compactionSummary } = require('./run.js')

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

/** Where a phase's snapshot lives, beside the spec's page. */
function snapshotPath(outPath, phase) {
  return path.join(outPath.replace(/\.html$/, ''), `phase-${phase}.html`)
}

// The state dir is the reviews dir's parent; the run record sits beside it.
function stateDirOf(outPath) {
  return path.dirname(path.dirname(outPath))
}

/** Which phases have a snapshot on disk, ascending. Never throws. */
function snapshotPhases(outPath) {
  let names
  try {
    names = fs.readdirSync(outPath.replace(/\.html$/, ''))
  } catch {
    return []
  }
  return names
    .map((n) => /^phase-(\d+)\.html$/.exec(n))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b)
}

// A value that says nothing — `none`, `—` — is not an item to carry forward.
const EMPTY = /^(none|—|-|n\/a)\.?$/i

/**
 * Every phase's carried rows, in phase order: `[{ phase, field, value, more }]`.
 * Pure.
 */
function carriedItems(report) {
  const phases = Object.values((report && report.phases) || {})
    .filter((e) => e && Array.isArray(e.rows))
    .sort((a, b) => (Number(a.phase) || 0) - (Number(b.phase) || 0))
  const out = []
  for (const e of phases) {
    for (const r of e.rows) {
      if (!CARRIED.includes(r.field) || EMPTY.test(String(r.value).trim())) continue
      out.push({ phase: e.phase, field: r.field, value: r.value, more: r.more || [] })
    }
  }
  return out
}

/**
 * The block that heads the final page. Empty string when the run left nothing
 * to say AND there is no run — so a final page for a spec with no record reads
 * as an ordinary page rather than an empty box.
 */
function renderAggregate({ report, run, spec, snapshots = [] }) {
  const items = carriedItems(report)
  const stops = (run && run.stops) || []
  const compacted = compactionSummary(run)
  if (!items.length && !stops.length && !compacted && !snapshots.length && !run) return ''
  const parts = ['<section class="report run-aggregate">', '<h2 class="report-heading">The whole run</h2>']
  const followUps = items.filter((i) => i.field === 'Follow-ups')
  const notes = items.filter((i) => i.field === 'Notes')
  const list = (title, rows) => {
    if (!rows.length) return
    parts.push(`<p class="report-title"><strong>${title}</strong></p>`, '<ul class="run-items">')
    for (const i of rows) {
      const more = i.more.map((m) => `<br>${inline(m)}`).join('')
      parts.push(`<li><span class="run-phase">phase ${escapeHtml(i.phase)}</span> ${inline(i.value)}${more}</li>`)
    }
    parts.push('</ul>')
  }
  list('Follow-ups, bugs and suggestions', followUps)
  list('Notes', notes)
  if (!followUps.length && !notes.length) parts.push('<p class="report-title">No phase recorded a follow-up or a note.</p>')
  if (stops.length) {
    parts.push('<p class="report-title"><strong>Stops</strong></p>', '<ul class="run-items">')
    for (const s of stops) parts.push(`<li><span class="run-phase">phase ${escapeHtml(s.phase)}</span> ${inline(s.reason)}</li>`)
    parts.push('</ul>')
  }
  if (compacted) parts.push(`<p class="report-title">Context ${escapeHtml(compacted)}.</p>`)
  if (snapshots.length) {
    const links = snapshots.map((n) => `<a href="${encodeURIComponent(spec)}/phase-${n}">phase ${n}</a>`).join(' · ')
    parts.push(`<p class="report-title">Each phase as reviewed: ${links} · <a href="${encodeURIComponent(spec)}/run">run index</a></p>`)
  }
  parts.push('</section>')
  return parts.join('\n')
}

/** The aggregate for a spec, read from its records. '' on any cannot-tell. */
function aggregateHtmlFor(outPath, spec) {
  const read = readReport(outPath, spec)
  const run = readRun(stateDirOf(outPath), spec)
  return renderAggregate({
    report: read.corrupt ? null : read.report,
    run: run.corrupt ? null : run.record,
    spec,
    snapshots: snapshotPhases(outPath),
  })
}

/**
 * The run index page — a doorway, styled like the server's index. Pure.
 * `phases` is the union of what the run record and the disk know, so a
 * snapshot written before its `run phase` call still shows.
 */
function renderRunIndex({ spec, run = null, report = null, snapshots = [], token = null, project = null }) {
  const prefix = token ? `/${token}` : ''
  const base = `${prefix}/${encodeURIComponent(spec)}`
  const byPhase = new Map()
  for (const p of (run && run.phases) || []) byPhase.set(p.n, { ...p })
  for (const n of snapshots) byPhase.set(n, { n, ...(byPhase.get(n) || {}), snapshot: true })
  const reports = (report && report.phases) || {}
  const rows = [...byPhase.values()]
    .sort((a, b) => a.n - b.n)
    .map((p) => {
      const r = reports[String(p.n)]
      const built = r && r.rows ? r.rows.find((x) => x.field === 'Built') : null
      const link = p.snapshot ? `<a href="${base}/phase-${p.n}">phase ${p.n}</a>` : `phase ${p.n}`
      return (
        `<li>${link}` +
        (p.commit ? `<span class="b">${escapeHtml(String(p.commit).slice(0, 8))}</span>` : '') +
        (built ? `<span class="t">${inline(built.value)}</span>` : '') +
        '</li>'
      )
    })
  const state = run ? (run.active ? `running · ends on <strong>${escapeHtml(run.then)}</strong>` : `ended · ${escapeHtml(run.outcome || run.then)}`) : 'no run recorded'
  const compacted = compactionSummary(run)
  const heading = `${project ? `${escapeHtml(project)} · ` : ''}${escapeHtml(spec)} · run`
  const body = rows.length ? `<ul>\n${rows.join('\n')}\n</ul>` : '<p class="empty">No phase has been committed by this run yet.</p>'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
<style>
:root { --bg:#fff; --fg:#1a1a1a; --dim:#6b6b6b; --line:#e3e3e3; --link:#0b5fbd }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg:#16181c; --fg:#e6e6e6; --dim:#9a9a9a; --line:#2c2f36; --link:#7cb7ff }
}
* { box-sizing:border-box }
body { margin:0; padding:2rem 1rem; background:var(--bg); color:var(--fg);
  font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif }
main { max-width:52rem; margin:0 auto }
h1 { font-size:1.1rem; margin:0 0 .25rem; font-weight:600 }
.state { color:var(--dim); margin:0 0 1.25rem }
ul { list-style:none; margin:0; padding:0 }
li { display:flex; flex-wrap:wrap; gap:.75rem; align-items:baseline; padding:.7rem 0; border-top:1px solid var(--line) }
a { color:var(--link); text-decoration:none; font-weight:600 }
a:hover { text-decoration:underline }
.b { color:var(--dim); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.85em }
.t { flex-basis:100%; color:var(--fg); font-size:.9em; overflow-wrap:anywhere }
.empty { color:var(--dim) }
code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace }
</style>
</head>
<body>
<main>
<h1>${heading}</h1>
<p class="state">${state}${compacted ? ` · ${escapeHtml(compacted)}` : ''} · <a href="${base}">current page</a></p>
${body}
</main>
</body>
</html>
`
}

/** The run index for a spec, read from its records. */
function runIndexFor(outPath, spec, { token = null, project = null } = {}) {
  const read = readReport(outPath, spec)
  const run = readRun(stateDirOf(outPath), spec)
  return renderRunIndex({
    spec,
    run: run.corrupt ? null : run.record,
    report: read.corrupt ? null : read.report,
    snapshots: snapshotPhases(outPath),
    token,
    project,
  })
}

/**
 * What heads a page, by its button set: the final page carries the whole run;
 * every other page its latest phase report. '' when there is nothing to show.
 */
function pageHeadFor(outPath, spec, buttons) {
  return buttons === 'final' ? aggregateHtmlFor(outPath, spec) : reportHtmlFor(outPath, spec)
}

module.exports = {
  pageHeadFor,
  snapshotPath,
  snapshotPhases,
  carriedItems,
  renderAggregate,
  aggregateHtmlFor,
  renderRunIndex,
  runIndexFor,
}
