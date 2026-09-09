'use strict'

/**
 * The spec issue's ASSIGNEE, as a fourth thing the repo can own.
 *
 * Two rules carry this whole feature, and both are about NOT writing:
 *
 *   1. **Unset means don't touch.** A spec with no recorded assignee sends no
 *      assignee, so a PM's triage assignment on a backlog issue survives.
 *   2. **An absent snapshot key means "never pushed", not "was null".** Every
 *      spec linked before this existed has such a snapshot. Read the other way,
 *      the first push after upgrade emits a clear against every one of them —
 *      workspace-wide, in one command.
 *
 * The positive tests below prove assignment can happen at all. The ones under
 * "stays silent" are the ones that matter: they prove it does not happen to
 * everyone else (`.claude/rules/negative-checks.md`).
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { planChanges, snapshotOf, specIssueHash } = require('../src/compare.js')

// `assignee: undefined` is a repo that never opted in; `assignee: null` is one
// that opted in with nobody assigned. The distinction is the whole design.
const OPTED_OUT = { description: '# Spec', status: 'in-progress', subIssues: [] }
const UNASSIGNED = { ...OPTED_OUT, assignee: null }
const ASSIGNED = { ...OPTED_OUT, assignee: 'user-1' }

// --- assigning ---------------------------------------------------------------

test('a newly recorded assignee is pushed', () => {
  const plan = planChanges(ASSIGNED, snapshotOf(UNASSIGNED))
  assert.deepStrictEqual(plan.issue, { assignee: 'user-1' })
})

test('an unchanged assignee plans nothing — the push is idempotent', () => {
  const plan = planChanges(ASSIGNED, snapshotOf(ASSIGNED))
  assert.strictEqual(plan.issue, undefined)
})

test('a handover to another person is pushed', () => {
  const plan = planChanges({ ...ASSIGNED, assignee: 'user-2' }, snapshotOf(ASSIGNED))
  assert.deepStrictEqual(plan.issue, { assignee: 'user-2' })
})

test('an assignee we pushed before IS cleared when it goes away', () => {
  // This is what /spec-complete relies on: the bucket move drives the projection
  // to null, and the recorded hash is the positive signal that makes clearing it
  // our own retraction rather than a guess at someone else's.
  const plan = planChanges(UNASSIGNED, snapshotOf(ASSIGNED))
  assert.deepStrictEqual(plan.issue, { assignee: null })
})

test('the assignee diffs independently of description and state', () => {
  const plan = planChanges({ ...ASSIGNED, description: 'New' }, snapshotOf(ASSIGNED))
  assert.deepStrictEqual(plan.issue, { description: 'New' })
  assert.ok(!('assignee' in plan.issue), 'a prose edit must not re-assert the assignment')
})

test('a first push carries the assignee alongside the rest', () => {
  for (const snap of [null, undefined, {}]) {
    const plan = planChanges(ASSIGNED, snap)
    assert.strictEqual(plan.issue.assignee, 'user-1')
  }
})

// --- stays silent ------------------------------------------------------------

test('a repo that never opted in pushes no assignee, even with one recorded', () => {
  // `assignee` absent from sync.fieldOwnership → normalizeLocal drops the key →
  // the projection has `undefined`, and the feature must be completely inert.
  const withStamp = { ...OPTED_OUT }
  const plan = planChanges(withStamp, snapshotOf(withStamp))
  assert.strictEqual(plan.issue, undefined)
})

test('an opted-out repo records no assignee hash in its snapshot', () => {
  const snap = snapshotOf(OPTED_OUT)
  assert.ok(!('assignee' in snap.issueFields), 'inert has to include the files we write')
})

test('THE UPGRADE CASE: a pre-feature snapshot does not emit a clear', () => {
  // The bill for getting this wrong is every linked spec's assignee, wiped on
  // the first push after upgrading. The snapshot below is exactly what those
  // specs have on disk: split hashes, but no assignee key.
  const preFeature = snapshotOf(OPTED_OUT)
  assert.ok(!('assignee' in preFeature.issueFields))
  const plan = planChanges(UNASSIGNED, preFeature)
  assert.strictEqual(plan.issue, undefined, 'absence is "never pushed", not "was null"')
})

test('a pre-feature snapshot still lets a real assignment through', () => {
  // The other half of the same rule: silence on absence must not become silence
  // altogether, or opting in would never take effect on an existing spec.
  const plan = planChanges(ASSIGNED, snapshotOf(OPTED_OUT))
  assert.deepStrictEqual(plan.issue, { assignee: 'user-1' })
})

test('an OLD combined-hash snapshot asserts but never clears', () => {
  // Pre-split snapshots cannot say whether an assignee was ever pushed — it was
  // never one of the combined hash's inputs, so the two projections below hash
  // identically. Unknown routes to the harmless branch in BOTH directions: send
  // an assignee we have, stay quiet about one we do not.
  const oldShape = (p) => ({ issue: specIssueHash(p), subIssues: {} })

  const cleared = planChanges(UNASSIGNED, oldShape(ASSIGNED))
  assert.strictEqual(cleared.issue, undefined, 'no clear is guessed at')

  // And the assert direction must still work, or opting in would strand the
  // assignment until some unrelated prose edit happened to push.
  const asserted = planChanges(ASSIGNED, oldShape(UNASSIGNED))
  assert.deepStrictEqual(asserted.issue, { assignee: 'user-1' })
})

test('an old-snapshot assert still sends description and state when those moved', () => {
  const oldShape = (p) => ({ issue: specIssueHash(p), subIssues: {} })
  const plan = planChanges({ ...ASSIGNED, status: 'complete' }, oldShape(ASSIGNED))
  // `complete` is terminal, so a real projection would have nulled the assignee;
  // this asserts the legacy path still carries the other two fields.
  assert.strictEqual(plan.issue.state, 'complete')
  assert.strictEqual(plan.issue.description, ASSIGNED.description)
})

test('a never-assigned spec completing clears nothing', () => {
  // The PM-triage case end to end: nobody was ever recorded, the spec finishes,
  // and the projection goes null — which must NOT reach Linear as an unassign.
  const done = { ...UNASSIGNED, status: 'complete' }
  const plan = planChanges(done, snapshotOf(UNASSIGNED))
  assert.ok(plan.issue, 'the bucket moved, so the state is still pushed')
  assert.deepStrictEqual(plan.issue, { state: 'complete' })
  assert.ok(!('assignee' in plan.issue))
})
