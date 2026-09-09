'use strict'

/**
 * From the spec FILE to the projection: how `linear_assignee_id` becomes (or
 * fails to become) an assignee on the wire.
 *
 * `sync-assignee-projection.test.js` covers the diff in isolation. This covers
 * the two decisions upstream of it that the diff cannot see:
 *
 *   - the OPT-IN is `sync.fieldOwnership.assignee`, and it works by
 *     `toFieldSet` dropping the key — so an un-opted-in repo's projection has no
 *     assignee at all, not a null one;
 *   - the BUCKET decides what is projected, not the stamp's presence, which is
 *     what releases the issue when a spec finishes without an unassign step.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { projectionOf } = require('../src/push.js')
const { assigneeFor } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

// `assignee: 'push'` is the opt-in; the neutral config deliberately lacks it.
function optedIn() {
  const c = neutralConfig()
  c.sync.fieldOwnership.assignee = 'push'
  return c
}

// A spec folder in `bucket`, with or without an assignee stamp.
function specIn(bucket, { assignee } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assignee-'))
  const dir = path.join(root, 'specs', bucket, 'demo')
  fs.mkdirSync(dir, { recursive: true })
  const fm = ['---', 'linear_identifier: "ENG-1"']
  if (assignee) fm.push(`linear_assignee_id: "${assignee}"`)
  fm.push('---')
  fs.writeFileSync(path.join(dir, '00-overview.md'), `${fm.join('\n')}\n\n# Demo\n\n## Problem\n\nProse.\n`)
  fs.writeFileSync(path.join(dir, '01-thing.md'), '# Phase 1 — Thing ⬜\n\n**Goal:** a thing.\n')
  return dir
}

// --- the opt-in --------------------------------------------------------------

test('an un-opted-in repo has NO assignee key on its projection', () => {
  const p = projectionOf(specIn('in-progress', { assignee: 'user-1' }), neutralConfig())
  assert.strictEqual('assignee' in p, false, 'undefined, not null — the two mean different things')
})

test('opting in surfaces the recorded assignee', () => {
  const p = projectionOf(specIn('in-progress', { assignee: 'user-1' }), optedIn())
  assert.strictEqual(p.assignee, 'user-1')
})

test('opted in with no stamp projects null, not undefined', () => {
  const p = projectionOf(specIn('in-progress'), optedIn())
  assert.strictEqual('assignee' in p, true)
  assert.strictEqual(p.assignee, null)
})

// --- the bucket decides ------------------------------------------------------

test('a live spec projects whoever is recorded', () => {
  for (const bucket of ['backlog', 'in-progress']) {
    const p = projectionOf(specIn(bucket, { assignee: 'user-1' }), optedIn())
    assert.strictEqual(p.assignee, 'user-1', `${bucket} is live work`)
  }
})

test('a finished spec projects nobody, stamp or no stamp', () => {
  for (const bucket of ['complete', 'cancelled']) {
    const p = projectionOf(specIn(bucket, { assignee: 'user-1' }), optedIn())
    assert.strictEqual(p.assignee, null, `${bucket} releases the issue with no unassign step`)
  }
})

test('the stamp survives in the file after the bucket releases it', () => {
  // The projection going null must not be mistaken for the record being erased:
  // who actioned the work outlives the assignment.
  const dir = specIn('complete', { assignee: 'user-1' })
  const raw = fs.readFileSync(path.join(dir, '00-overview.md'), 'utf-8')
  assert.match(raw, /linear_assignee_id: "user-1"/)
})

// --- the rule on its own -----------------------------------------------------

test('assigneeFor ignores a blank or non-string stamp', () => {
  assert.strictEqual(assigneeFor('in-progress', { linear_assignee_id: '   ' }), null)
  assert.strictEqual(assigneeFor('in-progress', { linear_assignee_id: 42 }), null)
  assert.strictEqual(assigneeFor('in-progress', {}), null)
  assert.strictEqual(assigneeFor('in-progress', null), null)
})

test('assigneeFor trims a stamp rather than sending whitespace to Linear', () => {
  assert.strictEqual(assigneeFor('in-progress', { linear_assignee_id: ' user-1 ' }), 'user-1')
})
