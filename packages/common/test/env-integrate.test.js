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
const NONE = { cwd: null, commands: [], entries: [], range: null }
const ALWAYS = { run: 'pnpm db:data-migration', when: null, decision: 'always', matched: null }

test('afterLand: a landing plan carries the commands, to run in the primary checkout', () => {
  const p = planIntegrate(spec(), AFTER, CTX({ changedFiles: ['src/a.js'] }))
  assert.deepStrictEqual(p.afterLand,
    { cwd: '/repo', commands: ['pnpm db:data-migration'], entries: [ALWAYS], range: ['src/a.js'] })
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
  assert.deepStrictEqual(planIntegrateCheckout(spec(), AFTER, ctx).afterLand.commands, ['pnpm db:data-migration'])
  assert.strictEqual(planIntegrateCheckout(spec(), AFTER, ctx).afterLand.cwd, '/co')
  assert.deepStrictEqual(planIntegrateCheckout(spec(), AFTER, { ...ctx, aheadOfBase: false }).afterLand.commands,
    ['pnpm db:data-migration'])
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

// --- conditional afterLand --------------------------------------------------

const CONDITIONAL = {
  afterLand: [
    { run: 'pnpm install --frozen-lockfile', when: ['pnpm-lock.yaml', '**/package.json'] },
    { run: 'pnpm run db:generate', when: ['prisma/schema.prisma'] },
    { run: 'pnpm db:data-migration', when: null },
  ],
}
const decisions = (p) => p.afterLand.entries.map((e) => [e.run, e.decision, e.matched])

test('conditional: a land touching prisma/schema.prisma runs the generate entry, naming the path', () => {
  const p = planIntegrate(spec(), CONDITIONAL, CTX({ changedFiles: ['prisma/schema.prisma', 'src/x.ts'] }))
  assert.deepStrictEqual(decisions(p), [
    ['pnpm install --frozen-lockfile', 'skipped', null],
    ['pnpm run db:generate', 'matched', 'prisma/schema.prisma'],
    ['pnpm db:data-migration', 'always', null],
  ])
  assert.deepStrictEqual(p.afterLand.commands, ['pnpm run db:generate', 'pnpm db:data-migration'])
})

test('conditional: a land touching only src/ skips every conditional entry', () => {
  const p = planIntegrate(spec(), CONDITIONAL, CTX({ changedFiles: ['src/a.ts', 'src/b/c.ts'] }))
  assert.deepStrictEqual(p.afterLand.commands, ['pnpm db:data-migration'])
  assert.deepStrictEqual(p.afterLand.entries.filter((e) => e.decision === 'skipped').map((e) => e.run),
    ['pnpm install --frozen-lockfile', 'pnpm run db:generate'])
})

test('conditional: **/package.json matches a nested and a root manifest', () => {
  for (const f of ['package.json', 'packages/api/package.json']) {
    const p = planIntegrate(spec(), CONDITIONAL, CTX({ changedFiles: [f] }))
    assert.strictEqual(p.afterLand.entries[0].decision, 'matched', f)
  }
})

test('conditional stays silent: an empty known range skips them and claims nothing unknown', () => {
  const p = planIntegrate(spec(), CONDITIONAL, CTX({ changedFiles: [] }))
  assert.deepStrictEqual(p.afterLand.commands, ['pnpm db:data-migration'])
  assert.ok(!p.afterLand.entries.some((e) => e.decision === 'unknown'))
  assert.deepStrictEqual(p.afterLand.range, [])
})

test('conditional: the already-landed no-op cannot tell the range, so they run', () => {
  const p = planIntegrate(spec(), CONDITIONAL, CTX({ aheadOfBase: false, changedFiles: ['src/a.ts'] }))
  assert.strictEqual(p.afterLand.range, null)
  assert.deepStrictEqual(p.afterLand.commands,
    ['pnpm install --frozen-lockfile', 'pnpm run db:generate', 'pnpm db:data-migration'])
  assert.deepStrictEqual(p.afterLand.entries.map((e) => e.decision), ['unknown', 'unknown', 'always'])
})

test('conditional: a range the caller could not read (null or absent) runs them', () => {
  for (const changedFiles of [null, undefined]) {
    const p = planIntegrate(spec(), CONDITIONAL, CTX({ changedFiles }))
    assert.deepStrictEqual(p.afterLand.entries.map((e) => e.decision), ['unknown', 'unknown', 'always'])
  }
})

test('conditional: checkout mode decides against the same range', () => {
  const ctx = { dirty: false, base: 'main', aheadOfBase: true, checkoutPath: '/co', onBranch: true,
    changedFiles: ['pnpm-lock.yaml'] }
  assert.deepStrictEqual(planIntegrateCheckout(spec(), CONDITIONAL, ctx).afterLand.commands,
    ['pnpm install --frozen-lockfile', 'pnpm db:data-migration'])
  assert.deepStrictEqual(
    planIntegrateCheckout(spec(), CONDITIONAL, { ...ctx, aheadOfBase: false }).afterLand.entries.map((e) => e.decision),
    ['unknown', 'unknown', 'always'])
})

test('conditional: a land where every entry skips still carries the section (cwd set, no commands)', () => {
  const p = planIntegrate(spec(), { afterLand: [CONDITIONAL.afterLand[1]] }, CTX({ changedFiles: ['src/a.ts'] }))
  assert.strictEqual(p.afterLand.cwd, '/repo')
  assert.deepStrictEqual(p.afterLand.commands, [])
})
