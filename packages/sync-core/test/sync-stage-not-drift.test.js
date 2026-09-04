'use strict'

/**
 * A declared deployment stage is POSITION, not drift.
 *
 * `bucketForState` lowercases a state it does not recognise, so before this
 * change "On Test" became "on test" — equal to no lifecycle bucket, and so
 * reported as drift against every deployed spec, for the entire time it sat in
 * the pipeline. The project declared those states downstream of `complete`, so
 * they are not a disagreement about where the spec is.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { bucketForState, stageForState, remoteStage, remoteWorkflowState } = require('../src/normalize.js')

const STATES = { backlog: 'Backlog', 'in-progress': 'In Progress', complete: 'Done', cancelled: 'Canceled' }
const LADDER = { states: STATES, release: { stages: [{ key: 'test', state: 'On Test' }, { key: 'demo', state: 'Ready for Demo' }] } }
const NO_LADDER = { states: STATES }

test('a declared rung maps to the bucket the ladder descends from', () => {
  assert.strictEqual(bucketForState('On Test', LADDER), 'complete')
  assert.strictEqual(bucketForState('Ready for Demo', LADDER), 'complete')
})

test('matching is case- and space-insensitive, like the bucket map', () => {
  assert.strictEqual(bucketForState('  on test  ', LADDER), 'complete')
})

test('a bucket state still wins over the ladder', () => {
  assert.strictEqual(bucketForState('In Progress', LADDER), 'in-progress')
  assert.strictEqual(bucketForState('Done', LADDER), 'complete')
})

// The STAYS-SILENT case: a project with no ladder must behave exactly as before
// — an unrecognised state still falls through to the lowercased raw value, which
// is what makes genuine drift visible.
test('with no ladder declared, nothing changes', () => {
  assert.strictEqual(bucketForState('On Test', NO_LADDER), 'on test')
  assert.strictEqual(bucketForState('Done', NO_LADDER), 'complete')
  assert.strictEqual(stageForState('On Test', NO_LADDER), null)
})

test('a state on no rung is still unrecognised, so real drift still reports', () => {
  assert.strictEqual(bucketForState('Blocked', LADDER), 'blocked')
  assert.strictEqual(stageForState('Blocked', LADDER), null)
})

test('remoteStage reads the rung off a real issue shape', () => {
  assert.deepStrictEqual(remoteStage({ state: { name: 'On Test', type: 'started' } }, LADDER), {
    key: 'test',
    state: 'On Test',
  })
  assert.strictEqual(remoteStage({ state: { name: 'In Progress' } }, LADDER), null)
  assert.strictEqual(remoteStage({}, LADDER), null)
  assert.strictEqual(remoteStage(null, LADDER), null)
})

test('a deployed spec no longer reads as a different bucket from its spec', () => {
  const local = 'complete'
  const remote = remoteWorkflowState({ state: { name: 'On Test' } }, LADDER)
  assert.strictEqual(remote, local, 'no drift while the spec sits in the pipeline')
})

test('a malformed release block is ignored rather than throwing', () => {
  for (const release of [null, 'nope', { stages: 'nope' }, { stages: [null, 42, {}] }]) {
    assert.strictEqual(stageForState('On Test', { states: STATES, release }), null)
    assert.strictEqual(bucketForState('On Test', { states: STATES, release }), 'on test')
  }
})
