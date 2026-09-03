'use strict'

/**
 * `released.js` — the pure half: commits in, ticket report out.
 *
 * The sharp edge is what must NOT count. A commit that *discusses* the trailer
 * convention quotes it, and reading that as membership makes a release claim
 * work it does not contain. A missing ticket gets noticed when someone looks for
 * it; an invented one never does.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { ticketsInRange, refsInBody } = require('../src/released.js')

// --- what counts -------------------------------------------------------------

test('a trailer line is a ref', () => {
  assert.deepEqual(refsInBody('- did a thing\n\nRefs: SKS-29'), ['SKS-29'])
})

test('a trailer below a Release-Note footer is still found', () => {
  const body = '- did a thing\n\nRelease-Note: Users can now do the thing.\n\nRefs: SKS-30'
  assert.deepEqual(refsInBody(body), ['SKS-30'])
})

test('several ids on one trailer line are all read', () => {
  assert.deepEqual(refsInBody('Refs: SKS-1, SKS-2'), ['SKS-1', 'SKS-2'])
})

// --- what must not count -----------------------------------------------------

test('a trailer inside a fenced block is not a ref', () => {
  const body = 'Document the convention:\n\n```\nRefs: SKS-99\n```\n'
  assert.deepEqual(refsInBody(body), [], 'a commit explaining the rule does not join the ticket')
})

test('a quoted trailer is not a ref', () => {
  assert.deepEqual(refsInBody('Review said:\n\n> Refs: SKS-98'), [])
})

test('an indented trailer is not a ref', () => {
  assert.deepEqual(refsInBody('Sample message:\n\n    Refs: SKS-97'), [])
})

test('the word Refs in prose is not a ref', () => {
  assert.deepEqual(refsInBody('This changes how Refs: trailers are parsed by SKS-30 tooling.'), [])
})

test('a body with no trailer yields nothing', () => {
  assert.deepEqual(refsInBody('chore: tidy up\n\n- no ticket here'), [])
  assert.deepEqual(refsInBody(''), [])
  assert.deepEqual(refsInBody(undefined), [])
})

// --- folding -----------------------------------------------------------------

test('a ticket touched by several commits is listed once, where it first appears', () => {
  const got = ticketsInRange([
    { body: 'Refs: SKS-1' },
    { body: 'Refs: SKS-2' },
    { body: 'Refs: SKS-1' },
    { body: 'Refs: SKS-1' },
  ])
  assert.deepEqual(got.tickets, [
    { ref: 'SKS-1', commits: 3 },
    { ref: 'SKS-2', commits: 1 },
  ])
})

test('commits with no ref are counted, not dropped', () => {
  const got = ticketsInRange([{ body: 'Refs: SKS-1' }, { body: 'chore' }, { body: '' }])
  assert.strictEqual(got.unreferenced, 2)
  assert.strictEqual(got.total, 3)
})

test('a commit naming the same ref twice counts once for that commit', () => {
  const got = ticketsInRange([{ body: 'Refs: SKS-1\nRefs: SKS-1' }])
  assert.deepEqual(got.tickets, [{ ref: 'SKS-1', commits: 1 }])
})

test('an empty range reports zeroes rather than throwing', () => {
  assert.deepEqual(ticketsInRange([]), { tickets: [], unreferenced: 0, total: 0 })
  assert.deepEqual(ticketsInRange(undefined), { tickets: [], unreferenced: 0, total: 0 })
})
