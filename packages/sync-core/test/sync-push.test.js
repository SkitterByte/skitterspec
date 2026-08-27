'use strict'

// One-way push engine: build a plan by diffing the local projection against the
// last-pushed snapshot; record the snapshot after apply; a second push is empty.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { push, recordPush } = require('../src/push.js')
const { planChanges, snapshotOf, isEmptyPlan } = require('../src/compare.js')
const { stampSubIssueId } = require('../src/write.js')
const { neutralConfig } = require('./_config.js')

const ID = 'ENG-1'

function config() {
  return neutralConfig() // {description, subIssues, workflowState}
}

function snapshot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oneway-'))
  const dir = path.join(root, 'specs', 'in-progress', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), '---\nspec_status: in-progress\n---\n\n# Demo\n\n## Problem\n\nBody prose.\n')
  fs.writeFileSync(
    path.join(dir, '01-outbox.md'),
    '# Phase 1 — Durable outbox ⬜\n\n**Goal:** a durable place.\n\n## Tasks\n\n' +
      '- [ ] Add the outbox table. Modelled on the notification outbox and more.\n' +
      '- [x] Wire the enqueue path\n',
  )
  return { root, dir }
}

test('planChanges/snapshotOf are a create→record→empty loop', () => {
  const projection = {
    description: 'd',
    status: 'in-progress',
    subIssues: [{ id: null, ref: '01', name: 'M', goal: 'g', state: 'backlog' }],
  }
  const plan1 = planChanges(projection, null)
  assert.strictEqual(plan1.subIssues.create.length, 1)
  assert.ok(plan1.issue, 'spec issue pushed on first run')

  // After apply the sub-issue gains an id; record the snapshot from it.
  const stamped = { ...projection, subIssues: [{ ...projection.subIssues[0], id: 'sub1' }] }
  const snap = snapshotOf(stamped)
  const plan2 = planChanges(stamped, snap)
  assert.ok(isEmptyPlan(plan2), 'nothing to push after recording')

  // Editing a sub-issue (goal or state) → a single update.
  const edited = { ...stamped, subIssues: [{ ...stamped.subIssues[0], goal: 'g EDITED' }] }
  const plan3 = planChanges(edited, snap)
  assert.strictEqual(plan3.subIssues.update.length, 1)
  assert.strictEqual(plan3.subIssues.update[0].id, 'sub1')
  assert.ok(!plan3.issue, 'spec issue unchanged')

  // Editing the spec issue prose → plan.issue, no sub-issue churn.
  const editedIssue = { ...stamped, description: 'd EDITED' }
  const plan4 = planChanges(editedIssue, snap)
  assert.ok(plan4.issue, 'spec issue changed')
  assert.strictEqual(plan4.subIssues.create.length + plan4.subIssues.update.length, 0)
})

test('push over a real snapshot creates, then records, then is idempotent', () => {
  const { root, dir } = snapshot()
  const cfg = config()

  const r1 = push({ dir: root, snapshotDir: dir, identifier: ID, config: cfg })
  assert.strictEqual(r1.empty, false)
  assert.ok(r1.plan.issue, 'spec issue pushed on first run')
  assert.strictEqual(r1.plan.subIssues.create.length, 1)
  assert.strictEqual(r1.plan.subIssues.create[0].name, 'Durable outbox')
  assert.strictEqual(r1.plan.subIssues.create[0].goal, 'a durable place.')
  assert.strictEqual(r1.plan.subIssues.create[0].state, 'backlog') // ⬜ heading

  // Simulate the skill applying + stamping the returned sub-issue id, then recording.
  stampSubIssueId(dir, '01-outbox.md', 'sub1')
  recordPush({ dir: root, snapshotDir: dir, identifier: ID, config: cfg })

  const r2 = push({ dir: root, snapshotDir: dir, identifier: ID, config: cfg })
  assert.ok(r2.empty, `second push should be empty, got ${JSON.stringify(r2.plan)}`)
})
