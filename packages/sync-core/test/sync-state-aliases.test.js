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

// --- per-type/kind overrides --------------------------------------------------

const { effectiveStates, configuredStateNames, validateStates } = require('../src/normalize.js')

const OVERRIDDEN = {
  states: { backlog: 'New', 'in-progress': 'Active', complete: 'Resolved', cancelled: 'Removed' },
  statesByType: { Issue: { complete: 'Closed' }, Incident: { backlog: null, complete: 'Closed' } },
}

test('effectiveStates overlays the entry for the key, null and all', () => {
  assert.deepStrictEqual(effectiveStates(OVERRIDDEN, OVERRIDDEN.statesByType, 'Issue'), {
    backlog: 'New',
    'in-progress': 'Active',
    complete: 'Closed',
    cancelled: 'Removed',
  })
  assert.strictEqual(effectiveStates(OVERRIDDEN, OVERRIDDEN.statesByType, 'Incident').backlog, null)
})

// STAYS-SILENT: no table, or no entry for the key, is exactly config.states.
test('effectiveStates without a table or entry is the base map', () => {
  assert.deepStrictEqual(effectiveStates(OVERRIDDEN, null, 'Issue'), OVERRIDDEN.states)
  assert.deepStrictEqual(effectiveStates(OVERRIDDEN, OVERRIDDEN.statesByType, 'User Story'), OVERRIDDEN.states)
})

test('configuredStateNames and validateStates cover override values', () => {
  assert.ok(configuredStateNames(OVERRIDDEN).includes('Closed'))
  // "Closed" missing from the workspace is now a named miss…
  assert.ok(validateStates(OVERRIDDEN, ['New', 'Active', 'Resolved', 'Removed']).includes('Closed'))
  // …and present, the config validates clean.
  assert.deepStrictEqual(validateStates(OVERRIDDEN, ['New', 'Active', 'Resolved', 'Removed', 'Closed']), [])
})

test('an override value reads back as its bucket', () => {
  assert.strictEqual(bucketForState('Closed', OVERRIDDEN), 'complete')
})
