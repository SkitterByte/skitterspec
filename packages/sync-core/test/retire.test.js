'use strict'

// An epic's leftover phase sub-issues are planned for retirement (spec
// feat-epic-migration, Decision 2). An epic has no phases, so every id its
// snapshot remembers is a leftover — and on any other kind an unclaimed id is
// still the lost-stamp ambiguity, and nothing is retired.

const { test } = require('node:test')
const assert = require('node:assert')

const { planChanges, isEmptyPlan } = require('../src/compare.js')

const snapshot = { subIssues: { '#163': 'h1', '#164': 'h2' } }

test('an epic retires every sub-issue its snapshot remembers', () => {
  const plan = planChanges({ subIssues: [] }, snapshot, { linked: true, epic: true })
  assert.deepStrictEqual(plan.subIssues.retire, ['#163', '#164'])
  assert.strictEqual(isEmptyPlan(plan), false, 'a retire alone is work to do')
})

test('STAYS SILENT: any other kind retires nothing, however many ids are unclaimed', () => {
  const plan = planChanges({ subIssues: [] }, snapshot, { linked: true })
  assert.strictEqual(plan.subIssues.retire, undefined)
})

test('STAYS SILENT: a feature with a lost stamp still plans unstamped, never retire', () => {
  const plan = planChanges({ subIssues: [{ ref: '01-a', name: 'A', goal: 'g', state: 'backlog' }] }, snapshot, { linked: true })
  assert.strictEqual(plan.subIssues.retire, undefined)
  assert.strictEqual(plan.unstamped.length, 1)
})

test('an epic whose snapshot remembers nothing plans nothing', () => {
  const plan = planChanges({ subIssues: [] }, { subIssues: {} }, { linked: true, epic: true })
  assert.strictEqual(plan.subIssues.retire, undefined)
})
