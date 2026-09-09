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

// --- checkout-mode landing and teardown --------------------------------------

const { planIntegrateCheckout } = require('../src/env/integrate.js')
const { planDownCheckout } = require('../src/env/teardown.js')

const ictx = (over = {}) => ({
  dirty: false, base: 'main', aheadOfBase: true, checkoutPath: '/repo', onBranch: true, ...over,
})

test('landing in checkout mode rebases, switches to base, then fast-forwards', () => {
  const plan = planIntegrateCheckout(SPEC, {}, ictx())
  assert.deepStrictEqual(plan.commands, [
    'git -C /repo rebase main',
    'git -C /repo switch main',
    'git -C /repo merge --ff-only feat/thing',
  ])
})

test('the switch to base is part of landing, not an afterthought', () => {
  // Leaving the checkout on a landed branch would make the NEXT `spec-env up`
  // refuse ("standing on another spec's branch") for a spec that is finished.
  const plan = planIntegrateCheckout(SPEC, {}, ictx())
  assert.ok(
    plan.commands.some((c) => c.includes('switch main')),
    'landing returns the checkout to base',
  )
})

test('an already-landed spec is a no-op wherever the checkout stands', () => {
  // Regression: this ordering was wrong first time round. After a successful
  // land the checkout is ON BASE, so asking "are you on the branch?" first
  // refused the very spec that had just been landed — which /spec-complete
  // hits every time, because it calls integrate again.
  for (const over of [{ onBranch: false }, { onBranch: false, dirty: true }, {}]) {
    const plan = planIntegrateCheckout(SPEC, {}, ictx({ aheadOfBase: false, ...over }))
    assert.strictEqual(plan.noop, true, `landed spec should be a no-op (${JSON.stringify(over)})`)
    assert.strictEqual(plan.blocked, false)
  }
})

test('landing is refused from the wrong branch when there IS work to land', () => {
  const plan = planIntegrateCheckout(SPEC, {}, ictx({ onBranch: false }))
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /not on feat\/thing/)
})

const GUARDS = { guards: { refuseTeardownIfDirty: true, refuseTeardownIfUnpushed: true } }
const dctx = (over = {}) => ({
  dirty: false, landed: true, onBranch: true, base: 'main', checkoutPath: '/repo', ...over,
})

test('checkout teardown switches off the branch before deleting it', () => {
  // git refuses to delete the branch you are standing on, so the order is
  // correctness rather than tidiness.
  const plan = planDownCheckout(SPEC, GUARDS, {}, dctx())
  assert.deepStrictEqual(plan.commands, [
    'git -C /repo switch main',
    'git -C /repo branch -D feat/thing',
  ])
})

test('checkout teardown removes no worktree, slot or volume', () => {
  const text = JSON.stringify(planDownCheckout(SPEC, GUARDS, {}, dctx()))
  for (const absent of ['worktree remove', 'docker', 'volume']) {
    assert.ok(!text.includes(absent), `checkout teardown should not mention ${absent}`)
  }
})

test('an unlanded branch is refused, because the delete is what loses it', () => {
  const plan = planDownCheckout(SPEC, GUARDS, {}, dctx({ landed: false }))
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /not merged into main/)
})

test('--force tears down an unlanded branch, as it does in worktree mode', () => {
  const plan = planDownCheckout(SPEC, GUARDS, { force: true }, dctx({ landed: false, dirty: true }))
  assert.strictEqual(plan.blocked, false)
  assert.ok(plan.commands.some((c) => c.includes('branch -d ')), 'unlanded uses -d, not -D')
})

// --- the tree gate ---------------------------------------------------------

const SPEC_B = { ...SPEC, bucket: 'backlog', slug: 'thing' }

test('a dirty tree that is only the spec is committed, then switched to', () => {
  const plan = planCheckoutUp(SPEC_B, ctx({ clean: false, dirtyPaths: ['specs/backlog/feat-thing'] }), {})
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.commands, [
    'git add "specs/backlog/feat-thing"',
    'git commit -m "chore(spec): add feat-thing"',
    'git switch -c feat/thing',
  ])
})

test('foreign dirt still refuses, and still says switching would carry it', () => {
  const plan = planCheckoutUp(SPEC_B, ctx({ clean: false, dirtyPaths: ['src/app.js'] }), {})
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /carry them onto the new branch/)
  assert.match(plan.reason, /src\/app\.js/)
})

test('a re-run on the spec\'s own branch is still never refused for dirt', () => {
  // Mid-phase edits are legitimately uncommitted; "already attached" must stay
  // ahead of the gate, exactly as it stayed ahead of the old clean flag.
  const plan = planCheckoutUp(
    SPEC_B,
    ctx({ current: 'feat/thing', clean: false, dirtyPaths: ['src/app.js'] }),
    {},
  )
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.attached, true)
})

test('a clean tree whose spec is not on base refuses in checkout mode too', () => {
  const plan = planCheckoutUp(SPEC_B, ctx({ dirtyPaths: [], specOnBase: false }), {})
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /not committed on main/)
})
