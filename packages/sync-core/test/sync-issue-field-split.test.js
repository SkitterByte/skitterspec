'use strict'

/**
 * The spec issue's description and workflow state diff INDEPENDENTLY.
 *
 * They used to share one hash, so `plan.issue` always carried both — and any
 * prose edit re-asserted the state. That is harmless while the repo is the only
 * writer, and wrong the moment a deploy pipeline owns the state past `complete`:
 * a typo fix in a finished spec would drag its ticket back out of the pipeline.
 *
 * The back-compat case matters as much as the split: a snapshot written before
 * this change cannot say which field moved, so it must fall back to sending both
 * rather than guess and withhold one.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { planChanges, snapshotOf, issueChanges, specIssueHash } = require('../src/compare.js')

const SPEC = { description: '# Spec\n\nProse.', status: 'complete', subIssues: [] }

test('an unchanged spec plans no issue write at all', () => {
  const plan = planChanges(SPEC, snapshotOf(SPEC))
  assert.strictEqual(plan.issue, undefined)
})

// The bug this phase exists for.
test('a description-only edit does NOT re-assert the state', () => {
  const snap = snapshotOf(SPEC)
  const plan = planChanges({ ...SPEC, description: '# Spec\n\nBetter prose.' }, snap)
  assert.deepStrictEqual(plan.issue, { description: '# Spec\n\nBetter prose.' })
  assert.ok(!('state' in plan.issue), 'the state someone else now owns is untouched')
})

// The handoff push must still work: /spec-complete moves the bucket, and that
// write is what puts the ticket into the pipeline in the first place.
test('a bucket move still writes the state', () => {
  const started = { ...SPEC, status: 'in-progress' }
  const snap = snapshotOf(started)
  const plan = planChanges({ ...started, status: 'complete' }, snap)
  assert.deepStrictEqual(plan.issue, { state: 'complete' })
})

test('both changing sends both', () => {
  const snap = snapshotOf(SPEC)
  const plan = planChanges({ ...SPEC, description: 'New', status: 'cancelled' }, snap)
  assert.deepStrictEqual(plan.issue, { description: 'New', state: 'cancelled' })
})

test('a first push (no snapshot) sends both fields', () => {
  for (const snap of [null, undefined, {}]) {
    const plan = planChanges(SPEC, snap)
    assert.deepStrictEqual(plan.issue, { description: SPEC.description, state: 'complete' })
  }
})

// --- back-compat: a snapshot written before the split -----------------------

const oldShape = (p) => ({ issue: specIssueHash(p), subIssues: {} })

test('an old-shape snapshot falls back to sending both fields', () => {
  const plan = planChanges({ ...SPEC, description: 'Edited' }, oldShape(SPEC))
  assert.deepStrictEqual(
    plan.issue,
    { description: 'Edited', state: 'complete' },
    'cannot tell which field moved, so it sends both rather than withholding one',
  )
})

// The STAYS-SILENT case: an old snapshot of an UNCHANGED spec must still plan
// nothing. Falling back must not mean "push everything again".
test('an old-shape snapshot of an unchanged spec still plans nothing', () => {
  const plan = planChanges(SPEC, oldShape(SPEC))
  assert.strictEqual(plan.issue, undefined)
})

test('a malformed issueFields is treated as unknown, not as a match', () => {
  for (const fields of [null, 'nope', [], 42]) {
    const snap = { issue: specIssueHash(SPEC), issueFields: fields, subIssues: {} }
    assert.strictEqual(issueChanges(SPEC, snap), null, 'unchanged spec stays silent')
    const edited = issueChanges({ ...SPEC, description: 'X' }, snap)
    assert.deepStrictEqual(edited, { description: 'X', state: 'complete' })
  }
})

test('the snapshot records both shapes, so either reader works', () => {
  const snap = snapshotOf(SPEC)
  assert.strictEqual(snap.issue, specIssueHash(SPEC), 'the combined hash is still written')
  assert.strictEqual(typeof snap.issueFields.description, 'string')
  assert.strictEqual(typeof snap.issueFields.state, 'string')
  assert.notStrictEqual(snap.issueFields.description, snap.issueFields.state)
})

// A spec passes through the unknown branch exactly once: the push that follows
// rewrites the snapshot in the new shape.
test('one push through the fallback upgrades the snapshot shape', () => {
  const edited = { ...SPEC, description: 'Edited' }
  const first = planChanges(edited, oldShape(SPEC))
  assert.ok('state' in first.issue, 'the fallback push sent both')
  const upgraded = snapshotOf(edited)
  const second = planChanges({ ...edited, description: 'Edited again' }, upgraded)
  assert.deepStrictEqual(second.issue, { description: 'Edited again' }, 'and thereafter state is left alone')
})
