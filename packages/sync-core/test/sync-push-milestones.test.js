'use strict'

// Phase 2 (push-side): the offline engine emits a milestone push *plan* (create /
// update) for the provider skill to apply over MCP. Edited linked phases → update
// by id; new unlinked phases → create; nothing changed → nothing to push.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { push } = require('../src/push.js')
const { normalizeLocal } = require('../src/normalize.js')
const { writeBase } = require('../src/base.js')
const { neutralConfig } = require('./_config.js')

const TS = '2026-01-02T03:04:05.000Z'
const ID = 'SPEC-1'
const PROJECT_ID = 'proj_1'

// Real shipped default field set (description + status/priority/labels) plus
// milestones opted into keyed sync. The legacy phaseBodies/acceptanceCriteria/
// taskBreakdown fields aren't part of the default and would add phantom noise.
function config() {
  const c = neutralConfig()
  delete c.sync.fieldOwnership.phaseBodies
  delete c.sync.fieldOwnership.acceptanceCriteria
  delete c.sync.fieldOwnership.taskBreakdown
  c.sync.keyedFields = { milestones: 'id' }
  return c
}

const OVERVIEW = `---
spec_status: "backlog"
priority: 0
---

# Demo

## Problem

x
`

const phaseFile = (goal) => `---
linear_milestone_id: "M-1"
---

# Phase 1 — Original ⬜

**Goal:** ${goal}

## Tasks

- [ ] t
`

function setup() {
  const cfg = config()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-pushms-'))
  const specDir = path.join(dir, 'spec')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), OVERVIEW, 'utf-8')
  fs.writeFileSync(path.join(specDir, '01-first.md'), phaseFile('orig goal'), 'utf-8')

  const base = normalizeLocal(specDir, cfg)
  writeBase(dir, ID, cfg, { ...base, __meta: { updatedAt: 't0', syncedAt: 't0' } })

  const remote = {
    id: PROJECT_ID,
    updatedAt: 't0',
    description: base.description,
    status: { name: 'Backlog', type: 'backlog' },
    priority: { value: 0, name: 'No priority' },
    labels: [],
    milestones: [{ id: 'M-1', name: 'Original', description: 'orig goal' }],
  }
  const adapter = { async readProject() { return remote }, async updateProject() { return remote } }
  return { dir, specDir, cfg, adapter }
}

const run = (ctx) =>
  push({
    dir: ctx.dir,
    snapshotDir: ctx.specDir,
    identifier: ID,
    projectId: PROJECT_ID,
    adapter: ctx.adapter,
    config: ctx.cfg,
    force: false,
    timestamp: TS,
  })

test('an edited linked phase yields a milestone update plan (by id)', async () => {
  const ctx = setup()
  fs.writeFileSync(path.join(ctx.specDir, '01-first.md'), phaseFile('edited goal'), 'utf-8')
  const r = await run(ctx)
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.milestonesPush.update, [{ id: 'M-1', name: 'Original', goal: 'edited goal' }])
  assert.strictEqual(r.milestonesPush.create.length, 0)
})

test('a new unlinked phase yields a milestone create plan', async () => {
  const ctx = setup()
  fs.writeFileSync(
    path.join(ctx.specDir, '02-second.md'),
    '# Phase 2 — Second ⬜\n\n**Goal:** brand new\n\n## Tasks\n\n- [ ] x\n',
    'utf-8',
  )
  const r = await run(ctx)
  assert.deepStrictEqual(r.milestonesPush.create, [{ name: 'Second', goal: 'brand new' }])
})

test('no local milestone change → nothing to push', async () => {
  const ctx = setup()
  const r = await run(ctx)
  assert.strictEqual(r.note, 'nothing to push')
  assert.strictEqual(r.milestonesPush, undefined)
})
