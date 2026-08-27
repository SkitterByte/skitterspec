'use strict'

// Integration: the Linear provider config (loadLinearConfig) drives the real
// provider-neutral one-way engine from @skitterbyte/skitterspec-sync-core. No
// network — push emits a plan; the skill (not the engine) applies it over MCP.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { push, recordPush, remoteWorkflowState, stampSubIssueId } = require('@skitterbyte/skitterspec-sync-core')
const { loadLinearConfig } = require('../src/config.js')

const ID = 'ENG-42'

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-linear-'))
  const specDir = path.join(dir, 'spec')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(
    path.join(specDir, '00-overview.md'),
    '---\nlinear_identifier: "ENG-42"\nspec_status: "in-progress"\npriority: 2\nlabels: ["a"]\n---\n\n# Demo\n\n## Problem\n\nLocal problem text.\n',
    'utf-8',
  )
  fs.writeFileSync(
    path.join(specDir, '01-outbox.md'),
    '# Phase 1 — Durable outbox ⬜\n\n**Goal:** a durable place.\n\n## Tasks\n\n- [ ] Add the outbox table. More detail here.\n- [x] Wire the enqueue path\n',
    'utf-8',
  )
  const { config, present } = loadLinearConfig(dir)
  assert.strictEqual(present, false) // no live linear.config.json → defaults
  return { dir, specDir, config }
}

test('provider config + one-way engine produce a create plan', () => {
  const { dir, specDir, config } = setup()
  const r = push({ dir, snapshotDir: specDir, identifier: ID, config })
  assert.strictEqual(r.empty, false)
  assert.ok(r.plan.issue, 'spec issue description/state pushed on first run')
  assert.strictEqual(r.plan.issue.state, 'in-progress')
  // one phase → one sub-issue; tasks are not synced
  assert.strictEqual(r.plan.subIssues.create.length, 1)
  assert.strictEqual(r.plan.subIssues.create[0].name, 'Durable outbox')
  assert.strictEqual(r.plan.subIssues.create[0].state, 'backlog') // ⬜ heading
  assert.strictEqual(r.plan.subIssues.update.length, 0)
})

test('after apply + record, the next push is empty (idempotent)', () => {
  const { dir, specDir, config } = setup()
  const r = push({ dir, snapshotDir: specDir, identifier: ID, config })
  for (const s of r.plan.subIssues.create) stampSubIssueId(specDir, `${s.ref}.md`, 'sub1')
  recordPush({ dir, snapshotDir: specDir, identifier: ID, config })
  assert.ok(push({ dir, snapshotDir: specDir, identifier: ID, config }).empty)
})

test('remoteWorkflowState maps a Linear issue state to the local bucket', () => {
  const { config } = setup()
  assert.strictEqual(remoteWorkflowState({ state: { name: 'Done' } }, config), 'complete')
  assert.strictEqual(remoteWorkflowState({ state: { name: 'In Progress' } }, config), 'in-progress')
})
