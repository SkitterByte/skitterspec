'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { bumpPatch, tagSlug, planHotfixLand } = require('../src/env/hotfix.js')

// --- bumpPatch ------------------------------------------------------------

test('bumpPatch increments the patch and preserves a v-prefix', () => {
  assert.strictEqual(bumpPatch('v33.16.4'), 'v33.16.5')
  assert.strictEqual(bumpPatch('1.2.3'), '1.2.4')
  assert.strictEqual(bumpPatch('release-2.0.9'), 'release-2.0.10')
})

test('bumpPatch drops any pre-release/build suffix', () => {
  assert.strictEqual(bumpPatch('v1.2.3-rc1'), 'v1.2.4')
  assert.strictEqual(bumpPatch('1.2.3+build.7'), '1.2.4')
})

test('bumpPatch throws on a tag with no MAJOR.MINOR.PATCH core', () => {
  assert.throws(() => bumpPatch('v1.2'), /cannot bump a patch version/)
  assert.throws(() => bumpPatch('latest'), /cannot bump a patch version/)
  assert.throws(() => bumpPatch(''), /cannot bump a patch version/)
})

test('tagSlug makes a tag filesystem/branch-safe', () => {
  assert.strictEqual(tagSlug('v30.2.1'), 'v30-2-1')
  assert.strictEqual(tagSlug('release/2.0.0'), 'release-2-0-0')
})

// --- planHotfixLand -------------------------------------------------------

function spec(overrides = {}) {
  return {
    folder: 'hotfix-login',
    slug: 'login',
    type: 'hotfix',
    branch: 'hotfix/login',
    worktreePath: '/wt/login',
    baseRef: 'v33.16.4',
    ...overrides,
  }
}

const CONFIG = { hotfix: { bump: 'patch', cherryPickMain: true, targets: [] } }

function ctx(over = {}) {
  return {
    worktreeState: { dirty: false },
    aheadOfBase: true,
    fixRange: 'v33.16.4..hotfix/login',
    mainRepoPath: '/repo',
    base: 'main',
    extraTargets: [],
    existingTags: [],
    ...over,
  }
}

test('prod-only: tag the branch head, then cherry-pick onto main', () => {
  const plan = planHotfixLand(spec(), CONFIG, ctx())
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.prodTag, 'v33.16.5')
  assert.deepStrictEqual(plan.commands, [
    'git -C /wt/login tag v33.16.5',
    'git -C /repo cherry-pick v33.16.4..hotfix/login',
  ])
  // targets: prod + main (no extras)
  assert.deepStrictEqual(
    plan.targets.map((t) => t.kind),
    ['prod', 'main'],
  )
})

test('cherryPickMain:false omits the main cherry-pick', () => {
  const plan = planHotfixLand(spec(), { hotfix: { cherryPickMain: false, targets: [] } }, ctx())
  assert.deepStrictEqual(plan.commands, ['git -C /wt/login tag v33.16.5'])
  assert.deepStrictEqual(
    plan.targets.map((t) => t.kind),
    ['prod'],
  )
})

test('extra target: throwaway worktree, cherry-pick, re-tag, remove, force-delete', () => {
  const plan = planHotfixLand(spec(), CONFIG, ctx({ extraTargets: ['v30.2.1'] }))
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.commands, [
    'git -C /wt/login tag v33.16.5',
    'git worktree add /wt/login-onto-v30-2-1 -b hotfix/login-onto-v30-2-1 v30.2.1',
    'git -C /wt/login-onto-v30-2-1 cherry-pick v33.16.4..hotfix/login',
    'git -C /wt/login-onto-v30-2-1 tag v30.2.2',
    'git worktree remove /wt/login-onto-v30-2-1',
    'git branch -D hotfix/login-onto-v30-2-1',
    'git -C /repo cherry-pick v33.16.4..hotfix/login',
  ])
  const extra = plan.targets.find((t) => t.kind === 'extra')
  assert.deepStrictEqual({ base: extra.base, tag: extra.tag }, { base: 'v30.2.1', tag: 'v30.2.2' })
})

test('blocks on a dirty worktree (commit the completion first)', () => {
  const plan = planHotfixLand(spec(), CONFIG, ctx({ worktreeState: { dirty: true } }))
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /uncommitted/)
  assert.deepStrictEqual(plan.commands, [])
})

test('no-op when nothing is ahead of the base tag', () => {
  const plan = planHotfixLand(spec(), CONFIG, ctx({ aheadOfBase: false }))
  assert.strictEqual(plan.noop, true)
  assert.deepStrictEqual(plan.commands, [])
})

test('blocks when the prod tag already exists', () => {
  const plan = planHotfixLand(spec(), CONFIG, ctx({ existingTags: ['v33.16.5'] }))
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /v33\.16\.5 already exists/)
})

test('blocks when an extra target bumps to an existing tag', () => {
  const plan = planHotfixLand(spec(), CONFIG, ctx({ extraTargets: ['v30.2.1'], existingTags: ['v30.2.2'] }))
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /v30\.2\.2 \(for target v30\.2\.1\) already exists/)
})

test('blocks a spec with no Base version (not a hotfix)', () => {
  const plan = planHotfixLand(spec({ baseRef: null }), CONFIG, ctx())
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /no Base version/)
})

// --- afterLand -------------------------------------------------------------

const AFTER = { ...CONFIG, afterLand: ['pnpm db:data-migration'] }
const NO_AFTER = { cwd: null, commands: [] }

test('afterLand: planned after the main cherry-pick, in the primary checkout', () => {
  const plan = planHotfixLand(spec(), AFTER, ctx())
  assert.deepStrictEqual(plan.afterLand, { cwd: '/repo', commands: ['pnpm db:data-migration'] })
})

test('afterLand: none when cherryPickMain is off — main gained nothing', () => {
  const config = { ...AFTER, hotfix: { ...CONFIG.hotfix, cherryPickMain: false } }
  assert.deepStrictEqual(planHotfixLand(spec(), config, ctx()).afterLand, NO_AFTER)
})

test('afterLand: none on the no-op and on a blocked plan', () => {
  assert.deepStrictEqual(planHotfixLand(spec(), AFTER, ctx({ aheadOfBase: false })).afterLand, NO_AFTER)
  assert.deepStrictEqual(
    planHotfixLand(spec(), AFTER, ctx({ worktreeState: { dirty: true } })).afterLand, NO_AFTER)
})

test('afterLand stays silent when the key is absent', () => {
  assert.deepStrictEqual(planHotfixLand(spec(), CONFIG, ctx()).afterLand, NO_AFTER)
})
