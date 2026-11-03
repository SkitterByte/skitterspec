'use strict'

// The `Severity:` and `Incident:` headers are push-time extras: parsed off the
// overview's blockquote block, never keys on the synced field set. The one
// place they touch the projection is the related-incident line, which is part
// of the description so the stored base, the plan and the tracker all hash the
// same bytes.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specHeaders, linkedIncident, normalizeLocal } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

function repo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-incident-'))
}

function writeSpec(root, bucket, name, overview) {
  const dir = path.join(root, 'specs', bucket, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), overview)
  fs.writeFileSync(path.join(dir, '01-fix.md'), '# Phase 1 — Fix ⬜\n\n**Goal:** fix it.\n')
  return dir
}

const FIX_OVERVIEW = [
  '# Fix the outage',
  '',
  '> **Type:** Bug',
  '> **Severity:** 2 - High',
  '> **Incident:** incident-api-outage',
  '',
  '## Problem',
  '',
  'The API is down.',
  '',
].join('\n')

test('specHeaders reads Severity and Incident off the overview', () => {
  const dir = writeSpec(repo(), 'in-progress', 'bug-fix-outage', FIX_OVERVIEW)
  assert.deepStrictEqual(specHeaders(dir, neutralConfig()), {
    severity: '2 - High',
    incident: 'incident-api-outage',
  })
})

// STAYS-SILENT: a spec with neither header answers nulls, and its projection
// is byte-identical to before the headers existed.
test('a spec without the headers projects exactly as before', () => {
  const dir = writeSpec(repo(), 'in-progress', 'bug-plain', '# Plain\n\n## Problem\n\nP.\n')
  assert.deepStrictEqual(specHeaders(dir, neutralConfig()), { severity: null, incident: null })
  const { description } = normalizeLocal(dir, neutralConfig())
  assert.ok(!/Related incident/.test(description))
})

test('linkedIncident resolves the identifier from the incident spec, any bucket', () => {
  const root = repo()
  const config = { ...neutralConfig(), fields: { ...neutralConfig().fields, identifier: 'tracker_identifier' } }
  writeSpec(
    root,
    'in-progress',
    'incident-api-outage',
    '---\ntracker_identifier: "#42"\n---\n\n# Incident\n\n## Impact\n\nDown.\n',
  )
  const fix = writeSpec(root, 'in-progress', 'bug-fix-outage', FIX_OVERVIEW)
  assert.deepStrictEqual(linkedIncident(fix, config), {
    name: 'incident-api-outage',
    identifier: '#42',
    found: true,
  })
})

test('an unlinked or absent incident answers identifier null, never throws', () => {
  const root = repo()
  // The incident folder exists but carries no identifier yet.
  writeSpec(root, 'in-progress', 'incident-api-outage', '# Incident\n\n## Impact\n\nDown.\n')
  const fix = writeSpec(root, 'in-progress', 'bug-fix-outage', FIX_OVERVIEW)
  assert.strictEqual(linkedIncident(fix, neutralConfig()).identifier, null)
  // And a fix whose incident folder is not on disk — a branch-local absence —
  // still answers the name, identifier null, found false.
  const lone = writeSpec(repo(), 'in-progress', 'bug-fix-outage', FIX_OVERVIEW)
  assert.deepStrictEqual(linkedIncident(lone, neutralConfig()), {
    name: 'incident-api-outage',
    identifier: null,
    found: false,
  })
})

test('the description carries the related-incident line, identifier first', () => {
  const root = repo()
  const config = { ...neutralConfig(), fields: { ...neutralConfig().fields, identifier: 'tracker_identifier' } }
  writeSpec(
    root,
    'backlog',
    'incident-api-outage',
    '---\ntracker_identifier: "#42"\n---\n\n# Incident\n\n## Impact\n\nDown.\n',
  )
  const fix = writeSpec(root, 'in-progress', 'bug-fix-outage', FIX_OVERVIEW)
  assert.match(normalizeLocal(fix, config).description, /\n\nRelated incident: #42$/)
  // Unlinked, the line falls back to the spec name rather than vanishing.
  const lone = writeSpec(repo(), 'in-progress', 'bug-fix-outage', FIX_OVERVIEW)
  assert.match(normalizeLocal(lone, neutralConfig()).description, /\n\nRelated incident: incident-api-outage$/)
})
