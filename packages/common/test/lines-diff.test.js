'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { linesDiff } = require('../src/lines-diff.js')

test('identical input has no changes and no hunks', () => {
  const d = linesDiff('a\nb\nc', 'a\nb\nc')
  assert.deepEqual([d.added, d.removed], [0, 0])
  assert.deepEqual(d.hunks, [])
})

test('a pure insert counts as added only', () => {
  const d = linesDiff(['a', 'b'], ['a', 'new', 'b'])
  assert.deepEqual([d.added, d.removed], [1, 0])
  assert.equal(d.hunks.length, 1)
  assert.match(d.hunks[0], /^@@ -1,2 \+1,3 @@/)
  assert.match(d.hunks[0], /\n\+new\n/)
})

test('a pure delete counts as removed only', () => {
  const d = linesDiff(['a', 'gone', 'b'], ['a', 'b'])
  assert.deepEqual([d.added, d.removed], [0, 1])
  assert.match(d.hunks[0], /\n-gone\n/)
})

test('an interleaved change counts both sides', () => {
  const d = linesDiff(['a', 'x', 'b', 'y', 'c'], ['a', 'X', 'b', 'Y', 'c'])
  assert.deepEqual([d.added, d.removed], [2, 2])
  // The two edits are 1 line apart, well inside 2x context — one hunk, not two.
  assert.equal(d.hunks.length, 1)
})

test('distant changes become separate hunks', () => {
  const a = ['top', ...Array.from({ length: 20 }, (_, i) => `line ${i}`), 'bottom']
  const b = ['TOP', ...Array.from({ length: 20 }, (_, i) => `line ${i}`), 'BOTTOM']
  assert.equal(linesDiff(a, b).hunks.length, 2)
})

test('empty against non-empty is all additions', () => {
  const d = linesDiff([], ['a', 'b'])
  assert.deepEqual([d.added, d.removed], [2, 0])
  const e = linesDiff(['a', 'b'], [])
  assert.deepEqual([e.added, e.removed], [0, 2])
})

test('a string input is split on newlines', () => {
  assert.deepEqual(linesDiff('a\nb', 'a\nb\nc').added, 1)
})
