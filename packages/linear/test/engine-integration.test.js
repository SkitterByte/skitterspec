'use strict'

// Integration: the Linear adapter (config loader + MCP adapter) drives the real
// provider-neutral engine from @skitterbyte/skitterspec-sync-core. A fake callTool
// stands in for the live Linear MCP server — no network, deterministic.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { pull, push, normalizeLocal, writeBase } = require('@skitterbyte/skitterspec-sync-core')
const { loadLinearConfig } = require('../src/config.js')
const { makeAdapter } = require('../src/mcp.js')

const TS = '2026-01-02T03:04:05.000Z'
const ID = 'ENG-42'
const PROJECT_ID = 'proj_1'

const OVERVIEW = `---
linear_identifier: "ENG-42"
linear_project_id: "proj_1"
spec_status: "in-progress"
priority: 2
labels: ["a"]
---

# Demo

## Problem

Local problem text.
`

// Resolved Linear tool names (what discoverLinear would return), wired to a fake
// callTool so makeAdapter's readProject/updateProject hit an in-memory project.
function linearAdapter(project) {
  const resolved = { projectRead: 'linear_getProject', projectUpdate: 'linear_updateProject' }
  const callTool = async (name, args) => {
    if (name === resolved.projectRead) return { ...project }
    if (name === resolved.projectUpdate) {
      const { id, ...updates } = args
      Object.assign(project, updates, { updatedAt: 't1' })
      return { ...project }
    }
    throw new Error(`unexpected tool: ${name}`)
  }
  return makeAdapter(callTool, resolved)
}

function setup({ remoteOverrides = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-linear-'))
  const specDir = path.join(dir, 'spec')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), OVERVIEW, 'utf-8')

  const { config, present } = loadLinearConfig(dir)
  assert.strictEqual(present, false) // no live linear.config.json → defaults
  const localNorm = normalizeLocal(specDir, config)

  const project = {
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
  const base = { ...localNorm, __meta: { updatedAt: 't0', syncedAt: 't0' } }
  writeBase(dir, ID, config, base)

  return { dir, specDir, config, localNorm, adapter: linearAdapter(project), project }
}

test('Linear config + MCP adapter drive a sync-core pull (remote-only fields applied)', async () => {
  const ctx = setup({ remoteOverrides: { state: 'Done', priority: 5 } })
  const r = await pull({
    dir: ctx.dir,
    snapshotDir: ctx.specDir,
    identifier: ID,
    projectId: PROJECT_ID,
    adapter: ctx.adapter,
    config: ctx.config,
    force: false,
    timestamp: TS,
  })
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.applied.sort(), ['priority', 'workflowState'])

  // The Linear `states` map (Done → complete) drove the neutral engine's write.
  const raw = fs.readFileSync(path.join(ctx.specDir, '00-overview.md'), 'utf-8')
  assert.match(raw, /spec_status: "?complete"?/)
})

test('Linear MCP adapter round-trips a sync-core push through updateProject', async () => {
  const ctx = setup({ remoteOverrides: { description: 'OLD' } })
  // Diverge base+remote from local so `description` (a both-owned field) is pushable.
  writeBase(ctx.dir, ID, ctx.config, {
    ...ctx.localNorm,
    description: 'OLD',
    __meta: { updatedAt: 't0', syncedAt: 't0' },
  })
  const r = await push({
    dir: ctx.dir,
    snapshotDir: ctx.specDir,
    identifier: ID,
    projectId: PROJECT_ID,
    adapter: ctx.adapter,
    config: ctx.config,
    force: false,
    timestamp: TS,
  })
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.written, ['description'])
  // updateProject actually landed the local description on the remote project.
  assert.strictEqual(ctx.project.description, ctx.localNorm.description)
})
