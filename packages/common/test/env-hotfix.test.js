'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const {
  bumpPatch,
  compareTags,
  nextHotfixTag,
  nextTag,
  tagSlug,
  planHotfixLand,
} = require('../src/env/hotfix.js')

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

// --- tag order and the hotfix-suffix strategy ------------------------------

test('compareTags: rc < release < hotfix.N < next patch, hotfix numbers numeric', () => {
  const sorted = [
    'v37.2.1',
    'v37.2.0-hotfix.10',
    'v37.2.0',
    'v37.2.0-hotfix.2',
    'v37.2.0-rc.1',
    'v37.1.9',
    'v37.2.0-hotfix.9',
  ].sort(compareTags)
  assert.deepStrictEqual(sorted, [
    'v37.1.9',
    'v37.2.0-rc.1',
    'v37.2.0',
    'v37.2.0-hotfix.2',
    'v37.2.0-hotfix.9',
    'v37.2.0-hotfix.10',
    'v37.2.1',
  ])
})

test('compareTags: an unparseable tag never sorts as the newest', () => {
  assert.ok(compareTags('latest', 'v1.0.0') < 0)
  assert.ok(compareTags('v1.0.0', 'latest') > 0)
})

test('nextHotfixTag: a fresh base gives -hotfix.1', () => {
  assert.strictEqual(nextHotfixTag('v37.2.0', ['v37.2.0']), 'v37.2.0-hotfix.1')
  assert.strictEqual(nextHotfixTag('1.4.0', []), '1.4.0-hotfix.1')
})

test('nextHotfixTag: one above the highest existing hotfix on that root', () => {
  const tags = ['v37.2.0', 'v37.2.0-hotfix.1', 'v37.2.0-hotfix.2', 'v36.4.0-hotfix.7']
  assert.strictEqual(nextHotfixTag('v37.2.0', tags), 'v37.2.0-hotfix.3')
})

test('nextHotfixTag: a hotfix base continues its own line', () => {
  assert.strictEqual(
    nextHotfixTag('v36.4.0-hotfix.2', ['v36.4.0', 'v36.4.0-hotfix.1', 'v36.4.0-hotfix.2']),
    'v36.4.0-hotfix.3',
  )
  // The base itself counts even when the tag list was not fetched.
  assert.strictEqual(nextHotfixTag('v36.4.0-hotfix.2', []), 'v36.4.0-hotfix.3')
})

test('nextHotfixTag: a later X.Y.(Z+1) is neither a collision nor counted', () => {
  assert.strictEqual(nextHotfixTag('v37.2.0', ['v37.2.0', 'v37.2.1']), 'v37.2.0-hotfix.1')
})

test('nextHotfixTag: refuses a pre-release base and a tag with no core', () => {
  assert.throws(() => nextHotfixTag('v37.2.0-rc.1', []), /pre-release/)
  assert.throws(() => nextHotfixTag('latest', []), /MAJOR.MINOR.PATCH/)
})

test('nextTag: an unknown bump is refused, never treated as patch', () => {
  assert.strictEqual(nextTag('v1.2.3', [], 'patch'), 'v1.2.4')
  assert.strictEqual(nextTag('v1.2.3', [], 'hotfix-suffix'), 'v1.2.3-hotfix.1')
  assert.throws(() => nextTag('v1.2.3', [], 'hotfix'), /unknown hotfix.bump "hotfix"/)
})

const SUFFIX = { hotfix: { bump: 'hotfix-suffix', cherryPickMain: true, targets: [] } }

test('hotfix-suffix: not blocked by an existing next patch', () => {
  const plan = planHotfixLand(
    spec({ baseRef: 'v37.2.0' }),
    SUFFIX,
    ctx({ fixRange: 'v37.2.0..hotfix/login', existingTags: ['v37.2.0', 'v37.2.1'] }),
  )
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.prodTag, 'v37.2.0-hotfix.1')
  assert.strictEqual(plan.commands[0], 'git -C /wt/login tag v37.2.0-hotfix.1')
})

test('hotfix-suffix: two targets on one root get successive numbers', () => {
  const plan = planHotfixLand(
    spec({ baseRef: 'v37.2.0' }),
    SUFFIX,
    ctx({ extraTargets: ['v37.2.0-hotfix.1'], existingTags: ['v37.2.0', 'v37.2.0-hotfix.1'] }),
  )
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(
    plan.targets.filter((t) => t.tag).map((t) => t.tag),
    ['v37.2.0-hotfix.2', 'v37.2.0-hotfix.3'],
  )
})

test('an unknown bump throws out of the planner rather than tagging', () => {
  assert.throws(
    () => planHotfixLand(spec(), { hotfix: { bump: 'minor', targets: [] } }, ctx()),
    /unknown hotfix.bump "minor"/,
  )
})

test('stays silent: the default config plans exactly the patch tag and commands', () => {
  const plan = planHotfixLand(spec(), CONFIG, ctx({ existingTags: ['v33.16.4'] }))
  assert.strictEqual(plan.prodTag, 'v33.16.5')
  assert.deepStrictEqual(plan.commands, [
    'git -C /wt/login tag v33.16.5',
    'git -C /repo cherry-pick v33.16.4..hotfix/login',
  ])
  // And a config with no hotfix block at all is the same patch default.
  assert.strictEqual(planHotfixLand(spec(), {}, ctx()).prodTag, 'v33.16.5')
})

test('a Base version header may be a hotfix tag', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const { readBaseVersionField } = require('../src/env/resolve.js')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-basever-'))
  try {
    const file = path.join(dir, '00-overview.md')
    fs.writeFileSync(file, '# H\n\n> **Type:** Hotfix\n> **Base version:** v36.4.0-hotfix.2\n')
    assert.strictEqual(readBaseVersionField(dir), 'v36.4.0-hotfix.2')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
