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

module.exports = async function* ghAnnotations(source) {
  for await (const event of source) {
    if (event.type !== 'test:fail') continue
    const line = annotationFor(event.data)
    if (line) yield line
  }
}

module.exports.annotationFor = annotationFor
