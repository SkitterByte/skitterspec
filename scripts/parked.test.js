'use strict'

// scripts/parked.js — the one switch that parks a distribution
// (chore-park-linear-jira).

const { test } = require('node:test')
const assert = require('node:assert')

const { PARKED, isParkedDist, isParkedSource, active, activeEntries } = require('./parked.js')

const ALL = ['skitterspec', 'skitterspec-linear', 'skitterspec-jira', 'skitterspec-github', 'skitterspec-azure-boards']

test('linear and jira are parked, with their source packages', () => {
  assert.deepStrictEqual(PARKED.dists, ['skitterspec-linear', 'skitterspec-jira'])
  assert.deepStrictEqual(PARKED.sources, ['packages/linear', 'packages/jira'])
})

test('active drops the parked names and keeps order', () => {
  assert.deepStrictEqual(active(ALL), ['skitterspec', 'skitterspec-github', 'skitterspec-azure-boards'])
  assert.deepStrictEqual(Object.keys(activeEntries(Object.fromEntries(ALL.map((n) => [n, 1])))), active(ALL))
})

test('an empty parked list restores all five (stays silent)', () => {
  const none = { dists: [], sources: [] }
  assert.deepStrictEqual(active(ALL, none), ALL)
  assert.strictEqual(isParkedDist('skitterspec-linear', none), false)
  assert.strictEqual(isParkedSource('packages/linear/src/a.js', none), false)
})

test('isParkedSource matches whole path segments, either separator', () => {
  assert.strictEqual(isParkedSource('packages/linear/test/a.test.js'), true)
  assert.strictEqual(isParkedSource('packages\\jira\\test\\a.test.js'), true)
  assert.strictEqual(isParkedSource('packages/linear'), true)
  // A neighbour sharing a prefix is not parked.
  assert.strictEqual(isParkedSource('packages/linear-extra/a.js'), false)
  assert.strictEqual(isParkedSource('packages/skitterspec-linear/package.json'), false)
  assert.strictEqual(isParkedSource('packages/github/src/a.js'), false)
})
