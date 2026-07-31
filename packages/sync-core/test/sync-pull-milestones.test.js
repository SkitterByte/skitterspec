'use strict'

// Phase 2b: pulling a milestone edited in Linear writes it back into the matching
// phase file (by linear_milestone_id) and advances the base so the next compare
// reports in-sync. A milestone removed in Linear is reported, not applied.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { pull } = require('../src/pull.js')
const { normalizeLocal, normalizeRemote } = require('../src/normalize.js')
const { classify } = require('../src/compare.js')
const { writeBase, readBase } = require('../src/base.js')
const { neutralConfig } = require('./_config.js')

const TS = '2026-01-02T03:04:05.000Z'
const ID = 'SPEC-1'
const PROJECT_ID = 'proj_1'

function config() {
  const c = neutralConfig()
  c.sync.keyedFields = { milestones: 'id' }
  return c
}

const OVERVIEW = `---
spec_status: "in-progress"
---

# Demo

## Problem

Text.
`

const PHASE = `---
linear_milestone_id: "M-1"
---

# Phase 1 — Original name ⬜

**Goal:** original goal

## Tasks

- [ ] a task
`

function setup() {
  const cfg = config()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-pullms-'))
  const specDir = path.join(dir, 'spec')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), OVERVIEW, 'utf-8')
  fs.writeFileSync(path.join(specDir, '01-first.md'), PHASE, 'utf-8')

  const local = normalizeLocal(specDir, cfg)
  writeBase(dir, ID, cfg, { ...local, __meta: { updatedAt: 't0', syncedAt: 't0' } })
  return { dir, specDir, cfg, local }
}

// Build a remote project whose milestone M-1 has been edited in Linear.
function remoteAdapter(specDir, cfg, milestoneOverride) {
  const local = normalizeLocal(specDir, cfg)
  const project = {
    id: PROJECT_ID,
    updatedAt: 't1',
    description: local.description,
    status: { name: 'In Progress', type: 'started' },
    priority: { value: 0, name: 'No priority' },
    labels: [],
    milestones: milestoneOverride,
  }
  return { async readProject() { return project } }
}

const run = (ctx, adapter) =>
  pull({
    dir: ctx.dir,
    snapshotDir: ctx.specDir,
    identifier: ID,
    projectId: PROJECT_ID,
    adapter,
    config: ctx.cfg,
    force: false,
    timestamp: TS,
  })

test('a milestone edited in Linear is written into its phase file; base goes in-sync', async () => {
  const ctx = setup()
  const adapter = remoteAdapter(ctx.specDir, ctx.cfg, [
    { id: 'M-1', name: 'Edited name', description: 'edited goal' },
  ])
  const r = await run(ctx, adapter)
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.keyedApplied, ['milestones'])

  const phase = fs.readFileSync(path.join(ctx.specDir, '01-first.md'), 'utf-8')
  assert.match(phase, /^# Phase 1 — Edited name ⬜$/m)
  assert.match(phase, /^\*\*Goal:\*\* edited goal$/m)
  assert.match(phase, /^- \[ \] a task$/m) // body preserved

  // Base advanced: re-classify shows the milestone in-sync now.
  const local = normalizeLocal(ctx.specDir, ctx.cfg)
  const remote = normalizeRemote(await adapter.readProject(), ctx.cfg)
  const base = readBase(ctx.dir, ID, ctx.cfg)
  const ms = classify(local, remote, base, ctx.cfg).find((f) => f.field === 'milestones')
  assert.ok(ms.items.every((i) => i.status === 'unchanged'))
})

test('a milestone removed in Linear is reported, not applied', async () => {
  const ctx = setup()
  const adapter = remoteAdapter(ctx.specDir, ctx.cfg, []) // M-1 gone remotely
  const r = await run(ctx, adapter)
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.keyedReported, ['milestones#M-1'])
  // The phase file is untouched — no auto-delete.
  assert.ok(fs.existsSync(path.join(ctx.specDir, '01-first.md')))
})

test('a new milestone in Linear creates a new phase file', async () => {
  const ctx = setup()
  const adapter = remoteAdapter(ctx.specDir, ctx.cfg, [
    { id: 'M-1', name: 'Original name', description: 'original goal' }, // unchanged
    { id: 'M-2', name: 'Brand new phase', description: 'fresh goal' },
  ])
  const r = await run(ctx, adapter)
  assert.strictEqual(r.keyedCreated.length, 1)
  const created = fs.readFileSync(path.join(ctx.specDir, r.keyedCreated[0].file), 'utf-8')
  assert.match(created, /linear_milestone_id: "M-2"/)
  assert.match(created, /Brand new phase/)
})
