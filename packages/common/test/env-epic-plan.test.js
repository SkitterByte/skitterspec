'use strict'

/**
 * `epicPlan` (spec feat-spec-epic-commands, phase 3): progress, every member in
 * one group, and the numbered next steps the page, the terminal and
 * `/spec-epic-next` all read.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { epicPlan } = require('../src/env/nextaction.js')

const row = (spec, bucket, next, tab = null) => ({ spec, bucket, tab, next: { link: null, why: null, command: null, ...next } })

// The shape of the epic in the screenshot that prompted this phase.
function library() {
  const status = {
    epic: 'epic-lib',
    freeLanes: 1,
    members: [
      { spec: 'feat-done', bucket: 'complete', waits: [] },
      { spec: 'feat-curation', bucket: 'in-progress', waits: [] },
      { spec: 'feat-distance', bucket: 'backlog', waits: [] },
      { spec: 'feat-enrich', bucket: 'backlog', waits: [{ raw: 'feat-curation', state: 'unmet' }] },
      { spec: 'feat-recipes', bucket: 'backlog', waits: [{ raw: 'feat-enrich', state: 'unmet' }] },
    ],
    clashes: [{ specs: ['feat-distance', 'feat-curation'], paths: ['x'] }],
  }
  const rows = [
    row('feat-done', 'complete', { verb: 'done', state: 'complete' }),
    row('feat-curation', 'in-progress', { verb: 'complete', state: '2 of 2 ✅ · clean', command: '/spec-complete' }, 'wt/curation'),
    row('feat-distance', 'backlog', { verb: 'start', command: '/spec-start feat-distance', why: 'clashes with feat-curation' }),
    row('feat-enrich', 'backlog', { verb: 'blocked', why: 'waits on feat-curation' }),
    row('feat-recipes', 'backlog', { verb: 'blocked', why: 'waits on feat-enrich' }),
  ]
  return { status, rows }
}

test('every member lands in exactly one group, and progress counts them', () => {
  const { status, rows } = library()
  const { progress, groups } = epicPlan(status, { rows })
  assert.deepStrictEqual(groups, {
    inFlight: ['feat-curation'],
    ready: ['feat-distance'],
    waiting: ['feat-enrich', 'feat-recipes'],
    done: ['feat-done'],
  })
  assert.deepStrictEqual(progress, { done: 1, total: 5, inFlight: 1 })
})

test('in-tab steps come first, then starts, with what each unblocks and any clash', () => {
  const { status, rows } = library()
  const { steps } = epicPlan(status, { rows })
  assert.deepStrictEqual(
    steps.map((s) => [s.where, s.command, s.unblocks, s.caution]),
    [
      ['tab', '/spec-complete', ['feat-enrich'], null],
      ['new-tab', '/spec-start feat-distance', [], 'clashes with feat-curation; safer after step 1'],
    ],
  )
})

test('a pass outranks a page, which outranks a finish, which outranks a build', () => {
  const status = { epic: 'e', freeLanes: null, members: [], clashes: [] }
  const rows = [
    row('a', 'in-progress', { verb: 'next', command: '/spec-next', why: 'phase 2' }),
    row('b', 'in-progress', { verb: 'complete', command: '/spec-complete' }),
    row('c', 'in-progress', { verb: 'verdict' }),
    row('d', 'in-progress', { verb: 'claim', command: '/spec-reviewed 123456' }),
  ]
  assert.deepStrictEqual(epicPlan(status, { rows }).steps.map((s) => s.spec), ['d', 'c', 'b', 'a'])
})

test('a phase step unblocks what waits on that phase', () => {
  const status = { epic: 'e', freeLanes: null, clashes: [], members: [{ spec: 'b', waits: [{ raw: 'a phase 2', state: 'unmet' }] }] }
  const rows = [row('a', 'in-progress', { verb: 'next', command: '/spec-next', why: 'phase 2' }), row('b', 'backlog', { verb: 'blocked' })]
  assert.deepStrictEqual(epicPlan(status, { rows }).steps[0].unblocks, ['b'])
})

test('starts are capped at the free lanes, the one with no clash first', () => {
  const status = { epic: 'e', freeLanes: 1, members: [], clashes: [{ specs: ['x', 'busy'], paths: [] }] }
  const rows = [
    row('busy', 'in-progress', { verb: 'building' }),
    row('x', 'backlog', { verb: 'start', command: '/spec-start x' }),
    row('y', 'backlog', { verb: 'start', command: '/spec-start y' }),
  ]
  assert.deepStrictEqual(epicPlan(status, { rows }).steps.map((s) => s.spec), ['y'])
})

test('STAYS SILENT: no free lane means no start step, and the member still reads ready', () => {
  const status = { epic: 'e', freeLanes: 0, members: [], clashes: [] }
  const rows = [row('x', 'backlog', { verb: 'start', command: '/spec-start x', why: 'no free lane' })]
  const plan = epicPlan(status, { rows })
  assert.deepStrictEqual(plan.steps, [])
  assert.deepStrictEqual(plan.groups.ready, ['x'])
})

test('STAYS SILENT: building, held and cannot-tell members get no step', () => {
  const status = { epic: 'e', freeLanes: null, members: [], clashes: [] }
  const rows = [
    row('a', 'in-progress', { verb: 'building' }),
    row('b', 'in-progress', { verb: 'held', why: 'phase 2 waits on z' }),
    row('c', 'in-progress', { verb: 'cannot-tell', why: 'no worktree' }),
  ]
  assert.deepStrictEqual(epicPlan(status, { rows }).steps, [])
})

test('a backlog member the engine cannot read waits; it is never ready', () => {
  const status = { epic: 'e', freeLanes: null, members: [], clashes: [] }
  const rows = [row('a', 'backlog', { verb: 'cannot-tell', why: 'cannot tell whether z has landed' }), row('b', null, { verb: 'cannot-tell' })]
  const { groups, steps } = epicPlan(status, { rows })
  assert.deepStrictEqual(groups.waiting, ['a', 'b'])
  assert.deepStrictEqual(groups.ready, [])
  assert.deepStrictEqual(steps, [])
})

test('STAYS SILENT: an all-done epic has one step, completing the epic', () => {
  const status = { epic: 'epic-x', freeLanes: null, members: [], clashes: [] }
  const rows = [row('a', 'complete', { verb: 'done' }), row('b', 'cancelled', { verb: 'done' })]
  const { steps, progress } = epicPlan(status, { rows, next: { verb: 'complete', command: '/spec-complete epic-x' } })
  assert.deepStrictEqual(steps.map((s) => [s.where, s.command]), [['epic', '/spec-complete epic-x']])
  assert.deepStrictEqual(progress, { done: 2, total: 2, inFlight: 0 })
})
