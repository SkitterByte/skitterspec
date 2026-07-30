'use strict'

// Phase 2 (read-model): phases normalize to keyed {id,name,goal} milestone items,
// the phase's linear_milestone_id frontmatter supplies the id, the Phases section
// is stripped from the pushed description when milestones sync, and a milestone
// edited in Linear classifies as a per-item pullable change.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, normalizeRemote } = require('../src/normalize.js')
const { classify } = require('../src/compare.js')
const { neutralConfig } = require('./_config.js')

// Config that opts `milestones` into keyed sync.
function keyedConfig() {
  const c = neutralConfig()
  c.sync.keyedFields = { milestones: 'id' }
  return c
}

const OVERVIEW = `# Demo spec

## Problem

A problem.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | First phase | ⬜ | [01-first.md](01-first.md) |
`

const PHASE1 = `---
linear_milestone_id: "M-1"
---

# Phase 1 — First phase ⬜

**Goal:** Do the first thing well.

- [ ] a task
`

function fixtureSpec() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-ms-'))
  fs.writeFileSync(path.join(dir, '00-overview.md'), OVERVIEW, 'utf-8')
  fs.writeFileSync(path.join(dir, '01-first.md'), PHASE1, 'utf-8')
  return dir
}

test('phase frontmatter supplies the milestone id; title/goal come from the file', () => {
  const local = normalizeLocal(fixtureSpec(), keyedConfig())
  assert.deepStrictEqual(local.milestones, [
    { id: 'M-1', name: 'First phase', goal: 'Do the first thing well.' },
  ])
})

test('the Phases section is stripped from the description when milestones are keyed', () => {
  const keyed = normalizeLocal(fixtureSpec(), keyedConfig())
  assert.doesNotMatch(keyed.description, /01-first\.md/) // the phase-index table is gone
  assert.match(keyed.description, /A problem/) // other sections remain

  // …but with milestones NOT keyed, the Phases table stays in the description.
  const scalar = normalizeLocal(fixtureSpec(), neutralConfig())
  assert.match(scalar.description, /01-first\.md/)
})

test('remote Linear milestones normalize to {id,name,goal}', () => {
  const remote = normalizeRemote(
    {
      description: '# Demo spec',
      milestones: [
        { id: 'M-1', name: 'First phase', description: 'Do the first thing well.', progress: '0%' },
      ],
    },
    keyedConfig(),
  )
  assert.deepStrictEqual(remote.milestones, [
    { id: 'M-1', name: 'First phase', goal: 'Do the first thing well.' },
  ])
})

test('a milestone edited in Linear classifies as a per-item pullable change', () => {
  const config = keyedConfig()
  const local = normalizeLocal(fixtureSpec(), config) // M-1 goal "Do the first thing well."
  const remote = normalizeRemote(
    {
      description: local.description,
      milestones: [{ id: 'M-1', name: 'First phase', description: 'Do it BETTER' }],
    },
    config,
  )
  const base = { ...local } // base agrees with local; only remote moved
  const field = classify(local, remote, base, config).find((f) => f.field === 'milestones')
  assert.strictEqual(field.keyed, true)
  const it = field.items.find((i) => i.id === 'M-1')
  assert.strictEqual(it.status, 'edited')
  assert.strictEqual(it.side, 'remote')
  assert.strictEqual(it.pullable, true)
  assert.strictEqual(it.remote.goal, 'Do it BETTER')
})
