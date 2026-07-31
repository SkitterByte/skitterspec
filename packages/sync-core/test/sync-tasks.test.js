'use strict'

// Phase 3 (read-model): task checkbox lines normalize to keyed {id,text,done}
// items — the inline (SKI-123) identifier is the key, text is the label, done is
// the checkbox — and Linear issues normalize to the same shape, so a checkbox or
// title edited in Linear classifies as a per-item change.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, normalizeRemote, parseTaskLine } = require('../src/normalize.js')
const { classify } = require('../src/compare.js')
const { neutralConfig } = require('./_config.js')

function config() {
  const c = neutralConfig()
  for (const k of ['milestones', 'phaseBodies', 'acceptanceCriteria', 'taskBreakdown']) {
    delete c.sync.fieldOwnership[k]
  }
  c.sync.fieldOwnership.tasks = 'both'
  c.sync.keyedFields = { tasks: 'id' }
  return c
}

const OVERVIEW = `# Demo\n\n## Problem\n\nx\n`
const PHASE = `# Phase 1 — P ⬜

**Goal:** g

## Tasks

- [ ] first task (SKI-11)
- [x] done task (SKI-12)
- [ ] unlinked task
`

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-tasks-'))
  fs.writeFileSync(path.join(dir, '00-overview.md'), OVERVIEW, 'utf-8')
  fs.writeFileSync(path.join(dir, '01-first.md'), PHASE, 'utf-8')
  return dir
}

test('parseTaskLine splits checkbox, text and inline id', () => {
  assert.deepStrictEqual(parseTaskLine('[ ] do it (SKI-9)'), { id: 'SKI-9', text: 'do it', done: false })
  assert.deepStrictEqual(parseTaskLine('[x] done'), { id: null, text: 'done', done: true })
  assert.strictEqual(parseTaskLine('not a task'), null)
})

test('local tasks normalize to keyed {id,text,done} across a phase', () => {
  const local = normalizeLocal(fixture(), config())
  assert.deepStrictEqual(local.tasks, [
    { id: 'SKI-11', text: 'first task', done: false },
    { id: 'SKI-12', text: 'done task', done: true },
    { id: null, text: 'unlinked task', done: false },
  ])
})

test('remote issues normalize to the same {id,text,done} shape', () => {
  const remote = normalizeRemote(
    {
      issues: [
        { identifier: 'SKI-11', title: 'first task', state: { type: 'unstarted' } },
        { identifier: 'SKI-12', title: 'done task', state: { type: 'completed' } },
      ],
    },
    config(),
  )
  assert.deepStrictEqual(remote.tasks, [
    { id: 'SKI-11', text: 'first task', done: false },
    { id: 'SKI-12', text: 'done task', done: true },
  ])
})

test('a task closed in Linear classifies as a per-item pullable change', () => {
  const cfg = config()
  const local = normalizeLocal(fixture(), cfg)
  const remote = normalizeRemote(
    {
      issues: [
        { identifier: 'SKI-11', title: 'first task', state: { type: 'completed' } }, // closed in Linear
        { identifier: 'SKI-12', title: 'done task', state: { type: 'completed' } },
      ],
    },
    cfg,
  )
  const base = { ...local }
  const field = classify(local, remote, base, cfg).find((f) => f.field === 'tasks')
  assert.strictEqual(field.keyed, true)
  const it = field.items.find((i) => i.id === 'SKI-11')
  assert.strictEqual(it.status, 'edited')
  assert.strictEqual(it.side, 'remote')
  assert.strictEqual(it.pullable, true)
  assert.strictEqual(it.remote.done, true)
})
