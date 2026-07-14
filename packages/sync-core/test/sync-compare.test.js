'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { classify, hashField, stableStringify } = require('../src/compare.js')

// A minimal config: one field of each ownership kind.
const CONFIG = { sync: { fieldOwnership: { d: 'both', s: 'pull', p: 'push' } } }

// Pull the classification for one field out of the array.
function field(result, name) {
  return result.find((f) => f.field === name)
}

test('hashing is order-independent for object keys but order-sensitive for arrays', () => {
  assert.strictEqual(hashField({ a: 1, b: 2 }), hashField({ b: 2, a: 1 }))
  assert.notStrictEqual(hashField([1, 2]), hashField([2, 1]))
})

test('null, undefined and missing all hash equal', () => {
  assert.strictEqual(stableStringify(null), 'null')
  assert.strictEqual(stableStringify(undefined), 'null')
  assert.strictEqual(hashField(null), hashField(undefined))
})

test('unchanged — all three equal', () => {
  const v = { d: 'x', s: 'x', p: 'x' }
  const r = classify(v, v, v, CONFIG)
  for (const f of r) {
    assert.strictEqual(f.status, 'unchanged')
    assert.strictEqual(f.pushable, false)
    assert.strictEqual(f.pullable, false)
  }
})

test('local-only on a both field → pushable, not pullable', () => {
  const base = { d: 'x' }
  const local = { d: 'y' }
  const remote = { d: 'x' }
  const f = field(classify(local, remote, base, CONFIG), 'd')
  assert.strictEqual(f.raw, 'local-only')
  assert.strictEqual(f.status, 'local-only')
  assert.strictEqual(f.pushable, true)
  assert.strictEqual(f.pullable, false)
})

test('remote-only on a both field → pullable, not pushable', () => {
  const f = field(classify({ d: 'x' }, { d: 'y' }, { d: 'x' }, CONFIG), 'd')
  assert.strictEqual(f.raw, 'remote-only')
  assert.strictEqual(f.status, 'remote-only')
  assert.strictEqual(f.pullable, true)
  assert.strictEqual(f.pushable, false)
})

test('conflict on a both field → both flags set', () => {
  const f = field(classify({ d: 'local' }, { d: 'remote' }, { d: 'base' }, CONFIG), 'd')
  assert.strictEqual(f.raw, 'conflict')
  assert.strictEqual(f.status, 'conflict')
  assert.strictEqual(f.pushable, true)
  assert.strictEqual(f.pullable, true)
})

test('both sides converged on the same value → unchanged (no false conflict)', () => {
  const f = field(classify({ d: 'same' }, { d: 'same' }, { d: 'base' }, CONFIG), 'd')
  assert.strictEqual(f.raw, 'unchanged')
  assert.strictEqual(f.status, 'unchanged')
})

test('ownership: a pull field never reports as pushable', () => {
  // local edited a pull-owned field; it must not push.
  const f = field(classify({ s: 'mine' }, { s: 'base' }, { s: 'base' }, CONFIG), 's')
  assert.strictEqual(f.raw, 'local-only')
  assert.strictEqual(f.pushable, false)
  assert.strictEqual(f.pullable, false)
})

test('ownership: a pull field conflict collapses to remote-only (remote wins)', () => {
  const f = field(classify({ s: 'mine' }, { s: 'theirs' }, { s: 'base' }, CONFIG), 's')
  assert.strictEqual(f.raw, 'conflict')
  assert.strictEqual(f.status, 'remote-only')
  assert.strictEqual(f.pushable, false)
  assert.strictEqual(f.pullable, true)
})

test('ownership: a push field never reports as pullable', () => {
  const f = field(classify({ p: 'base' }, { p: 'theirs' }, { p: 'base' }, CONFIG), 'p')
  assert.strictEqual(f.raw, 'remote-only')
  assert.strictEqual(f.pullable, false)
  assert.strictEqual(f.pushable, false)
})

test('ownership: a push field conflict collapses to local-only (local wins)', () => {
  const f = field(classify({ p: 'mine' }, { p: 'theirs' }, { p: 'base' }, CONFIG), 'p')
  assert.strictEqual(f.raw, 'conflict')
  assert.strictEqual(f.status, 'local-only')
  assert.strictEqual(f.pushable, true)
  assert.strictEqual(f.pullable, false)
})

test('a null base (never synced) treats any non-null field as diverged', () => {
  const r = classify({ d: 'x', s: null, p: 'z' }, { d: 'x', s: null, p: 'z' }, null, CONFIG)
  // d and p match remote but differ from null base → conflict (both moved off base
  // to the same value → converged → unchanged)
  assert.strictEqual(field(r, 'd').status, 'unchanged')
  // s is null on both sides and null base → unchanged
  assert.strictEqual(field(r, 's').status, 'unchanged')
})

test('classify returns one entry per configured field, in config order', () => {
  const r = classify({}, {}, {}, CONFIG)
  assert.deepStrictEqual(r.map((f) => f.field), ['d', 's', 'p'])
})
