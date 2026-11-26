'use strict'

/**
 * A phase cancelled in place — `# Phase 4 — … ➖` — is settled, not unbuilt.
 *
 * The engine knew only ⬜/🔄/✅, so a spec whose remaining phases were all
 * cancelled read as "3 of 5 phases done" and offered `/spec-next — phase 4`
 * for work nobody will build (bug-cancelled-phase-state). The rule chosen: a
 * cancelled phase is EXCLUDED from the total — "3 of 3 phases done, 2
 * cancelled" — and is never a next phase.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { phaseProgress, progressText } = require('../src/env/phases.js')
const { nextAction, readPhases: readNextPhases } = require('../src/env/nextaction.js')
const { readPhases, phaseIsDone, phaseIsCancelled } = require('../src/env/resolve.js')
const { blockingNext } = require('../src/env/resume.js')
const { collectDisposition } = require('../src/env/disposition.js')
const { readSpecState } = require('../src/env/specstate.js')

const EMOJI = { done: '✅', doing: '🔄', todo: '⬜', cancelled: '➖' }
const heading = (n, s) => `# Phase ${n} — phase ${n}${s === 'cancelled' ? ' — cancelled' : ''} ${EMOJI[s]}\n\n**Goal:** g.\n`

// The ereqs shape: three built, the last two cancelled in place.
const SHAPE = ['done', 'done', 'done', 'cancelled', 'cancelled']

function specDir(shape) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-cancelled-phase-')))
  const dir = path.join(root, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), '# X\n')
  shape.forEach((s, i) => fs.writeFileSync(path.join(dir, `0${i + 1}-p.md`), heading(i + 1, s)))
  return { root, dir }
}

test('a ➖ heading is cancelled, not done and not started', () => {
  const text = heading(4, 'cancelled')
  assert.strictEqual(phaseIsCancelled(text), true)
  assert.strictEqual(phaseIsDone(text), false)
  assert.strictEqual(phaseIsCancelled(heading(1, 'done')), false)
  assert.strictEqual(phaseIsCancelled(heading(1, 'todo')), false)
})

test('the status line wins for cancelled too', () => {
  assert.strictEqual(phaseIsCancelled('# Phase 1 — p ⬜\n\n> **Status:** Cancelled — dropped\n'), true)
  assert.strictEqual(phaseIsCancelled('# Phase 1 — p ➖\n\n> **Status:** Not started\n'), false)
})

test('progress excludes cancelled phases from the total and says how many', () => {
  const p = phaseProgress(SHAPE.map((s, i) => ({ content: heading(i + 1, s) })))
  assert.deepStrictEqual(p, { done: 3, total: 3, current: null, cancelled: 2 })
  assert.strictEqual(progressText(p), '3 of 3 phases done, 2 cancelled')
})

test('a spec with no cancelled phases reads exactly as before', () => {
  const p = phaseProgress(['done', 'doing', 'todo'].map((s, i) => ({ content: heading(i + 1, s) })))
  assert.deepStrictEqual(p, { done: 1, total: 3, current: 2, cancelled: 0 })
  assert.strictEqual(progressText(p), '1 of 3 phases done, phase 2 in progress')
})

test('remaining phases all ➖: next is /spec-complete, never /spec-next', () => {
  const { root } = specDir(SHAPE)
  try {
    const phases = readNextPhases(root, 'in-progress', 'feat-x')
    const a = nextAction({ spec: 'feat-x', bucket: 'in-progress', phases, gate: 'clear', passes: [], dirty: 0, syncWaits: [] })
    assert.strictEqual(a.verb, 'complete')
    assert.strictEqual(a.command, '/spec-complete')
    assert.match(a.state, /^3 of 3 ✅/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a cancelled phase before an open one is skipped by next', () => {
  const { root } = specDir(['done', 'cancelled', 'todo'])
  try {
    const phases = readNextPhases(root, 'in-progress', 'feat-x')
    const a = nextAction({ spec: 'feat-x', bucket: 'in-progress', phases, gate: 'clear', passes: [], dirty: 0, syncWaits: [] })
    assert.strictEqual(a.command, '/spec-next')
    assert.strictEqual(a.why, 'phase 3')
    assert.strictEqual(a.state, 'phase 2 of 2')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('the review page sees no next phase when the rest are cancelled', () => {
  const { root, dir } = specDir(SHAPE)
  try {
    const r = readPhases(dir)
    assert.strictEqual(r.hasNextPhase, false)
    assert.strictEqual(r.done, 3)
    assert.strictEqual(r.total, 3)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('skitterspec status counts the same way', () => {
  const { root } = specDir(SHAPE)
  try {
    const s = readSpecState(root, 'feat-x')
    assert.strictEqual(s.phasesDone, 3)
    assert.strictEqual(s.phasesTotal, 3)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a blocker on a cancelled phase holds nothing', () => {
  const copy = {
    overview: '# X\n',
    phases: SHAPE.map((s, i) => ({ n: i + 1, text: heading(i + 1, s) + (i === 3 ? '\n> **Blocked on:** a deploy\n' : '') })),
  }
  assert.strictEqual(blockingNext(copy), null)
})

test('disposition does not list a ➖ index row as loose', () => {
  const overview = [
    '| # | Phase | Status | File |',
    '|---|---|---|---|',
    '| 1 | a | ✅ | [01-p.md](01-p.md) |',
    '| 2 | b | ➖ | [02-p.md](02-p.md) |',
  ].join('\n')
  assert.deepStrictEqual(collectDisposition({ overview, phases: [] }).phases, [])
})

test('every phase cancelled: complete, not idle', () => {
  const phases = [1, 2].map((n) => ({ n, done: false, cancelled: true }))
  const a = nextAction({ spec: 'feat-x', bucket: 'in-progress', phases, gate: 'clear', passes: [], dirty: 0, syncWaits: [] })
  assert.strictEqual(a.command, '/spec-complete')
})
