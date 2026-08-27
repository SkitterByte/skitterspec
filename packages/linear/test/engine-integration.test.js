'use strict'

// Integration: the Linear provider config (loadLinearConfig) drives the real
// provider-neutral one-way engine from @skitterbyte/skitterspec-sync-core. No
// network — push emits a plan; the skill (not the engine) applies it over MCP.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { push, recordPush, remoteWorkflowState, stampMilestoneId, stampIssueId } = require('@skitterbyte/skitterspec-sync-core')
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
  assert.ok(r.plan.project, 'project description/status pushed on first run')
  assert.strictEqual(r.plan.milestones.create.length, 1)
  assert.strictEqual(r.plan.milestones.create[0].name, 'Durable outbox')
  assert.strictEqual(r.plan.issues.create.length, 2)
  const first = r.plan.issues.create.find((i) => /Add the outbox table/.test(i.title))
  assert.strictEqual(first.title, 'Add the outbox table') // first sentence
  assert.match(first.description, /More detail here/) // full text
  assert.strictEqual(r.plan.project.status, 'in-progress')
})

test('after apply + record, the next push is empty (idempotent)', () => {
  const { dir, specDir, config } = setup()
  const r = push({ dir, snapshotDir: specDir, identifier: ID, config })
  stampMilestoneId(specDir, '01-outbox.md', 'm1')
  for (const iss of r.plan.issues.create) stampIssueId(specDir, iss.ref, iss.done ? 'SKI-9' : 'SKI-1')
  recordPush({ dir, snapshotDir: specDir, identifier: ID, config })
  assert.ok(push({ dir, snapshotDir: specDir, identifier: ID, config }).empty)
})

test('remoteWorkflowState maps a Linear project status to the local bucket', () => {
  const { config } = setup()
  assert.strictEqual(remoteWorkflowState({ status: { name: 'Completed' } }, config), 'complete')
  assert.strictEqual(remoteWorkflowState({ status: { name: 'In Progress' } }, config), 'in-progress')
})
