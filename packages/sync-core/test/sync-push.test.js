'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { push } = require('../src/push.js')
const { normalizeLocal } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')
const { writeBase, readBase } = require('../src/base.js')

const TS = '2026-01-02T03:04:05.000Z' // fixed input timestamp (no clock reads)
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

// A fake in-memory remote adapter. `raceOnRead` bumps updatedAt on the 2nd read
// to simulate a writer that raced in during the push.
function fakeAdapter(project, opts = {}) {
  let reads = 0
  const adapter = {
    project,
    updateCalls: [],
    async readProject() {
      reads += 1
      if (opts.raceOnRead && reads === 2) return { ...project, updatedAt: opts.raceOnRead }
      return { ...project }
    },
    async updateProject(id, updates) {
      adapter.updateCalls.push({ id, updates })
      Object.assign(project, updates, { updatedAt: 't1' })
      return { ...project }
    },
  }
  return adapter
}

function setup({ baseOverrides = {}, remoteOverrides = {}, adapterOpts = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-push-'))
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

  const adapter = fakeAdapter(remoteRaw, adapterOpts)
  return { dir, specDir, config, localNorm, adapter, remoteRaw }
}

const run = (ctx, force = false) =>
  push({
    dir: ctx.dir,
    snapshotDir: ctx.specDir,
    identifier: ID,
    projectId: PROJECT_ID,
    adapter: ctx.adapter,
    config: ctx.config,
    force,
    timestamp: TS,
  })

test('local-only field is pushed; base + remote updated', async () => {
  const ctx = setup({ baseOverrides: { description: 'OLD' }, remoteOverrides: { description: 'OLD' } })
  const r = await run(ctx)
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.written, ['description'])
  // remote received the local description
  assert.strictEqual(ctx.adapter.updateCalls.length, 1)
  assert.strictEqual(ctx.adapter.updateCalls[0].updates.description, ctx.localNorm.description)
  // base rewritten to local value + new updatedAt
  const base = readBase(ctx.dir, ID, ctx.config)
  assert.strictEqual(base.description, ctx.localNorm.description)
  assert.strictEqual(base.__meta.updatedAt, 't1')
})

test('a pull-owned local edit is never pushed (nothing to push)', async () => {
  const ctx = setup({
    baseOverrides: { workflowState: 'backlog' },
    remoteOverrides: { state: 'Backlog' },
  })
  const r = await run(ctx)
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.written, [])
  assert.strictEqual(r.note, 'nothing to push')
  assert.strictEqual(ctx.adapter.updateCalls.length, 0)
})

test('refuses when the remote moved past base (pull first)', async () => {
  const ctx = setup({ remoteOverrides: { description: 'REMOTE-NEW', updatedAt: 't9' } })
  const r = await run(ctx)
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.blocked, true)
  assert.strictEqual(r.reason, 'remote-moved')
  assert.strictEqual(ctx.adapter.updateCalls.length, 0)
})

test('--force wins after backing up the remote side', async () => {
  const ctx = setup({
    baseOverrides: { description: 'OLD' },
    remoteOverrides: { description: 'REMOTE-NEW', updatedAt: 't9' },
  })
  const blocked = await run(ctx, false)
  assert.strictEqual(blocked.blocked, true) // conflict without force

  const r = await run(ctx, true)
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.written, ['description'])
  assert.ok(r.backupPath, 'a remote backup was written')
  const backup = JSON.parse(fs.readFileSync(r.backupPath, 'utf-8'))
  assert.strictEqual(backup.description, 'REMOTE-NEW') // the clobbered remote, preserved
  assert.strictEqual(ctx.adapter.project.description, ctx.localNorm.description) // local won
})

test('aborts when the remote changes between compare and write (re-read)', async () => {
  const ctx = setup({
    baseOverrides: { description: 'OLD' },
    remoteOverrides: { description: 'OLD' },
    adapterOpts: { raceOnRead: 't-raced' },
  })
  const r = await run(ctx)
  assert.strictEqual(r.blocked, true)
  assert.strictEqual(r.reason, 'concurrent-write')
  assert.strictEqual(ctx.adapter.updateCalls.length, 0)
})

test('missing remote project → clean error, no writes', async () => {
  const ctx = setup()
  ctx.adapter.readProject = async () => null
  const r = await run(ctx)
  assert.strictEqual(r.ok, false)
  assert.match(r.error, /not found/)
})
