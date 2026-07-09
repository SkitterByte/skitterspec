'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, normalizeRemote, readSnapshot } = require('../src/sync/normalize.js')
const { loadLinearConfig } = require('../src/sync/config.js')

// Defaults config (no live file needed for pure normalization).
const { config } = loadLinearConfig(os.tmpdir())

const OVERVIEW = `---
linear_identifier: "ENG-42"
spec_status: "in-progress"
priority: 2
labels: ["sync", "linear"]
---

# My Spec Title

## Problem

Some problem text here.

## Solution overview

The chosen solution.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | First phase | ✅ | [01-first.md](01-first.md) |
| 2 | Second phase | 🔄 | [02-second.md](02-second.md) |

## Open questions

- [ ] a SECRET open question

## State log

| Date | Status |
|------|--------|
| 2026-07-09 | In Progress |

## Changelog

- a SECRET changelog note
`

const PHASE1 = `# Phase 1 — First phase ✅

**Goal:** Do the first thing well.

- [x] task one
- [ ] task two
`

const PHASE2 = `# Phase 2 — Second phase 🔄

**Goal:** Do the second thing.

- [ ] task three
`

function fixtureSpec() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-norm-'))
  fs.writeFileSync(path.join(dir, '00-overview.md'), OVERVIEW, 'utf-8')
  fs.writeFileSync(path.join(dir, '01-first.md'), PHASE1, 'utf-8')
  fs.writeFileSync(path.join(dir, '02-second.md'), PHASE2, 'utf-8')
  return dir
}

// A remote projection mirroring the same spec.
const PROJECT = {
  name: 'My Spec Title',
  description: '# My Spec Title\n\n## Problem\n\nSome problem text here.',
  state: 'In Progress',
  priority: 2,
  labels: ['sync', 'linear'],
  milestones: [
    { name: 'First phase', status: 'Done', description: 'Do the first thing well.' },
    { name: 'Second phase', status: 'In Progress', description: 'Do the second thing.' },
  ],
}

test('local and remote produce identical field sets (same keys)', () => {
  const local = normalizeLocal(fixtureSpec(), config)
  const remote = normalizeRemote(PROJECT, config)
  assert.deepStrictEqual(Object.keys(local).sort(), Object.keys(remote).sort())
  // and exactly the configured field set
  assert.deepStrictEqual(
    Object.keys(local).sort(),
    Object.keys(config.sync.fieldOwnership).sort(),
  )
})

test('localOnlySections are stripped from the description', () => {
  const local = normalizeLocal(fixtureSpec(), config)
  assert.match(local.description, /Some problem text here/)
  assert.match(local.description, /The chosen solution/)
  assert.doesNotMatch(local.description, /SECRET open question/)
  assert.doesNotMatch(local.description, /SECRET changelog note/)
  assert.doesNotMatch(local.description, /State log/)
})

test('milestones parse from the phase index with canonical status', () => {
  const local = normalizeLocal(fixtureSpec(), config)
  assert.deepStrictEqual(local.milestones, [
    { name: 'First phase', status: 'done' },
    { name: 'Second phase', status: 'in-progress' },
  ])
})

test('remote milestone states canonicalise to the same vocabulary', () => {
  const remote = normalizeRemote(PROJECT, config)
  assert.deepStrictEqual(remote.milestones, [
    { name: 'First phase', status: 'done' },
    { name: 'Second phase', status: 'in-progress' },
  ])
})

test('phaseBodies and taskBreakdown read the phase files', () => {
  const local = normalizeLocal(fixtureSpec(), config)
  assert.deepStrictEqual(local.phaseBodies, [
    { phase: '01-first', goal: 'Do the first thing well.' },
    { phase: '02-second', goal: 'Do the second thing.' },
  ])
  assert.deepStrictEqual(local.taskBreakdown[0], {
    phase: '01-first',
    tasks: ['[x] task one', '[ ] task two'],
  })
})

test('frontmatter scalars normalise: workflowState, priority, labels', () => {
  const local = normalizeLocal(fixtureSpec(), config)
  assert.strictEqual(local.workflowState, 'in-progress')
  assert.strictEqual(local.priority, 2)
  assert.deepStrictEqual(local.labels, ['sync', 'linear'])
})

test('readSnapshot exposes frontmatter identifier for base keying', () => {
  const snap = readSnapshot(fixtureSpec(), config)
  assert.strictEqual(snap.frontmatter.linear_identifier, 'ENG-42')
  assert.strictEqual(snap.title, 'My Spec Title')
})

test('a spec with no linked fields still yields the full field set', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-norm-min-'))
  fs.writeFileSync(path.join(dir, '00-overview.md'), '# Bare\n\n## Problem\n\nx\n', 'utf-8')
  const local = normalizeLocal(dir, config)
  assert.deepStrictEqual(Object.keys(local).sort(), Object.keys(config.sync.fieldOwnership).sort())
  assert.deepStrictEqual(local.labels, [])
  assert.strictEqual(local.workflowState, null)
  assert.deepStrictEqual(local.milestones, [])
})
