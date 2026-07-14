'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { pull } = require('../src/pull.js')
const { normalizeLocal, readSnapshot } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')
const { writeBase, readBase } = require('../src/base.js')

const TS = '2026-01-02T03:04:05.000Z'
const ID = 'ENG-42'
const PROJECT_ID = 'proj_1'

const OVERVIEW = `---
spec_identifier: "ENG-42"
spec_project_id: "proj_1"
spec_status: "in-progress"
priority: 2
labels: ["a"]
---

# Demo

## Problem

Local problem text.

## Changelog

- local note
`

function fakeAdapter(project) {
  return {
    project,
    async readProject() {
      return { ...project }
    },
    async updateProject() {
      throw new Error('pull must not write to the remote')
    },
  }
}

function setup({ baseOverrides = {}, remoteOverrides = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-pull-'))
  const specDir = path.join(dir, 'spec')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), OVERVIEW, 'utf-8')

  const config = neutralConfig()
  const localNorm = normalizeLocal(specDir, config)

  const remoteRaw = {
    id: PROJECT_ID,
    updatedAt: 't0',
    name: 'Demo',
    description: localNorm.description,
    state: 'In Progress',
    priority: 2,
    labels: ['a'],
    milestones: [],
    ...remoteOverrides,
  }
  const base = { ...localNorm, ...baseOverrides }
  base.__meta = { updatedAt: 't0', syncedAt: 't0', ...(baseOverrides.__meta || {}) }
  writeBase(dir, ID, config, base)

  return { dir, specDir, config, localNorm, adapter: fakeAdapter(remoteRaw), remoteRaw }
}

const run = (ctx, force = false) =>
  pull({
    dir: ctx.dir,
    snapshotDir: ctx.specDir,
    identifier: ID,
    projectId: PROJECT_ID,
    adapter: ctx.adapter,
    config: ctx.config,
    force,
    timestamp: TS,
  })

function frontmatterOf(ctx) {
  return readSnapshot(ctx.specDir, ctx.config).frontmatter
}

test('remote-only pull applies frontmatter fields and stamps the sync', async () => {
  const ctx = setup({ remoteOverrides: { state: 'Done', priority: 5 } })
  const r = await run(ctx)
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.applied.sort(), ['priority', 'workflowState'])
  assert.deepStrictEqual(r.deferred, [])

  const fm = frontmatterOf(ctx)
  assert.strictEqual(fm.spec_status, 'complete') // Done → complete bucket
  assert.strictEqual(fm.priority, 5)
  assert.strictEqual(fm.last_synced_at, TS)

  // body preserved
  const raw = fs.readFileSync(path.join(ctx.specDir, '00-overview.md'), 'utf-8')
  assert.match(raw, /## Problem/)
  assert.match(raw, /- local note/)

  // base advanced for applied fields + updatedAt
  const base = readBase(ctx.dir, ID, ctx.config)
  assert.strictEqual(base.workflowState, 'complete')
  assert.strictEqual(base.priority, 5)
  assert.strictEqual(base.__meta.updatedAt, 't0')
})

test('conflict on a both-owned field is refused (no writes)', async () => {
  const ctx = setup({
    baseOverrides: { description: 'OLD' },
    remoteOverrides: { description: 'REMOTE', updatedAt: 't9' },
  })
  const r = await run(ctx)
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.blocked, true)
  assert.strictEqual(r.reason, 'conflict')
  assert.deepStrictEqual(r.conflicts, ['description'])

  // nothing changed
  assert.strictEqual(frontmatterOf(ctx).spec_status, 'in-progress')
  assert.strictEqual(readBase(ctx.dir, ID, ctx.config).description, 'OLD')
})

test('--force backs up local, applies pull-owned fields, defers body fields', async () => {
  const ctx = setup({
    baseOverrides: { description: 'OLD', workflowState: 'backlog' },
    remoteOverrides: { description: 'REMOTE', state: 'Done', updatedAt: 't9' },
  })
  const blocked = await run(ctx, false)
  assert.strictEqual(blocked.blocked, true) // description conflict blocks non-force

  const r = await run(ctx, true)
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.applied, ['workflowState'])
  assert.deepStrictEqual(r.deferred, ['description']) // body write-back deferred
  assert.ok(r.backupPath, 'local side backed up before force')
  const backup = JSON.parse(fs.readFileSync(r.backupPath, 'utf-8'))
  assert.strictEqual(backup.description, ctx.localNorm.description) // the local we clobbered

  assert.strictEqual(frontmatterOf(ctx).spec_status, 'complete')
  // deferred description stays pending in base (kept at local, not remote)
  assert.strictEqual(readBase(ctx.dir, ID, ctx.config).description, ctx.localNorm.description)
})

test('nothing to pull when up to date', async () => {
  const ctx = setup()
  const r = await run(ctx)
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.applied, [])
  assert.deepStrictEqual(r.deferred, [])
})

test('missing remote project → clean error, no writes', async () => {
  const ctx = setup()
  ctx.adapter.readProject = async () => null
  const r = await run(ctx)
  assert.strictEqual(r.ok, false)
  assert.match(r.error, /not found/)
})
