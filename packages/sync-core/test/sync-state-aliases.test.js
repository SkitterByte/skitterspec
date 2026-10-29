'use strict'

/**
 * A state alias reads as its bucket everywhere a remote state is interpreted,
 * and is never what push writes.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { bucketForState, remoteStateReading, stateNamesFor } = require('../src/normalize.js')

const CONFIG = {
  states: { backlog: 'New', 'in-progress': 'Active', complete: 'Closed', cancelled: 'Removed' },
  stateAliases: { 'in-progress': ['Blocked'], complete: ['Released'] },
}

test('the written name comes first, then the aliases', () => {
  assert.deepStrictEqual(stateNamesFor('in-progress', CONFIG), ['Active', 'Blocked'])
  assert.deepStrictEqual(stateNamesFor('backlog', CONFIG), ['New'])
})

test('an alias maps to its bucket, case-insensitively', () => {
  assert.strictEqual(bucketForState('blocked', CONFIG), 'in-progress')
  assert.strictEqual(bucketForState('Released', CONFIG), 'complete')
})

test('an aliased remote state reads as mapped', () => {
  assert.deepStrictEqual(remoteStateReading({ state: { name: 'Blocked' } }, CONFIG), {
    name: 'Blocked',
    bucket: 'in-progress',
    mapped: true,
  })
})

// STAYS-SILENT: a config with no aliases behaves exactly as before.
test('without aliases an unknown name is still unmapped', () => {
  const plain = { states: CONFIG.states }
  assert.strictEqual(remoteStateReading({ state: { name: 'Blocked' } }, plain).mapped, false)
  assert.deepStrictEqual(stateNamesFor('in-progress', plain), ['Active'])
})
