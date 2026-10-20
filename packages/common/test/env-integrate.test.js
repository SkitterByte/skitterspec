'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { planIntegrate } = require('../src/env/integrate.js')

function spec(overrides = {}) {
  return {
    folder: 'feat-thing',
    branch: 'feat/thing',
    worktreePath: '/wt/thing',
    ...overrides,
  }
}

const CTX = (overrides = {}) => ({
  worktreeState: { dirty: false },
  base: 'main',
  aheadOfBase: true,
  mainRepoPath: '/repo',
  ...overrides,
})

test('clean, diverged worktree → rebase onto base + ff base to branch', () => {
  const p = planIntegrate(spec(), {}, CTX())
  assert.strictEqual(p.blocked, false)
  assert.strictEqual(p.noop, false)
  assert.deepStrictEqual(p.commands, [
    'git -C /wt/thing rebase main',
    'git -C /repo merge --ff-only feat/thing',
  ])
  assert.strictEqual(p.base, 'main')
  assert.strictEqual(p.branch, 'feat/thing')
})

test('blocks on a dirty worktree (commit the completion first)', () => {
  const p = planIntegrate(spec(), {}, CTX({ worktreeState: { dirty: true } }))
  assert.strictEqual(p.blocked, true)
  assert.match(p.reason, /commit the completion first/)
  assert.deepStrictEqual(p.commands, [])
})

test('no-ops when the branch is not ahead of base (already landed)', () => {
  const p = planIntegrate(spec(), {}, CTX({ aheadOfBase: false }))
  assert.strictEqual(p.blocked, false)
  assert.strictEqual(p.noop, true)
  assert.deepStrictEqual(p.commands, [])
})

test('targets the resolved base and mainRepoPath, not hardcoded values', () => {
  const p = planIntegrate(
    spec({ branch: 'bug/x', worktreePath: '/w/x' }),
    {},
    CTX({ base: 'develop', mainRepoPath: '/primary' }),
  )
  assert.deepStrictEqual(p.commands, [
    'git -C /w/x rebase develop',
    'git -C /primary merge --ff-only bug/x',
  ])
})

// --- afterLand -------------------------------------------------------------

const { planIntegrateCheckout } = require('../src/env/integrate.js')
const AFTER = { afterLand: ['pnpm db:data-migration'] }
const NONE = { cwd: null, commands: [] }

test('afterLand: a landing plan carries the commands, to run in the primary checkout', () => {
  const p = planIntegrate(spec(), AFTER, CTX())
  assert.deepStrictEqual(p.afterLand, { cwd: '/repo', commands: ['pnpm db:data-migration'] })
})

test('afterLand: the already-landed no-op still carries them (landed elsewhere)', () => {
  const p = planIntegrate(spec(), AFTER, CTX({ aheadOfBase: false }))
  assert.strictEqual(p.noop, true)
  assert.deepStrictEqual(p.afterLand.commands, ['pnpm db:data-migration'])
})

test('afterLand: a blocked plan carries none — nothing landed', () => {
  const p = planIntegrate(spec(), AFTER, CTX({ worktreeState: { dirty: true } }))
  assert.deepStrictEqual(p.afterLand, NONE)
})

test('afterLand: checkout mode runs them in the checkout, on land and on no-op', () => {
  const ctx = { dirty: false, base: 'main', aheadOfBase: true, checkoutPath: '/co', onBranch: true }
  assert.deepStrictEqual(planIntegrateCheckout(spec(), AFTER, ctx).afterLand,
    { cwd: '/co', commands: ['pnpm db:data-migration'] })
  assert.deepStrictEqual(planIntegrateCheckout(spec(), AFTER, { ...ctx, aheadOfBase: false }).afterLand,
    { cwd: '/co', commands: ['pnpm db:data-migration'] })
  assert.deepStrictEqual(planIntegrateCheckout(spec(), AFTER, { ...ctx, onBranch: false }).afterLand, NONE)
})

test('afterLand stays silent when the key is absent — every plan shape', () => {
  for (const config of [{}, undefined, { afterLand: [] }]) {
    assert.deepStrictEqual(planIntegrate(spec(), config, CTX()).afterLand, NONE)
    assert.deepStrictEqual(planIntegrate(spec(), config, CTX({ aheadOfBase: false })).afterLand, NONE)
    const ctx = { dirty: false, base: 'main', aheadOfBase: false, checkoutPath: '/co', onBranch: true }
    assert.deepStrictEqual(planIntegrateCheckout(spec(), config, ctx).afterLand, NONE)
  }
})
