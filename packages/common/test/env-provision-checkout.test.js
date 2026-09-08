'use strict'

// `planCheckoutUp` is the whole of checkout-mode provisioning: no worktree, no
// slot, no bootstrap, no opener — one `git switch`, or a refusal.
//
// Every refusal here protects work that is not ours to move. A dirty tree would
// be CARRIED onto the new branch by `git switch -c`, silently; standing on
// another spec's branch means switching away from someone's unfinished work.
// Neither is a warning, because being wrong about either loses something.

const { test } = require('node:test')
const assert = require('node:assert')

const { planCheckoutUp } = require('../src/env/provision.js')

const SPEC = { branch: 'feat/thing', folder: 'feat-thing' }
const ctx = (over = {}) => ({
  current: 'main', base: 'main', onBase: true, clean: true, branchExists: false, ...over,
})

test('a clean checkout on base gets one command: create the branch', () => {
  const plan = planCheckoutUp(SPEC, ctx(), {})
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.commands, ['git switch -c feat/thing'])
  assert.strictEqual(plan.mode, 'checkout')
})

test('an existing branch is switched to, not recreated', () => {
  // `-c` on an existing branch fails outright, so this is correctness, not style.
  const plan = planCheckoutUp(SPEC, ctx({ branchExists: true }), {})
  assert.deepStrictEqual(plan.commands, ['git switch feat/thing'])
})

test('the plan carries no worktree, bootstrap or opener', () => {
  // The positive assertion that checkout mode really is the cheap path — if any
  // of these ever appear, the hand-off has crept back in.
  const plan = planCheckoutUp(SPEC, ctx(), {})
  const text = JSON.stringify(plan)
  for (const absent of ['worktree add', 'seedCommands', 'setupCommands', 'openCommand']) {
    assert.ok(!text.includes(absent), `checkout plan should not mention ${absent}`)
  }
})

test('already on the spec branch is a re-run, not a refusal', () => {
  // And specifically NOT refused for being dirty: you are mid-phase, and the
  // phase's own edits are exactly what a dirty tree looks like there.
  const plan = planCheckoutUp(SPEC, ctx({ current: 'feat/thing', onBase: false, clean: false }), {})
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.attached, true)
  assert.deepStrictEqual(plan.commands, [], 'nothing to run')
})

test('a dirty checkout is refused, because the switch would carry the work', () => {
  const plan = planCheckoutUp(SPEC, ctx({ clean: false }), {})
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /uncommitted changes/i)
  assert.deepStrictEqual(plan.commands, [], 'a blocked plan runs nothing')
})

test("standing on another spec's branch is refused by name", () => {
  const plan = planCheckoutUp(SPEC, ctx({ current: 'feat/other', onBase: false }), {})
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /feat\/other/, 'names the branch actually held')
  assert.match(plan.reason, /one spec at a time/i, 'says why')
})

test('an unreadable git state is treated as dirty, not as clean', () => {
  // The unknown case routed to the harmless branch: a refusal the operator can
  // act on, rather than moving work we could not see.
  const plan = planCheckoutUp(SPEC, ctx({ clean: false, current: null, onBase: false }), {})
  assert.strictEqual(plan.blocked, true)
})
