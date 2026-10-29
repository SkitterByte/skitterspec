'use strict'

/**
 * `states.<bucket>` takes a string, as it always did, or an array whose first
 * name is the one push writes and whose rest are read-only aliases.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { makeMergeHelpers } = require('../src/config.js')

const { mergeStates } = makeMergeHelpers({
  configFile: 'specs/.core/demo.config.json',
  ownership: ['push', 'none'],
  lifecycleBuckets: ['backlog', 'in-progress', 'complete', 'cancelled'],
  phaseMappings: ['subissue'],
})

const base = () => ({
  states: { backlog: 'New', 'in-progress': 'Active', complete: 'Closed', cancelled: 'Removed' },
  stateAliases: {},
})

// The STAYS-SILENT case: a config written before aliases existed loads exactly
// as it did.
test('a plain string is unchanged and records no aliases', () => {
  const b = base()
  mergeStates(b, { states: { backlog: 'Groomed' } })
  assert.strictEqual(b.states.backlog, 'Groomed')
  assert.deepStrictEqual(b.stateAliases, {})
})

test('an array writes its first name and keeps the rest as aliases', () => {
  const b = base()
  mergeStates(b, { states: { 'in-progress': ['Active', ' Blocked '], complete: ['Closed', 'Released'] } })
  assert.strictEqual(b.states['in-progress'], 'Active')
  assert.deepStrictEqual(b.stateAliases, { 'in-progress': ['Blocked'], complete: ['Released'] })
})

test('a malformed entry is refused at load', () => {
  for (const bad of [[], [''], ['Active', 3], 7, { name: 'Active' }]) {
    assert.throws(() => mergeStates(base(), { states: { 'in-progress': bad } }), /states\.in-progress/)
  }
})

test('an alias that also names another bucket is refused', () => {
  assert.throws(
    () => mergeStates(base(), { states: { 'in-progress': ['Active', 'Closed'] } }),
    /"Closed" is in both complete and in-progress/,
  )
})

// Two buckets sharing one WRITTEN name was always legal — a tracker with no
// Cancelled state maps cancelled to "Done" — and must stay so.
test('two buckets sharing a written name stay legal', () => {
  const b = base()
  mergeStates(b, { states: { complete: 'Done', cancelled: 'Done' } })
  assert.strictEqual(b.states.cancelled, 'Done')
})
