'use strict'

/**
 * The snapshot records the tracker state NAME each item was last sent, beside
 * the bucket hashes. The hashes see a spec move; only the names see a config
 * that now maps the same bucket somewhere else.
 *
 * A name is recorded only for an item whose state was actually sent, and an
 * item with no recorded name plans nothing — so neither an upgrade nor a config
 * edit can turn into a resend of every item in the workspace.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { planChanges, snapshotOf, stateNamesRecord } = require('../src/compare.js')

const sub = (stateName) => ({ ref: '01-a', id: 'AB#2', name: 'A', goal: 'g', state: 'complete', stateName })
const spec = (issueName, subName) => ({
  description: 'Prose.',
  status: 'complete',
  stateName: issueName,
  subIssues: [sub(subName)],
})

function pushed(projection, sent = { issue: true, subIssues: new Set(['AB#2']) }) {
  const snap = snapshotOf(projection)
  const names = stateNamesRecord(projection, null, sent)
  if (names) snap.stateNames = names
  return snap
}

test('records the name of every item a push sent', () => {
  const snap = pushed(spec('Resolved', 'Resolved'))
  assert.deepStrictEqual(snap.stateNames, { issue: 'Resolved', subIssues: { 'AB#2': 'Resolved' } })
})

test('a changed name on an unchanged phase plans a state-only update', () => {
  const snap = pushed(spec('Resolved', 'Resolved'))
  const plan = planChanges(spec('Resolved', 'Closed'), snap, { linked: true })
  assert.deepStrictEqual(plan.subIssues.update, [{ ref: '01-a', id: 'AB#2', state: 'complete', stateResend: 'remap' }])
  assert.strictEqual(plan.issue, undefined)
})

test('a changed name on the issue plans its state, marked as a remap', () => {
  const snap = pushed(spec('Resolved', 'Resolved'))
  const plan = planChanges(spec('Closed', 'Resolved'), snap, { linked: true })
  assert.deepStrictEqual(plan.issue, { state: 'complete', stateResend: 'remap' })
})

test('a bucket that now sends no state plans nothing', () => {
  const snap = pushed(spec('Resolved', 'Resolved'))
  const plan = planChanges(spec('Resolved', null), snap, { linked: true })
  assert.strictEqual(plan.subIssues.update.length, 0)
})

test('STAYS SILENT: no recorded name is cannot-tell, never a remap', () => {
  const snap = snapshotOf(spec('Resolved', 'Resolved'))
  const plan = planChanges(spec('Closed', 'Closed'), snap, { linked: true })
  assert.strictEqual(plan.subIssues.update.length, 0)
  assert.strictEqual(plan.issue, undefined)
})

test('STAYS SILENT: a projection with no names (no provider hook) records none', () => {
  const projection = { description: 'Prose.', status: 'complete', subIssues: [{ ...sub(), stateName: undefined }] }
  assert.strictEqual(stateNamesRecord(projection, null, { issue: true, subIssues: new Set(['AB#2']) }), null)
})

test('an item this push did not send keeps its old name, or gets none', () => {
  const before = { stateNames: { issue: 'Resolved', subIssues: { 'AB#2': 'Resolved' } } }
  const kept = stateNamesRecord(spec('Closed', 'Closed'), before, { issue: false, subIssues: new Set() })
  assert.deepStrictEqual(kept, { issue: 'Resolved', subIssues: { 'AB#2': 'Resolved' } })
  // Without `sent` (a hand-applied MCP push) nothing new is claimed.
  assert.strictEqual(stateNamesRecord(spec('Closed', 'Closed'), null, null), null)
})

test('a phase with no snapshot hash is a resend, not a move', () => {
  const plan = planChanges(spec('Resolved', 'Resolved'), { issueFields: {}, subIssues: {} }, { linked: true })
  assert.strictEqual(plan.subIssues.update[0].stateResend, 'unknown')
})

test('a linked issue with no split hashes is a resend; an unlinked one is a create', () => {
  assert.strictEqual(planChanges(spec('Resolved'), {}, { linked: true }).issue.stateResend, 'unknown')
  assert.strictEqual(planChanges(spec('Resolved'), {}, { linked: false }).issue.stateResend, undefined)
})
