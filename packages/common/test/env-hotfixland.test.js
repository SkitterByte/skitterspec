'use strict'

/**
 * The hotfix land runner (`hotfixland.js`) and the steps the planner hands it.
 *
 * Everything here drives a FAKE spawn: what is being proven is which commands
 * the runner issues, in what order, and where it stops. The real git and a real
 * release command are exercised end to end in `cli-spec-env-hotfix-land.test.js`.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { parseRelease, runHotfixLand } = require('../src/env/hotfixland.js')
const { planHotfixLand } = require('../src/env/hotfix.js')

const GOOD = {
  tag: 'v37.2.0-hotfix.1',
  version: '37.2.0-hotfix.1',
  baseTag: 'v37.2.0',
  branch: 'hotfix/login',
  versionCommit: 'a'.repeat(40),
  pushed: false,
}

// A spawn that records every call and answers from `answers` in order.
function fakeSpawn(answers = []) {
  const calls = []
  const spawn = (cmd, args, opts) => {
    const shell = typeof args === 'object' && !Array.isArray(args)
    calls.push(shell ? { cmd, opts: args } : { cmd, args, opts })
    return answers.shift() || { status: 0, stdout: '', stderr: '' }
  }
  return { spawn, calls }
}

const io = (spawn, extra = {}) => ({ spawn, childStderr: () => {}, ...extra })

// --- parseRelease -----------------------------------------------------------

test('parseRelease accepts skittership\'s one JSON line', () => {
  const r = parseRelease(JSON.stringify(GOOD) + '\n')
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.release.tag, 'v37.2.0-hotfix.1')
})

test('parseRelease refuses a banner before the JSON', () => {
  const r = parseRelease('> ereqs@1.0.0 release:hotfix\n' + JSON.stringify(GOOD))
  assert.strictEqual(r.ok, false)
  assert.match(r.reason, /not one JSON object/)
})

test('parseRelease refuses empty stdout, a non-object, and a missing field', () => {
  assert.match(parseRelease('').reason, /printed nothing/)
  assert.match(parseRelease('[1]').reason, /not an object/)
  const { tag, ...noTag } = GOOD
  assert.match(parseRelease(JSON.stringify(noTag)).reason, /"tag"/)
  assert.match(parseRelease(JSON.stringify({ ...GOOD, tag: '' })).reason, /"tag"/)
  assert.match(parseRelease(JSON.stringify({ ...GOOD, pushed: 'no' })).reason, /"pushed"/)
})

test('parseRelease takes a null versionCommit', () => {
  assert.strictEqual(parseRelease(JSON.stringify({ ...GOOD, versionCommit: null })).ok, true)
})

// --- the planner's steps ----------------------------------------------------

function spec(over = {}) {
  return {
    folder: 'hotfix-login',
    slug: 'login',
    type: 'hotfix',
    branch: 'hotfix/login',
    worktreePath: '/wt/login',
    baseRef: 'v37.2.0',
    ...over,
  }
}
function ctx(over = {}) {
  return {
    worktreeState: { dirty: false },
    aheadOfBase: true,
    fixRange: 'v37.2.0..hotfix/login',
    mainRepoPath: '/repo',
    base: 'main',
    extraTargets: [],
    existingTags: ['v37.2.0'],
    // Not about the push unless a test says so: the tag is already published,
    // so the run goes straight on to the carry.
    pushed: true,
    ...over,
  }
}
const RELEASE_WITH = {
  hotfix: { bump: 'patch', cherryPickMain: true, targets: [], releaseWith: 'node scripts/release-hotfix.cjs --json' },
}

test('with releaseWith set, the plan runs the command and emits no git tag', () => {
  const plan = planHotfixLand(spec(), RELEASE_WITH, ctx())
  assert.deepStrictEqual(plan.steps[0], {
    kind: 'release',
    via: 'command',
    command: 'node scripts/release-hotfix.cjs --json',
    cwd: '/wt/login',
  })
  assert.strictEqual(plan.prodTag, null, 'the tag is the command\'s to choose')
  assert.ok(!plan.commands.some((c) => / tag /.test(c)), plan.commands.join('\n'))
})

test('a release recorded at HEAD is reused, never re-cut — whatever cut it', () => {
  const plan = planHotfixLand(spec(), RELEASE_WITH, ctx({ released: GOOD, existingTags: ['v37.2.0', GOOD.tag] }))
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.steps[0], { kind: 'release', via: 'recorded', tag: GOOD.tag, release: GOOD })
  assert.strictEqual(plan.prodTag, GOOD.tag)
})

test('stays silent: the default config plans the built-in tag, a held push, the carry', () => {
  const plan = planHotfixLand(
    spec(),
    { hotfix: { bump: 'patch', cherryPickMain: true, targets: [] } },
    ctx({ pushed: false }),
  )
  assert.deepStrictEqual(plan.steps.map((s) => [s.kind, s.via || null]), [
    ['release', 'tag'],
    ['push', 'hold'],
    ['carry', null],
  ])
  assert.strictEqual(plan.steps[0].tag, 'v37.2.1')
})

// --- the runner -------------------------------------------------------------

test('releaseWith: the JSON\'s tag is used and recorded, and no git tag runs', () => {
  const { spawn, calls } = fakeSpawn([{ status: 0, stdout: JSON.stringify(GOOD), stderr: 'progress\n' }])
  const recorded = []
  const plan = planHotfixLand(spec(), RELEASE_WITH, ctx())
  const r = runHotfixLand(plan.steps, io(spawn, { record: (x) => recorded.push(x) }))
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.release.tag, GOOD.tag)
  assert.deepStrictEqual(recorded, [GOOD])
  assert.strictEqual(calls[0].cmd, 'node scripts/release-hotfix.cjs --json')
  assert.strictEqual(calls[0].opts.cwd, '/wt/login')
  assert.ok(!calls.some((c) => c.args && c.args.includes('tag')), 'no built-in tag')
  assert.deepStrictEqual(calls[1].args, ['-C', '/repo', 'cherry-pick', 'v37.2.0..hotfix/login'])
})

test('a failing releaseWith refuses, relays its stderr line, and runs nothing after', () => {
  const { spawn, calls } = fakeSpawn([
    { status: 1, stdout: '', stderr: '✖ release-hotfix: tree is dirty\n' },
  ])
  const recorded = []
  const plan = planHotfixLand(spec(), RELEASE_WITH, ctx())
  const r = runHotfixLand(plan.steps, io(spawn, { record: (x) => recorded.push(x) }))
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.failedAt, 1)
  assert.match(r.results[0].line, /release refused — ✖ release-hotfix: tree is dirty/)
  assert.strictEqual(calls.length, 1, 'no carry, no target')
  assert.deepStrictEqual(recorded, [])
})

test('a releaseWith whose stdout is not the JSON refuses, even on exit 0', () => {
  const { spawn, calls } = fakeSpawn([{ status: 0, stdout: 'done!\n', stderr: '' }])
  const plan = planHotfixLand(spec(), RELEASE_WITH, ctx())
  const r = runHotfixLand(plan.steps, io(spawn))
  assert.strictEqual(r.ok, false)
  assert.match(r.results[0].line, /not one JSON object/)
  assert.strictEqual(calls.length, 1)
})

test('a recorded release is skipped and the run carries on', () => {
  const { spawn, calls } = fakeSpawn()
  const recorded = []
  const plan = planHotfixLand(spec(), RELEASE_WITH, ctx({ released: GOOD }))
  const r = runHotfixLand(plan.steps, io(spawn, { record: (x) => recorded.push(x) }))
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.results[0].outcome, 'skipped')
  assert.deepStrictEqual(recorded, [], 'nothing new was cut, so nothing new is recorded')
  assert.strictEqual(calls.length, 1, 'only the carry ran')
})

test('a carry that fails stops the run but keeps the release it cut', () => {
  const { spawn } = fakeSpawn([
    { status: 0, stdout: JSON.stringify(GOOD), stderr: '' },
    { status: 1, stdout: '', stderr: 'error: could not apply abc123\n' },
  ])
  const plan = planHotfixLand(spec(), RELEASE_WITH, ctx())
  const r = runHotfixLand(plan.steps, io(spawn))
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.failedAt, 3)
  assert.strictEqual(r.release.tag, GOOD.tag)
  assert.match(r.results[2].line, /could not apply abc123/)
})

test('a target the release already tagged is refused rather than colliding', () => {
  const { spawn, calls } = fakeSpawn([{ status: 0, stdout: JSON.stringify(GOOD), stderr: '' }])
  const plan = planHotfixLand(
    spec(),
    { hotfix: { ...RELEASE_WITH.hotfix, bump: 'hotfix-suffix' } },
    ctx({ extraTargets: ['v37.2.0'] }),
  )
  // The planner could not know the command's tag; the runner catches it.
  const r = runHotfixLand(plan.steps, io(spawn))
  assert.strictEqual(r.ok, false)
  assert.match(r.results[2].line, /already cut v37\.2\.0-hotfix\.1/)
  assert.strictEqual(calls.length, 1)
})

test('the built-in tagger tags HEAD and records a release with no version commit', () => {
  const { spawn, calls } = fakeSpawn()
  const recorded = []
  const plan = planHotfixLand(spec(), { hotfix: { bump: 'hotfix-suffix', cherryPickMain: false, targets: [] } }, ctx())
  const r = runHotfixLand(plan.steps, io(spawn, { record: (x) => recorded.push(x) }))
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(calls[0].args, ['-C', '/wt/login', 'tag', 'v37.2.0-hotfix.1'])
  assert.strictEqual(recorded[0].versionCommit, null)
  assert.strictEqual(recorded[0].tag, 'v37.2.0-hotfix.1')
})

// --- the push ----------------------------------------------------------------

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' })

test('--push publishes the branch, then the tag, before anything is carried', () => {
  const { spawn, calls } = fakeSpawn([ok(JSON.stringify(GOOD)), ok(), ok(), ok()])
  const recorded = []
  const plan = planHotfixLand(spec(), RELEASE_WITH, ctx({ pushed: false, push: true }))
  const r = runHotfixLand(plan.steps, io(spawn, { record: (x) => recorded.push(x) }))
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(
    calls.slice(1).map((c) => c.args),
    [
      ['-C', '/wt/login', 'push', 'origin', 'hotfix/login'],
      ['-C', '/wt/login', 'push', 'origin', 'v37.2.0-hotfix.1'],
      ['-C', '/repo', 'cherry-pick', 'v37.2.0..hotfix/login'],
    ],
  )
  assert.strictEqual(recorded[recorded.length - 1].pushed, true, 'the record learns it was pushed')
})

test('no consent: the run holds after the release and carries nothing', () => {
  const { spawn, calls } = fakeSpawn([ok(JSON.stringify(GOOD))])
  const plan = planHotfixLand(spec(), RELEASE_WITH, ctx({ pushed: false }))
  const r = runHotfixLand(plan.steps, io(spawn))
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.held, true)
  assert.strictEqual(r.release.tag, GOOD.tag)
  assert.strictEqual(calls.length, 1, 'no push, no carry')
})

test('a failed push stops the run before the carry', () => {
  const { spawn, calls } = fakeSpawn([
    ok(JSON.stringify(GOOD)),
    ok(),
    { status: 1, stdout: '', stderr: 'remote: permission denied\n' },
  ])
  const plan = planHotfixLand(spec(), RELEASE_WITH, ctx({ pushed: false, push: true }))
  const r = runHotfixLand(plan.steps, io(spawn))
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.failedAt, 2)
  assert.match(r.results[1].line, /push v37\.2\.0-hotfix\.1 to origin — remote: permission denied/)
  assert.strictEqual(calls.length, 3, 'branch push, tag push, and no carry')
})

test('a tag already on the remote is honoured: no push runs, the carry does', () => {
  const { spawn, calls } = fakeSpawn()
  const plan = planHotfixLand(spec(), RELEASE_WITH, ctx({ released: GOOD, pushed: true }))
  const r = runHotfixLand(plan.steps, io(spawn))
  assert.strictEqual(r.ok, true)
  assert.match(r.results[1].line, /already on origin/)
  assert.deepStrictEqual(calls.map((c) => c.args[2]), ['cherry-pick'])
})
