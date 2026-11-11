'use strict'

/**
 * `nextAction` — the one verb per spec behind the `next` column (spec
 * feat-epic-next). Pure: every input arrives already read, so each precedence
 * branch and each cannot-tell is pinned without a worktree. `readNextInputs`
 * is exercised against real sidecars in a temp dir.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { nextAction, epicNext, epicRows, actionText, readNextInputs, readPhases } = require('../src/env/nextaction.js')

const phases = (...done) => done.map((d, i) => ({ n: i + 1, done: d }))
const flying = (over = {}) => ({
  spec: 'feat-a',
  bucket: 'in-progress',
  phases: phases(true, false, false),
  gate: 'clear',
  passes: [],
  dirty: 0,
  syncWaits: [],
  ...over,
})

// ── precedence for an in-flight spec ─────────────────────────────────────────

test('a waiting pass comes first, even over an armed gate and a dirty tree', () => {
  const a = nextAction(flying({ passes: ['324199'], gate: 'armed', dirty: 4 }))
  assert.strictEqual(a.verb, 'claim')
  assert.strictEqual(a.command, '/spec-reviewed 324199')
})

test('two waiting passes name neither — the operator has the codes', () => {
  const a = nextAction(flying({ passes: ['111111', '222222'] }))
  assert.strictEqual(a.command, '/spec-reviewed <code>')
  assert.match(a.why, /111111, 222222/)
})

test('an armed gate is a verdict, ahead of the dirty tree the phase left', () => {
  const a = nextAction(flying({ gate: 'armed', dirty: 7 }))
  assert.strictEqual(a.verb, 'verdict')
  assert.match(a.state, /page waits/)
  assert.strictEqual(a.command, null)
})

test('dirty with no phase ended is building, and names no command', () => {
  const a = nextAction(flying({ dirty: 3 }))
  assert.strictEqual(a.verb, 'building')
  assert.strictEqual(a.command, null)
  assert.match(a.state, /3 files uncommitted/)
})

test('the next phase held by an unmet sync point says what it waits on', () => {
  const a = nextAction(flying({ syncWaits: [{ phase: 2, state: 'unmet', raw: 'feat-b phase 1' }] }))
  assert.strictEqual(a.verb, 'held')
  assert.match(a.why, /phase 2 waits on feat-b phase 1/)
  assert.strictEqual(a.command, null)
})

test('a sync point on a LATER phase does not hold this one', () => {
  const a = nextAction(flying({ syncWaits: [{ phase: 3, state: 'unmet', raw: 'feat-b' }] }))
  assert.strictEqual(a.verb, 'next')
  assert.strictEqual(a.why, 'phase 2')
})

test('every phase done and the tree clean is /spec-complete', () => {
  const a = nextAction(flying({ phases: phases(true, true, true) }))
  assert.strictEqual(a.verb, 'complete')
  assert.strictEqual(a.command, '/spec-complete')
})

test('otherwise it is /spec-next for the first unfinished phase', () => {
  const a = nextAction(flying({ phases: phases(true, false, true) }))
  assert.strictEqual(a.command, '/spec-next')
  assert.strictEqual(a.why, 'phase 2')
})

// ── backlog members ──────────────────────────────────────────────────────────

const waiting = (over = {}) => ({ spec: 'feat-t', bucket: 'backlog', waits: [], freeLanes: null, clashWith: [], ...over })

test('a ready member is /spec-start with its name', () => {
  const a = nextAction(waiting({ waits: [{ state: 'met', raw: 'feat-a' }] }))
  assert.strictEqual(a.verb, 'start')
  assert.strictEqual(a.command, '/spec-start feat-t')
  assert.strictEqual(a.why, null)
})

test('no free lane and a clash qualify the start without withholding it', () => {
  const a = nextAction(waiting({ freeLanes: 0, clashWith: ['feat-c'] }))
  assert.strictEqual(a.command, '/spec-start feat-t')
  assert.strictEqual(a.why, 'no free lane · clashes with feat-c')
})

test('a blocked member names its unmet waits and no command', () => {
  const a = nextAction(waiting({ waits: [{ state: 'unmet', raw: 'feat-pay phase 2' }, { state: 'met', raw: 'feat-x' }] }))
  assert.strictEqual(a.verb, 'blocked')
  assert.strictEqual(a.why, 'waits on feat-pay phase 2')
  assert.strictEqual(a.command, null)
})

test('complete and cancelled show nothing to do', () => {
  for (const bucket of ['complete', 'cancelled']) {
    const a = nextAction({ spec: 'feat-x', bucket })
    assert.strictEqual(a.verb, 'done')
    assert.strictEqual(a.command, null)
  }
})

// ── the epic's own row ───────────────────────────────────────────────────────

test('the epic row offers /spec-complete only once no member is open', () => {
  assert.strictEqual(epicNext('epic-x', [{ bucket: 'complete' }, { bucket: 'in-progress' }]), null)
  assert.strictEqual(epicNext('epic-x', [{ bucket: 'complete' }, { bucket: 'cancelled' }]).command, '/spec-complete epic-x')
})

test('an epic with no members invites no completion', () => {
  assert.strictEqual(epicNext('epic-x', []), null)
})

// ── cannot tell, never a verb ────────────────────────────────────────────────

test('an unreadable gate, pending store, tree or phase list is cannot-tell', () => {
  for (const over of [{ gate: 'unreadable' }, { passes: null }, { dirty: null }, { phases: null }, { bucket: null }]) {
    const a = nextAction(flying(over))
    assert.strictEqual(a.verb, 'cannot-tell', JSON.stringify(over))
    assert.strictEqual(a.command, null)
  }
})

test('a backlog wait that cannot be read is cannot-tell, not ready', () => {
  const a = nextAction(waiting({ waits: [{ state: 'cannot-tell', raw: 'feat-gone' }] }))
  assert.strictEqual(a.verb, 'cannot-tell')
  assert.strictEqual(a.command, null)
})

// ── stays silent on healthy, unusual input ───────────────────────────────────

test('review.required: false is silence — the rest of the precedence answers', () => {
  const a = nextAction(flying({ gate: 'off' }))
  assert.strictEqual(a.verb, 'next')
})

test('a spec with no phase files yet names no command', () => {
  const a = nextAction(flying({ phases: [] }))
  assert.strictEqual(a.verb, 'idle')
  assert.strictEqual(a.command, null)
})

test('a wait on a spec outside the epic, met, starts like any other', () => {
  const a = nextAction(waiting({ waits: [{ state: 'met', raw: 'chore-elsewhere' }] }))
  assert.strictEqual(a.verb, 'start')
})

// ── the disk half ────────────────────────────────────────────────────────────

function tmpTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nextaction-'))
  const dir = path.join(root, 'specs', 'in-progress', 'feat-a')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), '# A\n')
  fs.writeFileSync(path.join(dir, '01-one.md'), '# Phase 1 ✅\n\n> **Status:** Done\n')
  fs.writeFileSync(path.join(dir, '02-two.md'), '# Phase 2 🔄\n\n> **Status:** In progress\n')
  return root
}

test('readPhases reads done-ness off each phase file in its own copy', () => {
  const root = tmpTree()
  assert.deepStrictEqual(readPhases(root, 'in-progress', 'feat-a'), [
    { n: 1, done: true },
    { n: 2, done: false },
  ])
  assert.strictEqual(readPhases(root, 'backlog', 'feat-a'), null)
})

test('readNextInputs: an armed gate and a waiting pass, read off the sidecars', () => {
  const root = tmpTree()
  const out = path.join(root, '.spec-env', 'reviews', 'feat-a.html')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out.replace(/\.html$/, '.gate.json'), JSON.stringify({ version: 1, spec: 'feat-a', armed: true, phase: 2 }))
  fs.writeFileSync(out.replace(/\.html$/, '.pending.json'), JSON.stringify({ version: 1, spec: 'feat-a', passes: [{ code: '324199' }] }))
  const inputs = readNextInputs({ folder: 'feat-a', bucket: 'in-progress', worktree: root, outPath: out, required: true, git: () => '' })
  assert.strictEqual(inputs.gate, 'armed')
  assert.deepStrictEqual(inputs.passes, ['324199'])
  assert.strictEqual(inputs.dirty, 0)
})

test('readNextInputs: a corrupt gate is unreadable, but an opted-out project is off', () => {
  const root = tmpTree()
  const out = path.join(root, '.spec-env', 'reviews', 'feat-a.html')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out.replace(/\.html$/, '.gate.json'), '{not json')
  const base = { folder: 'feat-a', bucket: 'in-progress', worktree: root, outPath: out, git: () => '' }
  assert.strictEqual(readNextInputs({ ...base, required: true }).gate, 'unreadable')
  assert.strictEqual(readNextInputs({ ...base, required: false }).gate, 'off')
})

test('readNextInputs: git that cannot answer is an unknown tree, never a clean one', () => {
  const root = tmpTree()
  const out = path.join(root, '.spec-env', 'reviews', 'feat-a.html')
  const inputs = readNextInputs({ folder: 'feat-a', bucket: 'in-progress', worktree: root, outPath: out, required: true, git: () => null })
  assert.strictEqual(inputs.dirty, null)
  assert.strictEqual(inputs.gate, 'clear')
  assert.deepStrictEqual(inputs.passes, [])
})

// ── member rows and their words ──────────────────────────────────────────────

const status = (over = {}) => ({
  epic: 'epic-x',
  freeLanes: 1,
  members: [
    { spec: 'feat-a', bucket: 'in-progress', waits: [] },
    { spec: 'feat-c', bucket: 'backlog', waits: [] },
    { spec: 'feat-d', bucket: 'backlog', waits: [] },
  ],
  inFlight: [{ spec: 'feat-a' }],
  syncPoints: [],
  clashes: [{ specs: ['feat-a', 'feat-c'], paths: ['src/x.js'] }, { specs: ['feat-c', 'feat-d'], paths: ['src/y.js'] }],
  ...over,
})
const clean = { bucket: 'in-progress', phases: phases(true, false), gate: 'clear', passes: [], dirty: 0 }

test('epicRows: an in-flight member with no worktree here is cannot-tell, with no tab', () => {
  const { rows } = epicRows(status())
  assert.strictEqual(rows[0].next.verb, 'cannot-tell')
  assert.match(rows[0].next.why, /no worktree/)
  assert.strictEqual(rows[0].tab, null)
})

test('epicRows: a verdict carries the served link, and a clash names only members in flight', () => {
  const { rows } = epicRows(status(), {
    inputsFor: () => ({ ...clean, gate: 'armed' }),
    tabFor: () => 'repo-wt/a',
    linkFor: (spec) => `http://127.0.0.1:7760/t/${spec}`,
  })
  assert.strictEqual(rows[0].next.link, 'http://127.0.0.1:7760/t/feat-a')
  assert.strictEqual(rows[0].tab, 'repo-wt/a')
  assert.strictEqual(rows[1].next.why, 'clashes with feat-a')
  assert.strictEqual(rows[2].next.why, null)
})

test('actionText words each verb once, for every rendering', () => {
  assert.strictEqual(actionText(nextAction(flying())), '/spec-next — phase 2')
  assert.strictEqual(actionText({ verb: 'verdict', link: null }), 'verdict — /spec-diff in its tab')
  assert.strictEqual(actionText({ verb: 'verdict', link: 'http://x' }), 'verdict → http://x')
  assert.strictEqual(actionText(nextAction(flying({ dirty: 2 }))), 'building — nothing to run yet')
  assert.strictEqual(actionText({ verb: 'done', command: null, why: null }), '—')
})
