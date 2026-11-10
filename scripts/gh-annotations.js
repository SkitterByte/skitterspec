'use strict'

// A `node --test` reporter that prints each failing test as a GitHub Actions
// `::error` annotation (chore-windows-ci).
//
// WHY: a job's log needs repo-admin rights to download, while its annotations
// are public through the check-runs API — so a failing run can be read and
// triaged without anyone fetching a 1,800-line log by hand. Added alongside the
// default reporter in CI only; locally nothing changes.
//
// GitHub keeps at most 10 error annotations per step (50 per job), so this is a
// first look at a red run, not a replacement for the log.

const path = require('node:path')

// Workflow-command escaping: data and property values differ.
const data = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
const prop = (s) => data(s).replace(/:/g, '%3A').replace(/,/g, '%2C')

/** The annotation line for one `test:fail` event's data, or null to skip it. */
function annotationFor(d, cwd = process.cwd()) {
  if (!d || !d.details) return null
  const err = d.details.error
  // A failing suite or a parent test fails BECAUSE its subtests did; only the
  // test that actually threw is worth one of the ten annotations.
  if (err && err.failureType === 'subtestsFailed') return null
  const cause = (err && err.cause) || err
  const message = String((cause && (cause.message || cause)) || 'failed')
    .split('\n')
    .slice(0, 8)
    .join('\n')
  const file = d.file ? path.relative(cwd, d.file).split(path.sep).join('/') : ''
  const where = file ? `file=${prop(file)},line=${d.line || 1},` : ''
  return `::error ${where}title=${prop(d.name || 'test')}::${data(message)}\n`
}

// GitHub keeps ten error annotations per step and cuts a message at about
// 4 KB. So every failure is packed — `file:line name — first line of its
// error` — into as few annotations as fit, ten at most: room for about a
// hundred and fifty failures, each with the reason it failed, without anyone
// opening the log.
const MAX_ANNOTATIONS = 10
const MESSAGE_BYTES = 3800
const LINE_CHARS = 480

/** One failure as a single summary line. */
function summaryLine(d, cwd = process.cwd()) {
  const err = d.details && d.details.error
  const cause = (err && err.cause) || err
  const first = String((cause && (cause.message || cause)) || 'failed')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ¶ ')
  const file = d.file ? path.relative(cwd, d.file).split(path.sep).join('/') : '?'
  // Where it actually threw — the first frame in this repo — and, for an
  // assertion, what it compared: a message alone ("+ actual - expected", or
  // "reading 'relPath'") rarely says enough to fix it from.
  const frame = String((cause && cause.stack) || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('at ') && !l.includes('node:') && !l.includes('node_modules'))
  const at = frame ? ` @ ${frame.replace(/^at /, '').replace(/\\/g, '/').replace(/.*?(packages|scripts)\//, '$1/')}` : ''
  const short = (v) => {
    try {
      return JSON.stringify(v).slice(0, 120)
    } catch {
      return String(v).slice(0, 120)
    }
  }
  const cmp = cause && 'actual' in cause && 'expected' in cause ? ` | actual=${short(cause.actual)} expected=${short(cause.expected)}` : ''
  return `${file}:${d.line || 1} ${d.name} — ${first}${cmp}${at}`.slice(0, LINE_CHARS)
}

/** Pack summary lines into at most `MAX_ANNOTATIONS` annotation bodies. */
function pack(lines) {
  const bodies = []
  let current = []
  let size = 0
  for (const line of lines) {
    const bytes = Buffer.byteLength(line, 'utf8') + 1
    if (current.length && size + bytes > MESSAGE_BYTES) {
      bodies.push(current)
      current = []
      size = 0
    }
    current.push(line)
    size += bytes
  }
  if (current.length) bodies.push(current)
  if (bodies.length <= MAX_ANNOTATIONS) return { bodies, dropped: 0 }
  const kept = bodies.slice(0, MAX_ANNOTATIONS)
  const dropped = bodies.slice(MAX_ANNOTATIONS).reduce((n, b) => n + b.length, 0)
  return { bodies: kept, dropped }
}

module.exports = async function* ghAnnotations(source) {
  const lines = []
  for await (const event of source) {
    if (event.type !== 'test:fail') continue
    // Same filter as `annotationFor`: a parent failing only because a subtest
    // did adds nothing.
    if (!annotationFor(event.data)) continue
    lines.push(summaryLine(event.data))
  }
  if (!lines.length) return
  const { bodies, dropped } = pack(lines)
  for (const [i, body] of bodies.entries()) {
    const more = dropped && i === bodies.length - 1 ? `\n(+${dropped} more — see the log)` : ''
    const title = `${lines.length} failing test(s) — part ${i + 1} of ${bodies.length}`
    yield `::error title=${prop(title)}::${data(body.join('\n') + more)}\n`
  }
}

module.exports.annotationFor = annotationFor
module.exports.pack = pack
module.exports.summaryLine = summaryLine
