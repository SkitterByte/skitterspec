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

// --- partitionStageMoves / stageOrderWarning (pure, no git, no network) ------

const { partitionStageMoves, stageOrderWarning } = require('../src/released.js')

const LADDER = [
  { key: 'test', state: 'On Test' },
  { key: 'demo', state: 'Ready for Demo' },
  { key: 'prod', state: 'Done' },
]

test('partitionStageMoves sorts each ref into exactly one bucket, with a reason', () => {
  const got = partitionStageMoves({
    tickets: [{ ref: 'SKS-1' }, { ref: 'ABC-2' }, { ref: 'SKS-3' }, { ref: 'SKS-9' }],
    teamKey: 'SKS',
    specs: [
      { identifier: 'SKS-1', bucket: 'complete' },
      { identifier: 'SKS-3', bucket: 'in-progress' },
    ],
  })
  assert.deepStrictEqual(got.movable.map((t) => t.ref), ['SKS-1'])
  assert.deepStrictEqual(got.foreign.map((t) => t.ref), ['ABC-2'])
  assert.deepStrictEqual(got.unfinished.map((t) => t.ref), ['SKS-3'])
  assert.deepStrictEqual(got.unlinked.map((t) => t.ref), ['SKS-9'])
  assert.strictEqual(got.unfinished[0].bucket, 'in-progress', 'the reason travels with the ref')
})

test('partitionStageMoves matches the team key case-insensitively', () => {
  const got = partitionStageMoves({
    tickets: [{ ref: 'sks-1' }],
    teamKey: 'SKS',
    specs: [{ identifier: 'sks-1', bucket: 'complete' }],
  })
  assert.deepStrictEqual(got.movable.map((t) => t.ref), ['sks-1'])
})

// With no team key configured there is nothing to compare against, so the team
// filter cannot fire. The spec claim is then the only thing keeping a foreign
// ref out — which is why "no spec claims it" is a category of its own.
test('partitionStageMoves with no team key still requires a spec to claim the ref', () => {
  const got = partitionStageMoves({
    tickets: [{ ref: 'ABC-2' }],
    teamKey: '',
    specs: [],
  })
  assert.deepStrictEqual(got.movable, [])
  assert.deepStrictEqual(got.unlinked.map((t) => t.ref), ['ABC-2'])
})

test('partitionStageMoves honours a different ceded bucket', () => {
  const specs = [{ identifier: 'SKS-1', bucket: 'cancelled' }]
  const asComplete = partitionStageMoves({ tickets: [{ ref: 'SKS-1' }], teamKey: 'SKS', specs })
  const asCancelled = partitionStageMoves({ tickets: [{ ref: 'SKS-1' }], teamKey: 'SKS', specs, cededBucket: 'cancelled' })
  assert.deepStrictEqual(asComplete.movable, [])
  assert.deepStrictEqual(asCancelled.movable.map((t) => t.ref), ['SKS-1'])
})

test('partitionStageMoves survives empty and malformed input', () => {
  const empty = partitionStageMoves({ tickets: [], teamKey: 'SKS', specs: [] })
  assert.deepStrictEqual(empty, { movable: [], foreign: [], unlinked: [], unfinished: [] })
  const junk = partitionStageMoves({ tickets: [null, {}, { ref: '' }], teamKey: 'SKS', specs: null })
  assert.deepStrictEqual(junk.movable, [])
})

test('stageOrderWarning: forward by one is silent', () => {
  assert.strictEqual(stageOrderWarning(LADDER, 'On Test', 'demo'), null)
})

test('stageOrderWarning: backwards and skipping each say which rung', () => {
  assert.match(stageOrderWarning(LADDER, 'Ready for Demo', 'test'), /moves back from "demo"/)
  assert.match(stageOrderWarning(LADDER, 'On Test', 'prod'), /skips 1 rung\(s\) from "test"/)
})

test('stageOrderWarning: a lifecycle state is a position, never a rung', () => {
  const lifecycle = ['Backlog', 'In Progress', 'Done', 'Canceled']
  // "Done" is both states.complete and the prod rung — the bucket meaning wins.
  assert.strictEqual(stageOrderWarning(LADDER, 'Done', 'test', lifecycle), null)
  // Without the bucket names it reads as prod, which is the bug this guards.
  assert.match(stageOrderWarning(LADDER, 'Done', 'test'), /moves back/)
})

test('stageOrderWarning: an unknown state, a blank state and an unknown key say nothing', () => {
  assert.strictEqual(stageOrderWarning(LADDER, 'Blocked', 'test'), null)
  assert.strictEqual(stageOrderWarning(LADDER, '', 'test'), null)
  assert.strictEqual(stageOrderWarning(LADDER, null, 'test'), null)
  assert.strictEqual(stageOrderWarning(LADDER, 'On Test', 'nope'), null)
  assert.strictEqual(stageOrderWarning(null, 'On Test', 'test'), null)
})
