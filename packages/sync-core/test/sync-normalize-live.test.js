'use strict'

/**
 * Regression: normalizeRemote against the REAL Linear `get_project` projection.
 *
 * The shapes below were captured live from the connected `linear` MCP server
 * (team "Skitterspec") by creating a probe project and calling get_project. The
 * original normalizeRemote was written against a guessed shape and silently
 * mismatched on five fields, so status/priority/labels never pulled and
 * description never compared equal (Linear reserializes markdown on save).
 *
 * See specs/in-progress/bug-linear-live-sync.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, normalizeRemote } = require('../src/normalize.js')
const { hashField } = require('../src/compare.js')
const { neutralConfig } = require('./_config.js')

const config = neutralConfig()

// Exactly as returned by the real Linear get_project (includeMilestones:true).
// Note: status/priority are OBJECTS; labels elements are OBJECTS; a milestone has
// only `progress` (no status/state); markdown bullets came back as `*`.
const REAL_PROJECT = {
  id: '3a0ecf31-1d8f-425e-a293-f1f587d3b69e',
  name: 'zzz-synctest-probe',
  description: '## Problem\n\nSome problem text here.\n\n## Acceptance criteria\n\n* first criterion\n* second criterion',
  priority: { value: 3, name: 'Medium' },
  labels: [{ id: 'l1', name: 'sync' }, { id: 'l2', name: 'triage' }],
  status: { id: 's1', name: 'Backlog', type: 'backlog' },
  milestones: [
    { id: 'm1', name: 'First phase', description: '**Goal:** do it', progress: '100%' },
    { id: 'm2', name: 'Second phase', description: '**Goal:** do more', progress: '0%' },
  ],
  updatedAt: '2026-07-28T14:04:04.229Z',
}

test('real Linear status object maps to the local workflow bucket', () => {
  const remote = normalizeRemote(REAL_PROJECT, config)
  assert.strictEqual(remote.workflowState, 'backlog')
})

test('real Linear priority object reduces to the numeric value', () => {
  const remote = normalizeRemote(REAL_PROJECT, config)
  assert.strictEqual(remote.priority, 3)
})

test('real Linear label objects reduce to their names', () => {
  const remote = normalizeRemote(REAL_PROJECT, config)
  assert.deepStrictEqual(remote.labels, ['sync', 'triage'])
})

test('real Linear milestones map to keyed {id,name,goal} items', () => {
  const remote = normalizeRemote(REAL_PROJECT, config)
  // The "**Goal:**" label is stripped so it hashes equal to a phase file's goal.
  assert.deepStrictEqual(remote.milestones, [
    { id: 'm1', name: 'First phase', goal: 'do it' },
    { id: 'm2', name: 'Second phase', goal: 'do more' },
  ])
})

test('description survives Linear markdown reserialization (idempotent hash)', () => {
  // Local authors `-` bullets; Linear returns the same content with `*` bullets.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-live-'))
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    '# zzz-synctest-probe\n\n## Problem\n\nSome problem text here.\n\n' +
      '## Acceptance criteria\n\n- first criterion\n- second criterion\n',
    'utf-8',
  )
  const local = normalizeLocal(dir, config)
  const remote = normalizeRemote(
    { ...REAL_PROJECT, description: `# zzz-synctest-probe\n\n${REAL_PROJECT.description}` },
    config,
  )
  // The three-way compare hashes each field — these must hash equal or every
  // sync reports description as spuriously changed / conflicted.
  assert.strictEqual(
    hashField(remote.description),
    hashField(local.description),
    'canonicalized remote description must hash-equal the local description',
  )
})
