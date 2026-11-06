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

// --- planIntegratePr (land.strategy: "pr") ----------------------------------

const { planIntegratePr } = require('../src/env/integrate.js')

const PRCTX = (overrides = {}) => ({
  worktreeState: { dirty: false },
  base: 'main',
  remote: 'origin',
  treePath: '/wt/thing',
  aheadOfRemoteBase: true,
  pushedAtHead: false,
  push: false,
  ...overrides,
})

test('pr: holds by default — rebase planned, push and PR held for consent', () => {
  const p = planIntegratePr(spec(), {}, PRCTX())
  assert.strictEqual(p.blocked, false)
  assert.strictEqual(p.noop, false)
  assert.deepStrictEqual(p.commands, [
    'git -C /wt/thing fetch origin main',
    'git -C /wt/thing rebase origin/main',
  ])
  assert.deepStrictEqual(p.push, { kind: 'push', via: 'hold', remote: 'origin', branch: 'feat/thing' })
  assert.strictEqual(p.holdCommands[0], 'git -C /wt/thing push --force-with-lease -u origin feat/thing')
  assert.match(p.holdCommands[1], /^# open a pull request: feat\/thing -> main on origin/)
})

test('pr: --push folds the push and PR into the one command list', () => {
  const p = planIntegratePr(spec(), {}, PRCTX({ push: true }))
  assert.strictEqual(p.push.via, 'push')
  assert.deepStrictEqual(p.holdCommands, [])
  assert.deepStrictEqual(p.commands, [
    'git -C /wt/thing fetch origin main',
    'git -C /wt/thing rebase origin/main',
    'git -C /wt/thing push --force-with-lease -u origin feat/thing',
    '# open a pull request: feat/thing -> main on origin (gh / az repos)',
  ])
})

test('pr: a branch already on the remote at HEAD is the consent (via remote)', () => {
  const p = planIntegratePr(spec(), {}, PRCTX({ pushedAtHead: true }))
  assert.strictEqual(p.push.via, 'remote')
  assert.deepStrictEqual(p.holdCommands, [])
  assert.ok(p.commands.some((c) => c.includes('push --force-with-lease')))
})

test('pr: a caller-supplied PR command replaces the placeholder', () => {
  const p = planIntegratePr(spec(), {}, PRCTX({ push: true, prCreateCommand: 'gh pr create --fill' }))
  assert.strictEqual(p.commands[p.commands.length - 1], 'gh pr create --fill')
})

test('pr: blocks on a dirty tree with the same reason as the ff planner', () => {
  const p = planIntegratePr(spec(), {}, PRCTX({ worktreeState: { dirty: true } }))
  assert.strictEqual(p.blocked, true)
  assert.match(p.reason, /commit the completion first/)
  assert.deepStrictEqual(p.commands, [])
})

test('pr: checkout mode blocks when the checkout is not on the branch', () => {
  const p = planIntegratePr(spec(), {}, PRCTX({ treePath: '/repo', onBranch: false }))
  assert.strictEqual(p.blocked, true)
  assert.match(p.reason, /not on feat\/thing/)
})

test('pr: noop only on an explicit not-ahead — an unreadable remote base plans', () => {
  const landed = planIntegratePr(spec(), {}, PRCTX({ aheadOfRemoteBase: false }))
  assert.strictEqual(landed.noop, true)
  assert.deepStrictEqual(landed.commands, [])
  // null = <remote>/<base> could not be read. An absence is not evidence of a
  // land, so the plan is emitted — its own fetch makes the next run answerable.
  const unknown = planIntegratePr(spec(), {}, PRCTX({ aheadOfRemoteBase: null }))
  assert.strictEqual(unknown.noop, false)
  assert.ok(unknown.commands.length > 0)
})

test('pr: afterLand is deferred to the post-merge completion run, never emitted', () => {
  const p = planIntegratePr(spec(), AFTER, PRCTX({ push: true }))
  assert.deepStrictEqual(p.afterLand, NONE)
  assert.strictEqual(p.afterLandPending, 'after-merge')
})

test('stays-silent: the ff planners ignore land config entirely', () => {
  const prConfig = { land: { strategy: 'pr', remote: 'origin', draft: true, specDocs: 'trunk' } }
  assert.deepStrictEqual(planIntegrate(spec(), prConfig, CTX()), planIntegrate(spec(), {}, CTX()))
})

test('pr: a landed branch carries the finish — catch base up + the deferred afterLand', () => {
  const p = planIntegratePr(spec(), AFTER, PRCTX({
    aheadOfRemoteBase: false,
    primaryPath: '/repo',
    changedFiles: ['src/a.js'],
  }))
  assert.strictEqual(p.noop, true)
  assert.deepStrictEqual(p.finish.commands, [
    'git -C /repo fetch origin main',
    'git -C /repo merge --ff-only origin/main',
  ])
  assert.deepStrictEqual(p.finish.afterLand.commands, ['pnpm db:data-migration'])
  assert.deepStrictEqual(p.finish.afterLand.range, ['src/a.js'])
})

test('pr: a finish with no primaryPath names no commands rather than guessing', () => {
  const p = planIntegratePr(spec(), {}, PRCTX({ aheadOfRemoteBase: false }))
  assert.strictEqual(p.noop, true)
  assert.deepStrictEqual(p.finish.commands, [])
})
