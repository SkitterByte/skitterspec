'use strict'

// `mapping.phases: 'deferred'` — a spec that has not started projects the issue
// alone, so adopting sync on a long backlog costs one call per spec instead of
// one per spec PLUS one per phase. The phases arrive when the work does.
//
// The deferral is a filter on the projection, not a new lifecycle: the snapshot
// records only sub-issues that HAVE an id, so a withheld phase is already absent
// from it and reappears as a plain `create` the moment it projects.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, phasesWithheld } = require('../src/normalize.js')
const { push, recordPush } = require('../src/push.js')
const { neutralConfig } = require('./_config.js')

function config(phases, tasks = 'none') {
  const c = neutralConfig()
  c.mapping = { ...c.mapping, phases, tasks }
  return c
}

// A two-phase spec in `bucket`. `ids` optionally stamps a phase's
// `linear_issue_id`, i.e. marks it already mirrored.
function specTree(bucket, ids = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deferred-'))
  const dir = path.join(root, 'specs', bucket, 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    '# Demo\n\n## Problem\n\nBody prose.\n\n## Phases\n\n' +
      '| # | Phase | Status | File |\n|---|-------|--------|------|\n' +
      '| 1 | Outbox | ⬜ | [01-outbox.md](01-outbox.md) |\n' +
      '| 2 | Api | ⬜ | [02-api.md](02-api.md) |\n',
  )
  for (const [file, name] of [['01-outbox', 'Outbox'], ['02-api', 'Api']]) {
    const fm = ids[file] ? `---\nlinear_issue_id: "${ids[file]}"\n---\n\n` : ''
    fs.writeFileSync(path.join(dir, `${file}.md`), `${fm}# Phase — ${name} ⬜\n\n**Goal:** do ${name}.\n`)
  }
  return { root, dir }
}

test('subissue (the default) projects every phase, whatever the bucket', () => {
  for (const bucket of ['backlog', 'in-progress', 'complete', 'cancelled']) {
    const { dir } = specTree(bucket)
    const local = normalizeLocal(dir, config('subissue'))
    assert.strictEqual(local.subIssues.length, 2, `${bucket}: both phases project`)
    assert.strictEqual(phasesWithheld(dir, config('subissue')), 0)
  }
})

test('deferred + backlog withholds unlinked phases from the projection', () => {
  const { dir } = specTree('backlog')
  const local = normalizeLocal(dir, config('deferred'))
  assert.deepStrictEqual(local.subIssues, [], 'nothing to mint for unstarted work')
  assert.strictEqual(phasesWithheld(dir, config('deferred')), 2)
})

