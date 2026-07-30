'use strict'

// Per-item (id-keyed) three-way merge — Phase 1 of feat-linear-body-round-trip.
// A field listed in sync.keyedFields is an array of {id,…} compared item-by-item,
// so edits to different items don't collide and only a same-item divergence is a
// conflict. Removals are report-only (surfaced, never auto-applied).

const { test } = require('node:test')
const assert = require('node:assert')

const { classify } = require('../src/compare.js')

// A config with one keyed collection field `m` (id key "id"), ownership settable.
const cfg = (ownership = 'both') => ({
  sync: { fieldOwnership: { m: ownership }, keyedFields: { m: 'id' } },
})

// item factory: id + content (name).
const M = (id, name) => ({ id, name })

// Run classify over a single keyed field and return its field entry.
function run(local, remote, base, ownership = 'both') {
  const field = classify(
    { m: local },
    { m: remote },
    base ? { m: base } : null,
    cfg(ownership),
  )[0]
  return field
}

// Look up one item outcome by id.
const item = (field, id) => field.items.find((i) => i.id === String(id))

test('keyed field reports items, not a scalar raw status', () => {
  const f = run([M(1, 'a')], [M(1, 'a')], [M(1, 'a')])
  assert.strictEqual(f.keyed, true)
  assert.strictEqual(f.idKey, 'id')
  assert.strictEqual(f.status, 'unchanged')
  assert.ok(Array.isArray(f.items))
})

test('item added on the local side is pushable, not pullable', () => {
  const f = run([M(1, 'a')], [], [])
  const it = item(f, 1)
  assert.strictEqual(it.status, 'added')
  assert.strictEqual(it.side, 'local')
  assert.strictEqual(it.pushable, true)
  assert.strictEqual(it.pullable, false)
  assert.deepStrictEqual(it.local, M(1, 'a'))
})

test('item added on the remote side is pullable, not pushable', () => {
  const f = run([], [M(1, 'a')], [])
  const it = item(f, 1)
  assert.strictEqual(it.status, 'added')
  assert.strictEqual(it.side, 'remote')
  assert.strictEqual(it.pullable, true)
  assert.strictEqual(it.pushable, false)
  assert.deepStrictEqual(it.remote, M(1, 'a'))
})

test('edit on one side only classifies to that side', () => {
  const local = run([M(1, 'b')], [M(1, 'a')], [M(1, 'a')])
  assert.strictEqual(item(local, 1).status, 'edited')
  assert.strictEqual(item(local, 1).side, 'local')
  assert.strictEqual(item(local, 1).pushable, true)

  const remote = run([M(1, 'a')], [M(1, 'b')], [M(1, 'a')])
  assert.strictEqual(item(remote, 1).side, 'remote')
  assert.strictEqual(item(remote, 1).pullable, true)
})

test('concurrent edits to DIFFERENT items do not conflict', () => {
  const f = run(
    [M(1, 'b'), M(2, 'a')], // local edited item 1
    [M(1, 'a'), M(2, 'b')], // remote edited item 2
    [M(1, 'a'), M(2, 'a')],
  )
  assert.strictEqual(item(f, 1).side, 'local')
  assert.strictEqual(item(f, 1).status, 'edited')
  assert.strictEqual(item(f, 2).side, 'remote')
  assert.strictEqual(item(f, 2).status, 'edited')
  assert.ok(!f.items.some((i) => i.status === 'conflict'))
})

test('concurrent edits to the SAME item conflict (both-owned)', () => {
  const f = run([M(1, 'b')], [M(1, 'c')], [M(1, 'a')])
  const it = item(f, 1)
  assert.strictEqual(it.status, 'conflict')
  assert.strictEqual(it.pushable, true)
  assert.strictEqual(it.pullable, true)
})

test('removal is report-only — surfaced, never auto-applied', () => {
  const localRemoved = run([], [M(1, 'a')], [M(1, 'a')])
  const it = item(localRemoved, 1)
  assert.strictEqual(it.status, 'removed')
  assert.strictEqual(it.side, 'local')
  assert.strictEqual(it.report, true)
  assert.strictEqual(it.pushable, false)
  assert.strictEqual(it.pullable, false)

  const remoteRemoved = run([M(1, 'a')], [], [M(1, 'a')])
  assert.strictEqual(item(remoteRemoved, 1).status, 'removed')
  assert.strictEqual(item(remoteRemoved, 1).side, 'remote')
  assert.strictEqual(item(remoteRemoved, 1).report, true)
})

test('id-only reorder is unchanged (order not meaningful for keyed items)', () => {
  const f = run(
    [M(2, 'b'), M(1, 'a')], // reordered
    [M(1, 'a'), M(2, 'b')],
    [M(1, 'a'), M(2, 'b')],
  )
  assert.strictEqual(f.status, 'unchanged')
  assert.ok(f.items.every((i) => i.status === 'unchanged'))
})

test('both sides make the same edit → converged, unchanged', () => {
  const f = run([M(1, 'b')], [M(1, 'b')], [M(1, 'a')])
  assert.strictEqual(item(f, 1).status, 'unchanged')
})

test('pull-owned keyed field: a same-item conflict resolves to remote', () => {
  const f = run([M(1, 'b')], [M(1, 'c')], [M(1, 'a')], 'pull')
  const it = item(f, 1)
  assert.strictEqual(it.side, 'remote')
  assert.strictEqual(it.pullable, true)
  assert.strictEqual(it.pushable, false)
})

test('push-owned keyed field: a same-item conflict resolves to local', () => {
  const f = run([M(1, 'b')], [M(1, 'c')], [M(1, 'a')], 'push')
  const it = item(f, 1)
  assert.strictEqual(it.side, 'local')
  assert.strictEqual(it.pushable, true)
  assert.strictEqual(it.pullable, false)
})

test('field-level flags aggregate item flags for the summary', () => {
  const f = run([M(1, 'b'), M(2, 'a')], [M(1, 'a'), M(2, 'a')], [M(1, 'a'), M(2, 'a')])
  assert.strictEqual(f.status, 'items-changed')
  assert.strictEqual(f.pushable, true)
  assert.strictEqual(f.pullable, false)
})
