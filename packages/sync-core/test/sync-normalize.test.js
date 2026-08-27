'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, readSnapshot } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

// Neutral defaults config (no live file needed for pure normalization).
const config = neutralConfig()

const OVERVIEW = `---
spec_identifier: "ENG-42"
spec_status: "in-progress"
priority: 2
labels: ["sync", "triage"]
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
  labels: ['sync', 'triage'],
  milestones: [
    { name: 'First phase', status: 'Done', description: 'Do the first thing well.' },
    { name: 'Second phase', status: 'In Progress', description: 'Do the second thing.' },
  ],
}

test('a ## heading inside a fenced code block is not a real section', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-fence-'))
  const overview = [
    '# Spec',
    '',
    '## Solution overview',
    '',
    'We render a template like:',
    '',
    '```md',
    '## Not A Real Section',
    'example body',
    '```',
    '',
    'and that is the end of the real solution text.',
    '',
    '## Open questions',
    '',
    '- [ ] a real question',
  ].join('\n')
  fs.writeFileSync(path.join(dir, '00-overview.md'), overview, 'utf-8')
  const { sections } = readSnapshot(dir, config)
  assert.ok(!('Not A Real Section' in sections), 'fenced ## must not start a section')
  // the fenced example stays inside the section it was written in
  assert.match(sections['Solution overview'], /## Not A Real Section/)
  assert.match(sections['Solution overview'], /end of the real solution text/)
  assert.ok('Open questions' in sections)
})

test('the local projection is exactly the configured field set', () => {
  const local = normalizeLocal(fixtureSpec(), config)
  assert.deepStrictEqual(Object.keys(local).sort(), Object.keys(config.sync.fieldOwnership).sort())
})

test('localOnlySections are stripped from the description', () => {
  const local = normalizeLocal(fixtureSpec(), config)
  assert.match(local.description, /Some problem text here/)
  assert.match(local.description, /The chosen solution/)
  assert.doesNotMatch(local.description, /SECRET open question/)
  assert.doesNotMatch(local.description, /SECRET changelog note/)
  assert.doesNotMatch(local.description, /State log/)
})

test('the Phases index is stripped from the description (phases push as sub-issues)', () => {
  const local = normalizeLocal(fixtureSpec(), config)
  // subIssues is in the projection, so the `## Phases` index must not also
  // travel inside the description — no duplication in the mirror.
  assert.doesNotMatch(local.description, /## Phases/)
  assert.ok(local.subIssues.length >= 1, 'phases are projected as sub-issues instead')
})

test('sub-issues are keyed {id,ref,name,goal,state} items read from the phase files', () => {
  const local = normalizeLocal(fixtureSpec(), config)
  // PHASE1 heading is ✅ → complete; PHASE2 is 🔄 → in-progress.
  assert.deepStrictEqual(local.subIssues, [
    { id: null, ref: '01-first', name: 'First phase', goal: 'Do the first thing well.', state: 'complete' },
    { id: null, ref: '02-second', name: 'Second phase', goal: 'Do the second thing.', state: 'in-progress' },
  ])
})

test('frontmatter workflowState normalises from spec_status', () => {
  const local = normalizeLocal(fixtureSpec(), config)
  assert.strictEqual(local.workflowState, 'in-progress')
  // priority/labels are Linear-native triage — not projected
  assert.strictEqual('priority' in local, false)
  assert.strictEqual('labels' in local, false)
})

test('workflowState falls back to the lifecycle folder bucket', () => {
  // A spec with no spec_status frontmatter (the normal case — status lives in
  // the `> **Status:**` header) takes its state from specs/<bucket>/<name>/.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-bucket-'))
  const dir = path.join(root, 'specs', 'in-progress', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), '# Demo\n\n## Problem\n\nx\n', 'utf-8')
  assert.strictEqual(normalizeLocal(dir, config).workflowState, 'in-progress')

  const done = path.join(root, 'specs', 'complete', 'demo2')
  fs.mkdirSync(done, { recursive: true })
  fs.writeFileSync(path.join(done, '00-overview.md'), '# Demo\n\n## Problem\n\nx\n', 'utf-8')
  assert.strictEqual(normalizeLocal(done, config).workflowState, 'complete')
})

test('readSnapshot exposes frontmatter identifier for base keying', () => {
  const snap = readSnapshot(fixtureSpec(), config)
  assert.strictEqual(snap.frontmatter.spec_identifier, 'ENG-42')
  assert.strictEqual(snap.title, 'My Spec Title')
})

test('a spec with no linked fields still yields the full field set', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-norm-min-'))
  fs.writeFileSync(path.join(dir, '00-overview.md'), '# Bare\n\n## Problem\n\nx\n', 'utf-8')
  const local = normalizeLocal(dir, config)
  assert.deepStrictEqual(Object.keys(local).sort(), Object.keys(config.sync.fieldOwnership).sort())
  assert.strictEqual(local.workflowState, null)
  assert.deepStrictEqual(local.subIssues, [])
})

test('a blockquote whose bold span wraps pushes clean (no stray > in the description)', () => {
  // The projection path (normalizeLocal → canonicalize) must not swallow the
  // continuation `>` into the joined text — that landed a stray `>` in Linear.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-norm-bq-'))
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    '# Demo\n\n## Problem\n\n> **⚠ SUPERSEDED by\n> the newer plan.**\n',
    'utf-8',
  )
  const local = normalizeLocal(dir, config)
  assert.match(local.description, /> \*\*⚠ SUPERSEDED by the newer plan\.\*\*/)
  assert.doesNotMatch(local.description, /by > the/, 'no stray > mid-sentence')
})
