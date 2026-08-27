'use strict'

// Regression: a non-checkbox bullet inside a task's list subtree was DROPPED.
//
// `findTaskBlocks` could only ever extend a block with continuation lines — it
// had no model of list nesting. A bare bullet whose indent differed from the
// enclosing block's hanging indent broke that block, and the outer scan then
// skipped it (not a checkbox) along with its own wrapped lines. Nothing claimed
// them, so they never reached the mirror: the parse succeeded, the counts looked
// plausible, and the text was simply absent.
//
// Indent 6 is the default hanging indent for a top-level task, so the shape that
// fails is the common one. Every fixture here asserts LINE COVERAGE, not just
// block count — the bug was invisible to a count.

const { test } = require('node:test')
const assert = require('node:assert')

const { findTaskBlocks } = require('../src/task-block.js')

// Every line index some block claims. The bug is a line in no block at all, so
// this — not the block count — is what the fixtures assert on.
function claimedLines(blocks) {
  const claimed = new Set()
  for (const b of blocks) for (let i = b.start; i < b.end; i++) claimed.add(i)
  return claimed
}

function assertClaimsAll(src, blocks) {
  const claimed = claimedLines(blocks)
  const missing = src.map((l, i) => (claimed.has(i) ? null : i)).filter((i) => i !== null)
  assert.deepEqual(missing, [], `lines in no block: ${missing.map((i) => JSON.stringify(src[i])).join(', ')}`)
}

// The reported shape, at each hanging indent a wrapped spec actually uses.
for (const pad of [2, 4, 6]) {
  test(`a non-checkbox sibling of a nested checkbox is claimed (indent ${pad})`, () => {
    const src = [
      '- [ ] Parent task',
      `${' '.repeat(pad)}- [x] Nested checkbox`,
      `${' '.repeat(pad + 6)}wrapped continuation`,
      `${' '.repeat(pad)}- **Sibling note**`,
      `${' '.repeat(pad + 2)}its own wrapped line`,
    ]
    const blocks = findTaskBlocks(src)
    assertClaimsAll(src, blocks)

    assert.equal(blocks.length, 3)
    assert.equal(blocks[0].text, 'Parent task')
    assert.equal(blocks[0].checkbox, true)
    assert.equal(blocks[1].text, 'Nested checkbox wrapped continuation')
    assert.equal(blocks[1].checkbox, true)

    // The sibling is a block of its own, flagged NOT a checkbox — it must never
    // be rendered as a task that does not exist in the repo.
    const note = blocks[2]
    assert.equal(note.checkbox, false)
    assert.equal(note.mark, null)
    assert.equal(note.marker, '-')
    assert.equal(note.indent, ' '.repeat(pad))
    assert.equal(note.text, '**Sibling note** its own wrapped line')
  })
}

test('a checkbox nested under a plain bullet still starts its own block', () => {
  const src = [
    '- [ ] Parent task',
    '      - [x] Nested checkbox',
    '      - Note heading',
    '            - [x] Deep checkbox',
  ]
  const blocks = findTaskBlocks(src)
  assertClaimsAll(src, blocks)
  assert.deepEqual(
    blocks.map((b) => [b.checkbox, b.text]),
    [
      [true, 'Parent task'],
      [true, 'Nested checkbox'],
      [false, 'Note heading'],
      [true, 'Deep checkbox'],
    ],
  )
})

test('an ordered sub-bullet keeps its own marker', () => {
  const src = ['- [ ] Parent task', '      - [x] Nested checkbox', '      2. Second note']
  const blocks = findTaskBlocks(src)
  assertClaimsAll(src, blocks)
  assert.equal(blocks[2].checkbox, false)
  assert.equal(blocks[2].marker, '2.')
  assert.equal(blocks[2].text, 'Second note')
})

// Decision 4 — the projection is still "the task list", not the whole phase
// body. A bullet OUTSIDE any task subtree stays unclaimed, exactly as before.
test('a bullet at the task indent is not part of any subtree', () => {
  const src = ['- [ ] Task one', '- Plain top-level note']
  const blocks = findTaskBlocks(src)
  assert.equal(blocks.length, 1)
  assert.ok(!claimedLines(blocks).has(1), 'a sibling of the task itself is not in its subtree')
})

test('prose at the top level closes the subtree', () => {
  const src = ['- [ ] Task one', '', 'Some prose.', '', '  - An unrelated indented bullet']
  const blocks = findTaskBlocks(src)
  assert.equal(blocks.length, 1)
  assert.ok(!claimedLines(blocks).has(4), 'a bullet after top-level prose is not in the task subtree')
})

// A blank line alone does NOT close a subtree — a loose list is still a list.
// What closes it is a later line at or shallower than the task's own indent.
test('a loose nested list still belongs to its task', () => {
  const src = ['- [ ] Parent', '', '      - Sibling note']
  const blocks = findTaskBlocks(src)
  assert.equal(blocks.length, 2)
  assert.equal(blocks[1].checkbox, false)
  assert.equal(blocks[1].text, 'Sibling note')
})

test('an example bullet inside a fence is still not a task', () => {
  const src = ['- [ ] Parent task', '      - [x] Nested checkbox', '```', '- not a task', '```']
  const blocks = findTaskBlocks(src)
  assert.equal(blocks.length, 2)
  assert.ok(!claimedLines(blocks).has(3))
})
