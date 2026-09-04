'use strict'

/**
 * `spec-sync stage` — moving a release's tickets onto a deployment rung.
 *
 * The write half of `released`, and a separate verb precisely so the read half
 * stays incapable of writing. Two things carry the weight here: the dry run is
 * the DEFAULT (a wrong range must be visible before it is acted on), and every
 * ticket it declines to move is named with a reason (a silent exclusion and a
 * successful move look identical in a pipeline log).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const LADDER = [
  { key: 'test', state: 'On Test' },
  { key: 'demo', state: 'Ready for Demo' },
  { key: 'prod', state: 'Done' },
]

const STATES = [
  { id: 'st-backlog', name: 'Backlog', type: 'backlog' },
  { id: 'st-prog', name: 'In Progress', type: 'started' },
  { id: 'st-test', name: 'On Test', type: 'started' },
  { id: 'st-demo', name: 'Ready for Demo', type: 'started' },
  { id: 'st-done', name: 'Done', type: 'completed' },
]

function repo({ stages = LADDER, teamKey = 'SKS', specs = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-stage-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  const config = { linear: { teamId: 'T1', teamKey } }
  if (stages) config.release = { stages }
  fs.writeFileSync(cfg, JSON.stringify(config), 'utf-8')

  // specs: { "<ref>": "<bucket>" }
  for (const [ref, bucket] of Object.entries(specs)) {
    const folder = path.join(dir, 'specs', bucket, `feat-${ref.toLowerCase()}`)
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(
      path.join(folder, '00-overview.md'),
      `---\nlinear_identifier: "${ref}"\n---\n\n# ${ref}\n`,
      'utf-8',
    )
  }

  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  git('init', '-q')
  git('config', 'user.email', 't@e.com')
  git('config', 'user.name', 'T')
  return {
    dir,
    commit(message) {
      fs.appendFileSync(path.join(dir, 'f.txt'), message + '\n')
      git('add', '-A')
      git('commit', '-q', '-m', message)
    },
    tag: (name) => git('tag', name),
  }
}

// A stand-in Linear holding issues by identifier, recording every write.
function fakeLinear(issues = {}, { failOn = null } = {}) {
  const writes = []
  return {
    writes,
    async listIssueStates() {
      return STATES
    },
    async readIssue(ref) {
      const issue = issues[ref]
      return issue ? { id: `uuid-${ref}`, identifier: ref, ...issue } : null
    },
    async updateIssue(id, input) {
      if (failOn && id === `uuid-${failOn}`) throw new Error('Linear said no')
      writes.push({ id, input })
      return { id }
    },
  }
}

const issue = (title, stateName) => ({ title, state: { name: stateName, type: 'started' } })

function run(argv, cwd, io = {}) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env: { LINEAR_API_KEY: 'lin_api_test' },
    ...io,
  }).then((code) => ({ code, out: out.join('') }))
}

// --- the guard rails --------------------------------------------------------

test('it refuses when no ladder is declared', async () => {
  const r = repo({ stages: null })
  const got = await run(['stage', 'test'], r.dir)
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /no deployment ladder is declared/)
})

test('it refuses an undeclared stage key, listing the real ones', async () => {
  const r = repo()
  r.commit('base')
  const got = await run(['stage', 'staging'], r.dir)
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /no stage named "staging"/)
  assert.match(got.out, /Declared: test, demo, prod/)
})

// --- dry run is the default -------------------------------------------------

test('without --apply it writes nothing and says so', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')

  const linear = fakeLinear({ 'SKS-1': issue('One', 'Done') })
  const got = await run(['stage', 'test', 'v1.0.0..HEAD'], r.dir, { adapter: linear })

  assert.strictEqual(got.code, 0)
  assert.deepStrictEqual(linear.writes, [], 'nothing was written')
  assert.match(got.out, /would move 1 ticket\(s\)/)
  assert.match(got.out, /dry run — pass --apply to move them/)
  assert.match(got.out, /stage: test -> "On Test"\s+\(v1\.0\.0\.\.HEAD\)/)
})

test('--apply moves the ticket to the rung state', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')

  const linear = fakeLinear({ 'SKS-1': issue('One', 'Done') })
  const got = await run(['stage', 'test', 'v1.0.0..HEAD', '--apply'], r.dir, { adapter: linear })

  assert.strictEqual(got.code, 0)
  assert.deepStrictEqual(linear.writes, [{ id: 'uuid-SKS-1', input: { stateId: 'st-test' } }])
  assert.match(got.out, /moved 1 ticket\(s\)/)
})

// --- what it refuses to touch, and why --------------------------------------

test('it skips another team\'s ref, an unclaimed ref, and an unfinished spec', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete', 'SKS-3': 'in-progress' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: mine\n\nRefs: SKS-1')
  r.commit('feat: theirs\n\nRefs: ABC-2')
  r.commit('feat: mid-flight\n\nRefs: SKS-3')
  r.commit('feat: unknown\n\nRefs: SKS-9')

  const linear = fakeLinear({ 'SKS-1': issue('One', 'Done') })
  const got = await run(['stage', 'test', 'v1.0.0..HEAD', '--apply'], r.dir, { adapter: linear })

  assert.strictEqual(got.code, 0)
  assert.deepStrictEqual(linear.writes.map((w) => w.id), ['uuid-SKS-1'], 'only the finished, claimed, own-team ref moved')
  assert.match(got.out, /skipped 1 — not team SKS: ABC-2/)
  assert.match(got.out, /skipped 1 — no spec in this repo claims it: SKS-9/)
  assert.match(got.out, /skipped 1 — spec not complete — push still owns its state: SKS-3 \(in-progress\)/)
})

// The STAYS-SILENT case: a range with nothing movable must exit 0 and explain,
// not fail and not quietly claim success.
test('a range with nothing movable exits 0 and says why', async () => {
  const r = repo({ specs: { 'SKS-3': 'in-progress' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: mid-flight\n\nRefs: SKS-3')
  r.commit('chore: no ref at all')

  const linear = fakeLinear({})
  const got = await run(['stage', 'test', 'v1.0.0..HEAD', '--apply'], r.dir, { adapter: linear })

  assert.strictEqual(got.code, 0)
  assert.deepStrictEqual(linear.writes, [])
  assert.match(got.out, /moved nothing/)
  assert.match(got.out, /spec not complete/)
  assert.match(got.out, /1 commit\(s\) carry no ref, of 2/)
})

test('an empty range moves nothing and still reports the ref count', async () => {
  const r = repo()
  r.commit('chore: base')
  r.tag('v1.0.0')

  const got = await run(['stage', 'test', 'v1.0.0..HEAD'], r.dir, { adapter: fakeLinear({}) })
  assert.strictEqual(got.code, 0)
  assert.match(got.out, /would move nothing/)
  assert.match(got.out, /0 commit\(s\) carry no ref, of 0/)
})

// --- order: warn, never refuse ----------------------------------------------

test('a backwards move warns and still proceeds', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')

  const linear = fakeLinear({ 'SKS-1': issue('One', 'Ready for Demo') })
  const got = await run(['stage', 'test', 'v1.0.0..HEAD', '--apply'], r.dir, { adapter: linear })

  assert.strictEqual(got.code, 0, 'a rollback is legitimate')
  assert.strictEqual(linear.writes.length, 1, 'and it still happens')
  assert.match(got.out, /warning: moves back from "demo"/)
})

test('a skipping move warns and still proceeds', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')

  const linear = fakeLinear({ 'SKS-1': issue('One', 'On Test') })
  const got = await run(['stage', 'prod', 'v1.0.0..HEAD', '--apply'], r.dir, { adapter: linear })

  assert.strictEqual(got.code, 0)
  assert.match(got.out, /warning: skips 1 rung\(s\) from "test"/)
})

test('entering the ladder from a lifecycle state warns about nothing', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')

  const got = await run(['stage', 'test', 'v1.0.0..HEAD'], r.dir, {
    adapter: fakeLinear({ 'SKS-1': issue('One', 'Done') }),
  })
  assert.ok(!/warning:/.test(got.out))
})

// --- failure modes ----------------------------------------------------------

test('a rung the workspace lacks refuses before any write', async () => {
  const r = repo({ stages: [{ key: 'test', state: 'Nowhere' }], specs: { 'SKS-1': 'complete' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')

  const linear = fakeLinear({ 'SKS-1': issue('One', 'Done') })
  const got = await run(['stage', 'test', 'v1.0.0..HEAD', '--apply'], r.dir, { adapter: linear })

  assert.strictEqual(got.code, 1)
  assert.deepStrictEqual(linear.writes, [], 'nothing moved')
  assert.match(got.out, /no issue state named "Nowhere"/)
  assert.match(got.out, /silently ignores/)
})

test('a ref Linear cannot read is skipped, not guessed at', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete', 'SKS-2': 'complete' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')
  r.commit('feat: two\n\nRefs: SKS-2')

  const linear = fakeLinear({ 'SKS-1': issue('One', 'Done') })
  const got = await run(['stage', 'test', 'v1.0.0..HEAD', '--apply'], r.dir, { adapter: linear })

  assert.strictEqual(got.code, 0)
  assert.deepStrictEqual(linear.writes.map((w) => w.id), ['uuid-SKS-1'])
  assert.match(got.out, /skipped 1 — could not be read from Linear: SKS-2/)
})

test('a failed write is reported and exits non-zero, so a pipeline stage fails', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')

  const linear = fakeLinear({ 'SKS-1': issue('One', 'Done') }, { failOn: 'SKS-1' })
  const got = await run(['stage', 'test', 'v1.0.0..HEAD', '--apply'], r.dir, { adapter: linear })

  assert.strictEqual(got.code, 1)
  assert.match(got.out, /FAILED SKS-1: Linear said no/)
})

test('--apply over mcp refuses rather than pretending', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')

  const got = await run(['stage', 'test', 'v1.0.0..HEAD', '--apply', '--via', 'mcp'], r.dir)
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /refusing to apply over mcp/)
})

test('--json carries the plan, the skips and the counts', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete', 'SKS-3': 'in-progress' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')
  r.commit('feat: theirs\n\nRefs: ABC-2')
  r.commit('feat: mid\n\nRefs: SKS-3')

  const got = await run(['stage', 'test', 'v1.0.0..HEAD', '--json'], r.dir, {
    adapter: fakeLinear({ 'SKS-1': issue('One', 'Done') }),
  })
  const json = JSON.parse(got.out)
  assert.strictEqual(json.applied, false)
  assert.deepStrictEqual(json.stage, { key: 'test', state: 'On Test' })
  assert.deepStrictEqual(json.moves.map((m) => m.ref), ['SKS-1'])
  assert.deepStrictEqual(json.moved, [])
  assert.deepStrictEqual(json.skipped.foreign, ['ABC-2'])
  assert.deepStrictEqual(json.skipped.unfinished, [{ ref: 'SKS-3', bucket: 'in-progress' }])
  assert.strictEqual(json.totalCommits, 3)
})

// The collision that made this rule necessary: `states.complete` and a final
// `prod` rung are both naturally "Done". Without lifecycle-wins, a spec that had
// only just been completed read as already deployed to prod, so its FIRST real
// deploy was warned about as a move backwards.
test('a completed spec on the shared "Done" name is not read as already at prod', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')

  const got = await run(['stage', 'test', 'v1.0.0..HEAD'], r.dir, {
    adapter: fakeLinear({ 'SKS-1': issue('One', 'Done') }),
  })
  assert.strictEqual(got.code, 0)
  assert.match(got.out, /would move 1 ticket/)
  assert.ok(!/moves back/.test(got.out), 'the lifecycle state is a position, not a rung')
})

test('a genuine rung name still drives the order check', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete' } })
  r.commit('chore: base')
  r.tag('v1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')

  const got = await run(['stage', 'test', 'v1.0.0..HEAD'], r.dir, {
    adapter: fakeLinear({ 'SKS-1': issue('One', 'Ready for Demo') }),
  })
  assert.match(got.out, /moves back from "demo"/)
})
