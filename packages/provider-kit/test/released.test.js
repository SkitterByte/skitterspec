'use strict'

// The provider-supplied half of `released`: a ref shape that is not `KEY-123`,
// and the older tracker's refs a repo carries after it moved. The default-shape
// rules are pinned by packages/linear/test/released.test.js, which runs against
// this same module unchanged.

const test = require('node:test')
const assert = require('node:assert')
const { refsInBody, ticketsInRange, nameTickets, IDENTIFIER_RE, GITHUB_REF_RE } = require('../src/released.js')

// --- a provider's own ref pattern ---------------------------------------------

test('a GitHub ref pattern reads #N from a Refs: trailer', () => {
  assert.deepEqual(refsInBody('- did a thing\n\nRefs: #12', GITHUB_REF_RE), ['#12'])
  assert.deepEqual(refsInBody('Refs: #1, #2', GITHUB_REF_RE), ['#1', '#2'])
})

test('a non-global pattern still yields every ref, not just the first', () => {
  assert.deepEqual(refsInBody('Refs: #1, #2', /#\d+/), ['#1', '#2'])
})

test('omitting the pattern keeps the KEY-N default', () => {
  assert.deepEqual(refsInBody('Refs: SKS-29'), ['SKS-29'])
  assert.deepEqual(refsInBody('Refs: SKS-29', 'not a regex'), ['SKS-29'])
  assert.deepEqual(refsInBody('Refs: SKS-29', IDENTIFIER_RE), ['SKS-29'])
})

test('the GitHub pattern does not read a KEY-N ref, nor KEY-N the GitHub one', () => {
  assert.deepEqual(refsInBody('Refs: SKS-29', GITHUB_REF_RE), [])
  assert.deepEqual(refsInBody('Refs: #12'), [])
})

// Stays-silent: the healthy-but-unusual inputs a #N scan must not fire on.

test('a #N mentioned outside a Refs: trailer is not a ref', () => {
  assert.deepEqual(refsInBody('fix(x): handle the case from #5\n\n- see #6', GITHUB_REF_RE), [])
})

test("another repo's issue (owner/repo#N) is not this repo's ref", () => {
  assert.deepEqual(refsInBody('Refs: SkitterByte/skittership#7', GITHUB_REF_RE), [])
  assert.deepEqual(refsInBody('Refs: skittership#7, #8', GITHUB_REF_RE), ['#8'])
})

test('a quoted or fenced Refs: #N is still ignored under a custom pattern', () => {
  assert.deepEqual(refsInBody('> Refs: #9', GITHUB_REF_RE), [])
  assert.deepEqual(refsInBody('```\nRefs: #9\n```', GITHUB_REF_RE), [])
})

// --- folding with a pattern and the older tracker's refs ----------------------

test('ticketsInRange folds #N refs when given the GitHub pattern', () => {
  const got = ticketsInRange([{ body: 'Refs: #3' }, { body: 'Refs: #3' }, { body: 'Refs: #4' }], {
    refPattern: GITHUB_REF_RE,
  })
  assert.deepEqual(got.tickets, [
    { ref: '#3', commits: 2 },
    { ref: '#4', commits: 1 },
  ])
})

test('an older tracker ref counts as historical, not unreferenced', () => {
  const got = ticketsInRange(
    [{ body: 'Refs: #3' }, { body: 'Refs: SKS-29' }, { body: 'Refs: SKS-30' }, { body: 'chore: no trailer' }],
    { refPattern: GITHUB_REF_RE, foreignPatterns: [IDENTIFIER_RE] },
  )
  assert.deepEqual(got.tickets, [{ ref: '#3', commits: 1 }])
  assert.strictEqual(got.historical, 2)
  assert.strictEqual(got.unreferenced, 1, 'a commit with no trailer is still a gap')
  assert.strictEqual(got.total, 4)
})

test('an older-tracker mention outside a trailer does not make a commit historical', () => {
  const got = ticketsInRange([{ body: 'chore: follow-up to SKS-29' }], {
    refPattern: GITHUB_REF_RE,
    foreignPatterns: [IDENTIFIER_RE],
  })
  assert.strictEqual(got.historical, 0)
  assert.strictEqual(got.unreferenced, 1)
})

test('without foreignPatterns the report shape is unchanged', () => {
  const got = ticketsInRange([{ body: 'Refs: SKS-29' }], { refPattern: GITHUB_REF_RE })
  assert.deepEqual(got, { tickets: [], unreferenced: 1, ignored: 0, total: 1 })
  assert.ok(!('historical' in got))
})

// --- naming the spec behind each ref ------------------------------------------

test('nameTickets pairs a ref with the spec that stamped it, and its url', () => {
  const specs = [{ spec: 'feat-a', bucket: 'complete', identifier: 'SKS-1', url: 'https://t/SKS-1' }]
  assert.deepEqual(nameTickets([{ ref: 'SKS-1', commits: 2 }], specs), [
    { ref: 'SKS-1', commits: 2, spec: 'feat-a', url: 'https://t/SKS-1' },
  ])
})

test('nameTickets leaves an unclaimed ref null, never matching a similar name', () => {
  // A spec folder named after the ref is still not a stamp: only the
  // frontmatter link counts, so nothing here may guess from `spec`.
  const specs = [
    { spec: 'SKS-2', bucket: 'backlog', identifier: null, url: null },
    { spec: 'feat-b', bucket: 'complete', identifier: 'SKS-20', url: 'https://t/SKS-20' },
  ]
  assert.deepEqual(nameTickets([{ ref: 'SKS-2', commits: 1 }], specs), [
    { ref: 'SKS-2', commits: 1, spec: null, url: null },
  ])
})

test('nameTickets reports a stamped spec with no url as url null, not a built one', () => {
  const specs = [{ spec: 'feat-c', bucket: 'complete', identifier: '#4' }]
  assert.deepEqual(nameTickets([{ ref: '#4', commits: 1 }], specs), [{ ref: '#4', commits: 1, spec: 'feat-c', url: null }])
})
