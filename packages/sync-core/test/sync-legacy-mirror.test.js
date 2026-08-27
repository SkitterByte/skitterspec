'use strict'

/**
 * Upgrading 8.x → 9.x must not silently orphan a live mirror.
 *
 * v9 reads `linear_identifier` / `linear_issue_id`; a spec linked under 8.x
 * carries `linear_project_id` / `linear_milestone_id`. v9 sees nothing, calls the
 * spec unlinked, and emits a perfectly ordinary ALL-CREATES plan — which mints a
 * fresh mirror and abandons the old one. Nothing on screen says a prior mirror
 * existed. These tests pin the detection that makes the upgrade safe.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { detectLegacyMirror } = require('../src/legacy.js')
const { push } = require('../src/push.js')
const { neutralConfig } = require('./_config.js')

const OVERVIEW_9 = '# Spec\n\n## Phases\n\n| # | Phase | Status | File |\n|---|-------|--------|------|\n| 1 | Engine | ⬜ | [01-engine.md](01-engine.md) |\n'
const PHASE = '# Phase 1 — Engine ⬜\n\n**Goal:** make it work.\n\n- [ ] Do the thing\n'

// A repo with one spec folder, and optionally a last-pushed snapshot for it.
function repo({ overview = OVERVIEW_9, phase = PHASE, snapshot = null, identifier = 'spec' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-legacy-'))
  const snapshotDir = path.join(dir, 'specs', 'in-progress', 'spec')
  fs.mkdirSync(snapshotDir, { recursive: true })
  fs.writeFileSync(path.join(snapshotDir, '00-overview.md'), overview, 'utf-8')
  fs.writeFileSync(path.join(snapshotDir, '01-engine.md'), phase, 'utf-8')
  if (snapshot) {
    const baseDir = path.join(dir, neutralConfig().sync.baseDir)
    fs.mkdirSync(baseDir, { recursive: true })
    fs.writeFileSync(path.join(baseDir, `${identifier}.base.json`), JSON.stringify(snapshot), 'utf-8')
  }
  return { dir, snapshotDir, identifier, config: neutralConfig() }
}

test('a clean 9.x spec is not flagged', () => {
  assert.strictEqual(detectLegacyMirror(repo()), null)
})

test('a never-pushed spec is not flagged', () => {
  const r = repo({ overview: '---\nlinear_identifier: "SKI-1"\n---\n\n' + OVERVIEW_9 })
  assert.strictEqual(detectLegacyMirror(r), null)
})

test('pre-9.0 overview frontmatter is detected', () => {
  const r = repo({ overview: '---\nlinear_project_id: "proj_123"\n---\n\n' + OVERVIEW_9 })
  const found = detectLegacyMirror(r)
  assert.deepEqual(found.keys, ['linear_project_id'])
  assert.deepEqual(found.files, ['00-overview.md'])
})

test('pre-9.0 phase frontmatter is detected', () => {
  const r = repo({ phase: '---\nlinear_milestone_id: "ms_7"\n---\n\n' + PHASE })
  const found = detectLegacyMirror(r)
  assert.deepEqual(found.keys, ['linear_milestone_id'])
  assert.deepEqual(found.files, ['01-engine.md'])
})

test('a pre-9.0 snapshot names how much would be orphaned', () => {
  const r = repo({
    overview: '---\nlinear_project_id: "proj_123"\n---\n\n' + OVERVIEW_9,
    snapshot: {
      project: 'proj_123',
      milestones: { a: 'h', b: 'h', c: 'h' },
      issues: { one: 'h', two: 'h' },
    },
  })
  const found = detectLegacyMirror(r)
  assert.deepEqual(found.orphans, { projects: 1, milestones: 3, issues: 2, total: 6 })
  assert.strictEqual(found.orphanCount, 6)
})

test('a legacy snapshot alone is enough, even with clean frontmatter', () => {
  const r = repo({ snapshot: { project: 'proj_9', milestones: {}, issues: {} } })
  const found = detectLegacyMirror(r)
  assert.deepEqual(found.keys, [])
  assert.strictEqual(found.orphanCount, 1)
})

test('a 9.x snapshot is not mistaken for a legacy one', () => {
  const r = repo({ snapshot: { issue: 'hash', subIssues: { 'SKI-2': 'hash' } } })
  assert.strictEqual(detectLegacyMirror(r), null)
})

test('push carries the finding on the plan, where --json will see it', () => {
  const r = repo({
    overview: '---\nlinear_project_id: "proj_123"\n---\n\n' + OVERVIEW_9,
    snapshot: { project: 'proj_123', milestones: { a: 'h' }, issues: {} },
  })
  const { plan } = push(r)
  assert.ok(plan.legacy, 'the plan itself carries it — not just a stderr warning')
  assert.strictEqual(plan.legacy.orphanCount, 2)
  // It must survive the JSON the skill actually consumes.
  assert.strictEqual(JSON.parse(JSON.stringify(plan)).legacy.orphanCount, 2)
})

test('a clean spec leaves the plan untouched', () => {
  assert.strictEqual(push(repo()).plan.legacy, undefined)
})
