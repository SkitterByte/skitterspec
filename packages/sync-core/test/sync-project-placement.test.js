'use strict'

// The spec issue's Linear PROJECT is deliberately outside the engine: the picker
// runs skill-side and `project` is sent on the create call only. These tests pin
// that — the projection, the plan and the last-pushed snapshot must never carry
// it, so a PM re-homing a spec issue in Linear can't surface as drift or be
// silently overwritten on the next push.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { push, recordPush, projectionOf } = require('../src/push.js')
const { planChanges, snapshotOf } = require('../src/compare.js')
const { neutralConfig } = require('./_config.js')

const ID = 'ENG-1'

function specTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'placement-'))
  const dir = path.join(root, 'specs', 'in-progress', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    '---\nlinear_identifier: "ENG-1"\n---\n\n# Demo\n\n## Problem\n\nBody prose.\n',
  )
  fs.writeFileSync(
    path.join(dir, '01-outbox.md'),
    '---\nlinear_issue_id: "ENG-2"\n---\n\n# Phase 1 — Durable outbox ⬜\n\n**Goal:** a durable place.\n',
  )
  return { root, dir }
}

// A config carrying the picker's default, as the real loader would.
function configWithProject(projectId) {
  return { ...neutralConfig(), linear: { teamKey: '', teamId: 'T1', projectId } }
}

test('the projection carries no project — only description, status, subIssues', () => {
  const { dir } = specTree()
  const projection = projectionOf(dir, configWithProject('proj-a'))
  assert.deepStrictEqual(Object.keys(projection).sort(), ['description', 'status', 'subIssues'])
})

test('the plan never carries a project, on create or update', () => {
  const { dir } = specTree()
  const config = configWithProject('proj-a')
  const create = planChanges(projectionOf(dir, config), null)
  assert.doesNotMatch(JSON.stringify(create), /project/i, 'create plan is project-free')

  const recorded = snapshotOf(projectionOf(dir, config))
  fs.writeFileSync(path.join(dir, '00-overview.md'), '---\nlinear_identifier: "ENG-1"\n---\n\n# Demo\n\n## Problem\n\nChanged prose.\n')
  const update = planChanges(projectionOf(dir, config), recorded)
  assert.ok(update.issue, 'the description change does push')
  assert.doesNotMatch(JSON.stringify(update), /project/i, 'update plan is project-free')
})

test('the recorded snapshot never carries a project', () => {
  const { dir } = specTree()
  const snap = snapshotOf(projectionOf(dir, configWithProject('proj-a')))
  assert.doesNotMatch(JSON.stringify(snap), /project/i)
})

test('a Linear-side project move produces an empty plan — nothing to drift', () => {
  const { root, dir } = specTree()
  const config = configWithProject('proj-a')
  recordPush({ dir: root, snapshotDir: dir, identifier: ID, config })

  // Someone in Linear drags the spec issue into another project. The engine never
  // reads Linear, so the only thing that could leak is config — change that too.
  const moved = configWithProject('proj-b-somewhere-else')
  const second = push({ dir: root, snapshotDir: dir, identifier: ID, config: moved })

  assert.strictEqual(second.empty, true, 'the mirror is still up to date')
  assert.ok(!second.plan.issue, 'no issue update planned — the key is simply absent')
  assert.deepStrictEqual(second.plan.subIssues.create, [])
  assert.deepStrictEqual(second.plan.subIssues.update, [])
})

test('clearing projectId entirely also leaves the plan empty', () => {
  const { root, dir } = specTree()
  recordPush({ dir: root, snapshotDir: dir, identifier: ID, config: configWithProject('proj-a') })
  const cleared = push({ dir: root, snapshotDir: dir, identifier: ID, config: configWithProject('') })
  assert.strictEqual(cleared.empty, true)
})

test('a real content change still pushes — the guard is not just "always empty"', () => {
  const { root, dir } = specTree()
  const config = configWithProject('proj-a')
  recordPush({ dir: root, snapshotDir: dir, identifier: ID, config })
  fs.writeFileSync(path.join(dir, '00-overview.md'), '---\nlinear_identifier: "ENG-1"\n---\n\n# Demo\n\n## Problem\n\nReworded.\n')
  const after = push({ dir: root, snapshotDir: dir, identifier: ID, config })
  assert.strictEqual(after.empty, false)
})
