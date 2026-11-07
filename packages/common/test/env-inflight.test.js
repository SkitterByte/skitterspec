'use strict'

/**
 * `collectInFlight` / `formatInFlight` — the rows behind `skitterspec status`.
 * Pure: the reader is injected, so every shape is pinned without a worktree.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { collectInFlight, formatInFlight, detailOf, isInFlight } = require('../src/env/inflight.js')

const DIR = '/repo'
const found = (bucket, over = {}) => ({
  found: true,
  bucket,
  legacy: false,
  phasesDone: 1,
  phasesTotal: 3,
  currentPhase: 2,
  status: null,
  developer: null,
  ...over,
})

// `there[folder]` is the worktree's reading; `here[folder]` this checkout's.
function reader(there, here) {
  return (root, folder) => {
    const table = root === DIR ? here : there
    return table[folder] || { found: false, reason: `no spec named ${folder} under specs/` }
  }
}

const P = (folder, specless = false) => ({ folder, wt: `/wt/${folder}`, specless })

test('a pull-era spec: bucket and progress, no headers, nothing marked unknown', () => {
  const rows = collectInFlight({
    dir: DIR,
    provisioned: [P('feat-a')],
    read: reader({ 'feat-a': found('in-progress') }, { 'feat-a': found('backlog') }),
  })
  assert.strictEqual(detailOf(rows[0]), 'in-progress · 1 of 3 phases done, phase 2 in progress')
  assert.doesNotMatch(formatInFlight(rows, { dir: DIR }), /unknown/)
})

test('a spec that still carries legacy headers shows them after the bucket', () => {
  const row = { ...found('in-progress', { status: 'In Progress — Phase 2', developer: 'Jane Dev' }) }
  assert.strictEqual(detailOf(row), 'in-progress · 1 of 3 phases done, phase 2 in progress · In Progress — Phase 2 · Jane Dev')
})

test('two specs at different phases are both listed, with their worktree paths', () => {
  const rows = collectInFlight({
    dir: DIR,
    provisioned: [P('feat-a'), P('feat-b')],
    read: reader(
      { 'feat-a': found('in-progress'), 'feat-b': found('in-progress', { phasesDone: 0, phasesTotal: 1, currentPhase: 1 }) },
      { 'feat-a': found('backlog'), 'feat-b': found('backlog') },
    ),
  })
  const out = formatInFlight(rows, { dir: DIR })
  assert.match(out, /^2 specs in flight$/m)
  assert.match(out, /feat-a\s+in-progress · 1 of 3 phases done, phase 2 in progress/)
  assert.match(out, /feat-b\s+in-progress · 0 of 1 phases done, phase 1 in progress/)
  assert.match(out, /\.\.\/wt\/feat-a/)
})

test('a /no-spec record is listed as (no spec), never read, never unknown', () => {
  let reads = 0
  const rows = collectInFlight({
    dir: DIR,
    provisioned: [P('docs-catch-up', true)],
    read: () => {
      reads++
      return { found: false, reason: 'x' }
    },
  })
  assert.strictEqual(reads, 0)
  const out = formatInFlight(rows, { dir: DIR })
  assert.match(out, /docs-catch-up\s+\(no spec\)/)
  assert.match(out, /^no specs in flight$/m)
  assert.doesNotMatch(out, /unknown|differently/)
})

test('an unreadable worktree copy is listed as status unknown, not dropped', () => {
  const rows = collectInFlight({ dir: DIR, provisioned: [P('feat-a')], read: reader({}, {}) })
  const out = formatInFlight(rows, { dir: DIR })
  assert.match(out, /feat-a\s+status unknown — no spec named feat-a/)
  assert.strictEqual(isInFlight(rows[0]), true, 'cannot tell counts as in flight')
  assert.doesNotMatch(out, /differently/, 'an unread copy is never called a disagreement')
})

test('a finished spec with a worktree left behind is listed but not counted', () => {
  const rows = collectInFlight({
    dir: DIR,
    provisioned: [P('feat-done'), P('feat-a')],
    read: reader(
      { 'feat-done': found('complete'), 'feat-a': found('in-progress') },
      { 'feat-done': found('complete'), 'feat-a': found('in-progress') },
    ),
  })
  const out = formatInFlight(rows, { dir: DIR })
  assert.match(out, /^1 spec in flight$/m)
  assert.match(out, /feat-done\s+complete/)
})

test('the closing line names how many read differently, and only those', () => {
  const rows = collectInFlight({
    dir: DIR,
    provisioned: [P('feat-a'), P('feat-b')],
    read: reader(
      { 'feat-a': found('in-progress'), 'feat-b': found('in-progress') },
      { 'feat-a': found('backlog'), 'feat-b': found('in-progress') },
    ),
  })
  assert.match(formatInFlight(rows, { dir: DIR }), /On this branch 1 of these reads differently — a spec's bucket moves on its own branch\./)
})

test('a spec absent from this checkout altogether reads differently', () => {
  const rows = collectInFlight({ dir: DIR, provisioned: [P('feat-a')], read: reader({ 'feat-a': found('in-progress') }, {}) })
  assert.strictEqual(rows[0].here, null)
  assert.match(formatInFlight(rows, { dir: DIR }), /1 of these reads differently/)
})

test('stays silent: worktrees that all agree with this checkout get no closing line', () => {
  const rows = collectInFlight({
    dir: DIR,
    provisioned: [P('feat-a')],
    read: reader({ 'feat-a': found('in-progress') }, { 'feat-a': found('in-progress') }),
  })
  assert.doesNotMatch(formatInFlight(rows, { dir: DIR }), /differently/)
})

test('stays silent: nothing provisioned is a plain answer, not a finding', () => {
  assert.strictEqual(formatInFlight([], { dir: DIR }), 'no specs in flight\n')
})

test('a spec with no countable phases says nothing about phases', () => {
  const row = found('backlog', { phasesDone: null, phasesTotal: null, currentPhase: null })
  assert.strictEqual(detailOf(row), 'backlog')
})
