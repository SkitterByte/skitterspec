'use strict'

/**
 * `pull` — the TRACKER owns the field, and the repo says only what it did.
 *
 * Two fields can be pulled, and they differ in whether the repo has anything
 * left to say. A spec changing bucket is a transition the repo made, so a pulled
 * `workflowState` is still sent — but only on a positive signal that the bucket
 * moved, never on a push that merely cannot tell. A pulled `assignee` has no
 * such moment: the board assigns people, so the repo projects nothing at all.
 *
 * Most of what follows are STAYS-SILENT tests (`.claude/rules/negative-checks.md`
 * rule 3): a routine push after someone moved the ticket on the board, an
 * adopted issue with no snapshot, a snapshot written before the split hashes —
 * healthy inputs that must not re-assert a state the tracker now owns.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { push, recordPush, projectionOf } = require('../src/push.js')
const { specIssueHash } = require('../src/compare.js')
const { writeBase } = require('../src/base.js')
const { ownershipOf } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

const ID = 'ENG-1'

function config({ state = 'pull', assignee } = {}) {
  const c = neutralConfig()
  c.sync.fieldOwnership.workflowState = state
  if (assignee) c.sync.fieldOwnership.assignee = assignee
  return c
}

// A spec in `bucket`, linked when `linked`, carrying an assignee stamp so that
// anything missing downstream is the config's doing and not the file's.
function spec(bucket, { linked = true, prose = 'Prose.' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-pull-'))
  const dir = path.join(root, 'specs', bucket, 'demo')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = linked ? `linear_identifier: "${ID}"\n` : ''
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    `---\n${stamp}linear_assignee_id: "user-1"\n---\n\n# Demo\n\n## Problem\n\n${prose}\n`,
  )
  fs.writeFileSync(path.join(dir, '01-thing.md'), '# Phase 1 — Thing ⬜\n\n**Goal:** a thing.\n')
  return { root, dir }
}

function move({ root, dir }, bucket) {
  const to = path.join(root, 'specs', bucket, 'demo')
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.renameSync(dir, to)
  return { root, dir: to }
}

const plan = (s, c) => push({ dir: s.root, snapshotDir: s.dir, identifier: ID, config: c }).plan
const record = (s, c) => recordPush({ dir: s.root, snapshotDir: s.dir, identifier: ID, config: c })

// --- ownershipOf -------------------------------------------------------------

test('ownershipOf reads push, pull and none — and both reads as push', () => {
  assert.strictEqual(ownershipOf(config({ state: 'push' }), 'workflowState'), 'push')
  assert.strictEqual(ownershipOf(config({ state: 'both' }), 'workflowState'), 'push')
  assert.strictEqual(ownershipOf(config({ state: 'pull' }), 'workflowState'), 'pull')
  assert.strictEqual(ownershipOf(config({ state: 'none' }), 'workflowState'), 'none')
  assert.strictEqual(ownershipOf(neutralConfig(), 'assignee'), 'none', 'unlisted is not in play')
  for (const c of [null, undefined, {}, { sync: {} }]) assert.strictEqual(ownershipOf(c, 'assignee'), 'none')
})

// --- workflowState under pull ------------------------------------------------

test('a create sends the first state — an issue with none gets it from the repo', () => {
  const s = spec('backlog', { linked: false })
  assert.strictEqual(plan(s, config()).issue.state, 'backlog')
})

test('stays silent: a linked spec with no snapshot (an adopted issue) sends no state', () => {
  const p = plan(spec('backlog'), config())
  assert.ok(p.issue && p.issue.description, 'the description still goes')
  assert.strictEqual('state' in p.issue, false, "the board status is a person's, not ours")
})

test('stays silent: a pre-split snapshot cannot say the spec moved, so no state', () => {
  const s = spec('in-progress', { prose: 'Edited since.' })
  const c = config()
  writeBase(s.root, ID, c, { issue: specIssueHash({ description: 'old', status: 'in-progress' }), subIssues: {} })
  const p = plan(s, c)
  assert.ok(p.issue && p.issue.description)
  assert.strictEqual('state' in p.issue, false)
})

test('stays silent: a routine push after a board move sends the description and no state', () => {
  const s = spec('in-progress')
  const c = config()
  record(s, c)
  // Someone moved the ticket to Blocked on the board; the repo only edits prose.
  fs.appendFileSync(path.join(s.dir, '00-overview.md'), '\nMore prose.\n')
  const p = plan(s, c)
  assert.deepStrictEqual(Object.keys(p.issue), ['description'])
})

test('a bucket move is a transition, and the state goes', () => {
  const c = config()
  let s = spec('in-progress')
  record(s, c)
  s = move(s, 'complete')
  assert.strictEqual(plan(s, c).issue.state, 'complete')
})

test('push is unchanged: a linked spec with no snapshot still sends its state', () => {
  const p = plan(spec('backlog'), config({ state: 'push' }))
  assert.strictEqual(p.issue.state, 'backlog')
})

test('statePulled is set only under pull, and never reaches a hash', () => {
  const s = spec('in-progress')
  assert.strictEqual(projectionOf(s.dir, config({ state: 'push' })).statePulled, undefined)
  const pulled = config()
  assert.strictEqual(projectionOf(s.dir, pulled).statePulled, true)
  const a = JSON.parse(fs.readFileSync(record(s, pulled), 'utf-8'))
  const b = JSON.parse(fs.readFileSync(record(s, config({ state: 'push' })), 'utf-8'))
  assert.deepStrictEqual(a, b, 'the snapshot is the same whoever owns the state')
})

// --- assignee under pull -----------------------------------------------------

test('a pulled assignee is absent from the projection, stamp or no stamp', () => {
  const p = projectionOf(spec('in-progress').dir, config({ assignee: 'pull' }))
  assert.strictEqual('assignee' in p, false)
})

test('stays silent: completing a spec does not release a pulled assignee', () => {
  const c = config({ assignee: 'pull' })
  let s = spec('in-progress')
  record(s, c)
  s = move(s, 'complete')
  const p = plan(s, c)
  assert.strictEqual('assignee' in p.issue, false, 'the board keeps who did the work')
})

test('stays silent: switching assignee push → pull never clears an assignment', () => {
  // The snapshot remembers a pushed assignee hash. Once pulled, the projection
  // carries no assignee, so nothing compares against that hash.
  let s = spec('in-progress')
  record(s, config({ assignee: 'push' }))
  s = move(s, 'complete')
  const p = plan(s, config({ assignee: 'pull' }))
  assert.strictEqual('assignee' in p.issue, false)
})
