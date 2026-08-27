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
const { stampMilestoneId, stampIssueId } = require('../src/write.js')
const { neutralConfig } = require('./_config.js')

const ID = 'ENG-1'

function config() {
  const c = neutralConfig()
  for (const k of ['phaseBodies', 'acceptanceCriteria', 'taskBreakdown']) delete c.sync.fieldOwnership[k]
  c.sync.fieldOwnership.tasks = 'push'
  c.sync.fieldOwnership.milestones = 'push'
  return c
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
    milestones: [{ id: null, ref: '01', name: 'M', goal: 'g' }],
    issues: [{ id: null, ref: 'task a', title: 'task a', description: 'task a', done: false, milestoneRef: '01' }],
  }
  const plan1 = planChanges(projection, null)
  assert.strictEqual(plan1.milestones.create.length, 1)
  assert.strictEqual(plan1.issues.create.length, 1)
  assert.ok(plan1.project, 'project pushed on first run')

  // After apply the items gain ids; record the snapshot from the stamped projection.
  const stamped = {
    ...projection,
    milestones: [{ ...projection.milestones[0], id: 'm1' }],
    issues: [{ ...projection.issues[0], id: 'SKI-1' }],
  }
  const snap = snapshotOf(stamped)
  const plan2 = planChanges(stamped, snap)
  assert.ok(isEmptyPlan(plan2), 'nothing to push after recording')

  // Editing an issue → a single update; a title-only edit is detected.
  const edited = { ...stamped, issues: [{ ...stamped.issues[0], description: 'task a EDITED', title: 'task a EDITED' }] }
  const plan3 = planChanges(edited, snap)
  assert.strictEqual(plan3.issues.update.length, 1)
  assert.strictEqual(plan3.issues.update[0].id, 'SKI-1')
  assert.strictEqual(plan3.milestones.create.length + plan3.milestones.update.length, 0)
})

test('push over a real snapshot creates, then records, then is idempotent', () => {
  const { root, dir } = snapshot()
  const cfg = config()

  const r1 = push({ dir: root, snapshotDir: dir, identifier: ID, config: cfg })
  assert.strictEqual(r1.empty, false)
  assert.strictEqual(r1.plan.milestones.create.length, 1)
  assert.strictEqual(r1.plan.issues.create.length, 2)
  // issue titles are first-sentence; descriptions are the full text
  const withSentence = r1.plan.issues.create.find((i) => /Add the outbox table/.test(i.title))
  assert.strictEqual(withSentence.title, 'Add the outbox table')
  assert.match(withSentence.description, /Modelled on the notification outbox/)

  // Simulate the skill applying + stamping the returned ids, then recording.
  stampMilestoneId(dir, '01-outbox.md', 'm1')
  stampIssueId(dir, r1.plan.issues.create[0].ref, 'SKI-1')
  stampIssueId(dir, r1.plan.issues.create[1].ref, 'SKI-2')
  recordPush({ dir: root, snapshotDir: dir, identifier: ID, config: cfg })

  const r2 = push({ dir: root, snapshotDir: dir, identifier: ID, config: cfg })
  assert.ok(r2.empty, `second push should be empty, got ${JSON.stringify(r2.plan)}`)
})
