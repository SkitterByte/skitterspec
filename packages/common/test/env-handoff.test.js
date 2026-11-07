'use strict'

/**
 * `planHandoff` — publish a spec's branch and say where it is, or refuse with
 * the one way out. Pure, so every answer is pinned without a repo.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { planHandoff, phaseProgress } = require('../src/env/handoff.js')

const SPEC = { folder: 'feat-x', branch: 'feat/x', worktreePath: '/wt/x' }
const SHA = 'abcdef1234567890'
const base = (over = {}) => ({
  spec: SPEC,
  worktree: true,
  dirtyPaths: [],
  remote: 'origin',
  remoteConfigured: true,
  headSha: SHA,
  remoteSha: '',
  phases: [
    { file: '01-a.md', content: '# Phase 1 — A ✅\n' },
    { file: '02-b.md', content: '# Phase 2 — B 🔄\n' },
    { file: '03-c.md', content: '# Phase 3 — C ⬜\n' },
  ],
  ...over,
})

test('an unpublished branch plans the push and a note naming where the work is', () => {
  const p = planHandoff(base())
  assert.strictEqual(p.blocked, false)
  assert.deepStrictEqual(p.commands, ['git -C /wt/x push -u origin feat/x'])
  assert.match(p.note, /`feat\/x` at `abcdef123456` \(origin\), 1 of 3 phases done, phase 2 in progress/)
  assert.match(p.note, /`\/spec-start feat-x` resumes from that branch/)
})

test('a branch already published at HEAD needs no push', () => {
  const p = planHandoff(base({ remoteSha: SHA }))
  assert.strictEqual(p.published, true)
  assert.deepStrictEqual(p.commands, [])
})

test('a stale or unaskable remote still plans the push — a redundant one is harmless', () => {
  assert.strictEqual(planHandoff(base({ remoteSha: 'old' })).commands.length, 1)
  const unknown = planHandoff(base({ remoteSha: null }))
  assert.strictEqual(unknown.commands.length, 1)
  assert.strictEqual(unknown.remoteUnknown, true)
})

test('uncommitted work refuses, and declares /commit as the way out', () => {
  const p = planHandoff(base({ dirtyPaths: ['src/a.js'] }))
  assert.strictEqual(p.blocked, true)
  assert.match(p.reason, /1 uncommitted path/)
  assert.deepStrictEqual(p.offer, { kind: 'satisfy', label: 'Commit first, then hand it over', command: '/commit' })
  assert.strictEqual('commands' in p, false, 'no push is ever planned over work it would leave behind')
})

// Refusals with no offer: the engine declares none, so a skill offers none.
test('no worktree, or no remote, refuses with no offer', () => {
  for (const over of [{ worktree: false }, { remoteConfigured: false }]) {
    const p = planHandoff(base(over))
    assert.strictEqual(p.blocked, true)
    assert.strictEqual('offer' in p, false)
  }
})

test('phaseProgress reads the H1 emoji, and copes with no phases', () => {
  assert.deepStrictEqual(phaseProgress(base().phases), { done: 1, total: 3, current: 2 })
  assert.deepStrictEqual(phaseProgress([]), { done: 0, total: 0, current: null })
})