test('deferred keeps the Phases index in the description while it withholds', () => {
  const { dir } = specTree('backlog')
  const deferred = normalizeLocal(dir, config('deferred')).description
  const always = normalizeLocal(dir, config('subissue')).description
  assert.match(deferred, /## Phases/, 'the index is the only place the phases appear')
  assert.doesNotMatch(always, /## Phases/, 'stripped as before when sub-issues carry them')
})

test('deferred still projects a phase that is already linked', () => {
  // One-way sync has no delete: withholding a LIVE sub-issue would freeze it in
  // the tracker, not remove it. So switching a project to `deferred` mid-flight
  // must never strand what is already mirrored.
  const { dir } = specTree('backlog', { '01-outbox': 'ENG-9' })
  const local = normalizeLocal(dir, config('deferred'))
  assert.strictEqual(local.subIssues.length, 1)
  assert.strictEqual(local.subIssues[0].id, 'ENG-9')
  assert.strictEqual(phasesWithheld(dir, config('deferred')), 1)
  assert.match(local.description, /## Phases/, 'one phase is still withheld, so the index stays')
})

test('deferred strips Phases again once nothing is withheld', () => {
  const { dir } = specTree('backlog', { '01-outbox': 'ENG-9', '02-api': 'ENG-10' })
  const local = normalizeLocal(dir, config('deferred'))
  assert.strictEqual(local.subIssues.length, 2)
  assert.strictEqual(phasesWithheld(dir, config('deferred')), 0)
  assert.doesNotMatch(local.description, /## Phases/)
})

test('deferred projects everything once the spec is in progress', () => {
  for (const bucket of ['in-progress', 'complete']) {
    const { dir } = specTree(bucket)
    assert.strictEqual(normalizeLocal(dir, config('deferred')).subIssues.length, 2, bucket)
    assert.strictEqual(phasesWithheld(dir, config('deferred')), 0, bucket)
  }
})

test('deferred also withholds a spec cancelled without ever starting', () => {
  // Never worked, so its phases were never worth minting. One cancelled MID-
  // flight has ids already, and the linked-phase rule keeps projecting those.
  const { dir } = specTree('cancelled')
  assert.deepStrictEqual(normalizeLocal(dir, config('deferred')).subIssues, [])

  const { dir: midFlight } = specTree('cancelled', { '01-outbox': 'ENG-9' })
  assert.strictEqual(normalizeLocal(midFlight, config('deferred')).subIssues.length, 1)
})

test('a spec_status override drives the withhold, not the folder', () => {
  // The status the issue gets and the sub-issues it gets must agree on whether
  // work has started, however that status was arrived at.
  const { dir } = specTree('backlog')
  const overview = path.join(dir, '00-overview.md')
  fs.writeFileSync(overview, '---\nspec_status: in-progress\n---\n\n' + fs.readFileSync(overview, 'utf-8'))
  const local = normalizeLocal(dir, config('deferred'))
  assert.strictEqual(local.workflowState, 'in-progress')
  assert.strictEqual(local.subIssues.length, 2, 'in-progress by frontmatter → phases project')
})

test('the deferral needs no snapshot state: phases appear as plain creates on start', () => {
  const { root, dir } = specTree('backlog')
  const cfg = config('deferred')
  const ID = 'ENG-1'

  // Push while unstarted: the issue alone, and the plan says why.
  const first = push({ dir: root, snapshotDir: dir, identifier: ID, config: cfg })
  assert.strictEqual(first.plan.subIssues.create.length, 0, '1 call, not 3')
  assert.ok(first.plan.issue, 'the spec issue still pushes')
  assert.strictEqual(first.plan.phasesDeferred, 2)
  recordPush({ dir: root, snapshotDir: dir, identifier: ID, config: cfg })

  // A second push is empty — the deferral is stable, not a permanent diff.
  const second = push({ dir: root, snapshotDir: dir, identifier: ID, config: cfg })
  assert.ok(second.empty, 'nothing pending while the spec sits in the backlog')

  // Start it. Against the SAME recorded snapshot, both phases now plan as creates.
  const started = path.join(root, 'specs', 'in-progress')
  fs.mkdirSync(started, { recursive: true })
  fs.renameSync(dir, path.join(started, 'demo'))
  const onStart = push({ dir: root, snapshotDir: path.join(started, 'demo'), identifier: ID, config: cfg })
  assert.strictEqual(onStart.plan.subIssues.create.length, 2)
  assert.strictEqual(onStart.plan.subIssues.update.length, 0, 'creates, never duplicates')
  assert.strictEqual(onStart.plan.phasesDeferred, undefined, 'nothing withheld any more')
  assert.ok(onStart.plan.issue, 'the description drops its Phases index in the same push')
})

test('phasesDeferred never reaches a hash — it cannot make a spec look edited', () => {
  const { root, dir } = specTree('backlog')
  const cfg = config('deferred')
  const before = push({ dir: root, snapshotDir: dir, identifier: 'ENG-1', config: cfg })
  recordPush({ dir: root, snapshotDir: dir, identifier: 'ENG-1', config: cfg })
  const after = push({ dir: root, snapshotDir: dir, identifier: 'ENG-1', config: cfg })
  assert.strictEqual(before.plan.phasesDeferred, 2)
  assert.strictEqual(after.plan.phasesDeferred, 2, 'still reported')
  assert.ok(after.empty, 'but the plan is empty')
})
