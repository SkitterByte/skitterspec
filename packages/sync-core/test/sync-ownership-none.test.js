'use strict'

/**
 * `none` — how a repo DECLINES a field, and why it must be indistinguishable
 * from never having listed it.
 *
 * The whole point is that `undefined` is already the entire downstream
 * vocabulary for "not in play": `compare.js` hashes a field only when it is
 * defined, and the status report prints an assignee line only when it is
 * defined. So `none` has exactly one job — produce that same absence — and the
 * tests below are about proving it produces an ABSENCE rather than a `null`.
 *
 * The two are not interchangeable and the difference is expensive. `null` is a
 * value the projection ASSERTS: it is how a finished spec hands its issue back.
 * Write it for a field the repo declined and the next push clears in the
 * tracker precisely what declining ownership promised not to touch.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { projectionOf } = require('../src/push.js')
const { planChanges, snapshotOf } = require('../src/compare.js')
const { ownsField } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

const withAssignee = (dir) => {
  const c = neutralConfig()
  c.sync.fieldOwnership.assignee = dir
  return c
}

// A live spec carrying a stamp — so anything missing downstream is the config's
// doing and not the file's.
function stampedSpec() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-none-'))
  const dir = path.join(root, 'specs', 'in-progress', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    '---\nlinear_identifier: "ENG-1"\nlinear_assignee_id: "user-1"\n---\n\n# Demo\n\n## Problem\n\nProse.\n',
  )
  fs.writeFileSync(path.join(dir, '01-thing.md'), '# Phase 1 — Thing ⬜\n\n**Goal:** a thing.\n')
  return dir
}

// --- ownsField ---------------------------------------------------------------

test('ownsField reads the value, not the key', () => {
  assert.strictEqual(ownsField(withAssignee('push'), 'assignee'), true)
  assert.strictEqual(ownsField(withAssignee('both'), 'assignee'), true)
  assert.strictEqual(ownsField(withAssignee('none'), 'assignee'), false)
  assert.strictEqual(ownsField(neutralConfig(), 'assignee'), false, 'unlisted is not owned')
})

test('ownsField answers false rather than throwing on a config with no sync block', () => {
  // It is asked from `doctor`, which runs against half-configured repos on
  // purpose. A throw there would turn a diagnostic into a crash.
  for (const c of [null, undefined, {}, { sync: {} }]) {
    assert.strictEqual(ownsField(c, 'assignee'), false)
  }
})

// --- the projection ----------------------------------------------------------

test('a declined field is ABSENT from the projection, not null', () => {
  const p = projectionOf(stampedSpec(), withAssignee('none'))
  assert.strictEqual('assignee' in p, false, 'null would be an assertion; this must be an absence')
})

test('declining is indistinguishable from never listing the field', () => {
  const declined = projectionOf(stampedSpec(), withAssignee('none'))
  const unlisted = projectionOf(stampedSpec(), neutralConfig())
  assert.deepStrictEqual(Object.keys(declined).sort(), Object.keys(unlisted).sort())
})

test('a declined field writes no hash into the snapshot', () => {
  // "Inert" has to include the files we write, or opting in later would find a
  // history of hashes the repo never agreed to.
  const snap = snapshotOf(projectionOf(stampedSpec(), withAssignee('none')))
  assert.ok(!('assignee' in snap.issueFields))
})

test('a declined field pushes nothing, even against a snapshot that has one', () => {
  // The dangerous direction: a repo that pushed assignments, then declined the
  // field. Declining must stop writing — it must not RETRACT what it stopped
  // owning, which is what a projected null would do here.
  const owningSnap = snapshotOf(projectionOf(stampedSpec(), withAssignee('push')))
  assert.ok('assignee' in owningSnap.issueFields, 'the fixture has to actually have one')

  const plan = planChanges(projectionOf(stampedSpec(), withAssignee('none')), owningSnap)
  assert.strictEqual(plan.issue, undefined, 'declining is not an unassign')
})

// --- stays silent ------------------------------------------------------------

test('a repo that owns the field is completely unaffected', () => {
  // The healthy-but-unusual input: nothing above may cost an opted-in repo its
  // assignment. This is the test that fails if `toFieldSet` starts skipping on
  // the wrong condition.
  const p = projectionOf(stampedSpec(), withAssignee('push'))
  assert.strictEqual(p.assignee, 'user-1')

  const snap = snapshotOf(p)
  assert.ok('assignee' in snap.issueFields)

  const unassigned = { ...p, assignee: null }
  assert.deepStrictEqual(planChanges(p, snapshotOf(unassigned)).issue, { assignee: 'user-1' })
})

test('declining one field leaves the others owned', () => {
  // `none` is per-field. A config declining `assignee` must still push prose and
  // state, or the opt-out would silently disable the whole mirror.
  const p = projectionOf(stampedSpec(), withAssignee('none'))
  assert.ok(typeof p.description === 'string' && p.description.length)
  assert.strictEqual(p.status, 'in-progress')
})
