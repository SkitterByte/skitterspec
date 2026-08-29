'use strict'

/**
 * `spec-sync apply` — the write half, done by the engine instead of the model.
 *
 * The behaviours that matter here are the ones a bulk run depends on:
 *   - nothing is written until everything that can be checked has been;
 *   - every id is stamped the moment its object exists, so an interrupted run
 *     RESUMES rather than minting a second copy of what it already created;
 *   - the read-back runs the same comparison `spec-sync verify` runs.
 *
 * A fake adapter stands in for Linear, so the whole path is exercised offline.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const STATES = [
  { id: 's-backlog', name: 'Backlog' },
  { id: 's-progress', name: 'In Progress' },
  { id: 's-done', name: 'Done' },
  { id: 's-cancel', name: 'Canceled' },
]

function fixtureRepo(extraConfig = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-apply-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' }, ...extraConfig }), 'utf-8')

  const folder = path.join(dir, 'specs', 'in-progress', 'feat-applied')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(
    path.join(folder, '00-overview.md'),
    '# Applied\n\n## Problem\n\nThe header is `X-Extraction-Key`.\n\n## Phases\n\n' +
      '| # | Phase | Status | File |\n|---|-------|--------|------|\n' +
      '| 1 | Engine | ⬜ | [01-engine.md](01-engine.md) |\n',
    'utf-8',
  )
  fs.writeFileSync(path.join(folder, '01-engine.md'), '# Phase 1 — Engine ⬜\n\n**Goal:** go.\n', 'utf-8')
  return dir
}

const overview = (dir) => fs.readFileSync(path.join(dir, 'specs/in-progress/feat-applied/00-overview.md'), 'utf-8')
const phase = (dir) => fs.readFileSync(path.join(dir, 'specs/in-progress/feat-applied/01-engine.md'), 'utf-8')

function planFile(dir, plan) {
  const file = path.join(dir, 'plan.json')
  fs.writeFileSync(file, JSON.stringify(plan), 'utf-8')
  return file
}

/**
 * A stand-in Linear. `failOn` makes the Nth write throw, which is how the
 * interrupted-run tests are built — a real interruption is just a write that
 * never returned.
 */
function fakeLinear({ failOn = null } = {}) {
  let n = 0
  const store = new Map()
  const log = []
  let seq = 0
  const api = {
    log,
    store,
    async listIssueStates() {
      return STATES
    },
    async createIssue(input) {
      log.push({ op: 'createIssue', input })
      if (++n === failOn) throw new Error('network died mid-apply')
      seq++
      const issue = {
        id: `uuid-${seq}`,
        identifier: `SKI-${seq}`,
        url: `https://linear.app/x/SKI-${seq}`,
        title: input.title,
        description: input.description,
      }
      store.set(issue.id, issue)
      store.set(issue.identifier, issue)
      return issue
    },
    async updateIssue(id, input) {
      log.push({ op: 'updateIssue', id, input })
      if (++n === failOn) throw new Error('network died mid-apply')
      const issue = { ...(store.get(id) || { id, identifier: id }), ...input }
      store.set(id, issue)
      if (issue.identifier) store.set(issue.identifier, issue)
      return issue
    },
    async createSubIssue(parentId, input) {
      return api.createIssue({ ...input, parentId })
    },
    async readIssue(id) {
      return store.get(id) || null
    },
  }
  return api
}

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

// A full first push: mint the issue and its one sub-issue.
const CREATE_PLAN = {
  issue: { description: '# Applied\n\n## Problem\n\nThe header is `X-Extraction-Key`.', state: 'in-progress' },
  subIssues: { create: [{ ref: '01-engine', name: 'Engine', goal: '**Goal:** go.', state: 'backlog' }], update: [] },
}

// --- the happy path ----------------------------------------------------------

test('it creates the issue and its sub-issue, and stamps both', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear()
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.match(r.out, /transport = api/)
  assert.match(r.out, /issue created: SKI-1/)
  assert.match(r.out, /sub-issue created: 01-engine → SKI-2/)
  assert.match(overview(dir), /linear_identifier: "?SKI-1"?/)
  assert.match(overview(dir), /linear_url: /)
  assert.match(phase(dir), /linear_issue_id: "?SKI-2"?/)
})

test('the sub-issue is created as a child of the issue just minted', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear()
  await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: linear })
  const sub = linear.log.find((c) => c.input && c.input.parentId)
  assert.ok(sub, 'a sub-issue create carried a parentId')
  assert.strictEqual(sub.input.parentId, 'uuid-1')
})

test('local buckets are sent as Linear state ids, not names', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear()
  await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: linear })
  assert.strictEqual(linear.log[0].input.stateId, 's-progress')
  assert.strictEqual(linear.log[1].input.stateId, 's-backlog')
})

test('it runs the read-back check and reports a clean round-trip', async () => {
  const dir = fixtureRepo()
  await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: fakeLinear() }).then((r) => {
    assert.match(r.out, /round-tripped intact/)
  })
})

test('it reports lost text when the tracker stored something different', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear()
  const realCreate = linear.createIssue
  // Linear mangling the description is exactly what the read-back exists for.
  linear.createIssue = async (input) => {
    const issue = await realCreate(input)
    if (issue.identifier === 'SKI-1') {
      const damaged = { ...issue, description: String(issue.description).replace('X-Extraction-Key', 'Extraction-Key') }
      linear.store.set(issue.id, damaged)
      linear.store.set(issue.identifier, damaged)
    }
    return issue
  }
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: linear })
  assert.strictEqual(r.code, 0, 'a mangled mirror warns, it does not fail the apply')
  assert.match(r.out, /stored different text/)
})

test('it records the snapshot, so the next push is empty', async () => {
  const dir = fixtureRepo()
  await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: fakeLinear() })
  const r = await run(['push', 'feat-applied', '--skip-state-check'], dir)
  assert.match(r.out, /up to date|nothing to push|no changes/i)
})

test('--json prints the id map the skill needs', async () => {
  const dir = fixtureRepo()
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN), '--json'], dir, {
    adapter: fakeLinear(),
  })
  const got = JSON.parse(r.out)
  assert.strictEqual(got.issue.identifier, 'SKI-1')
  assert.deepEqual(got.subIssues, { '01-engine': 'SKI-2' })
})

// --- resumability: the property a bulk run depends on ------------------------

test('an interrupted run stamps what it created, then resumes without duplicating', async () => {
  const dir = fixtureRepo()
  // Fail on the SECOND write — the issue lands, the sub-issue does not.
  const first = fakeLinear({ failOn: 2 })
  const r1 = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: first })
  assert.strictEqual(r1.code, 1)
  assert.match(r1.out, /network died mid-apply/)
  assert.match(r1.out, /re-run to resume without duplicating/)
  assert.match(overview(dir), /linear_identifier: "?SKI-1"?/, 'the issue it DID create is stamped')
  assert.doesNotMatch(phase(dir), /linear_issue_id/, 'the sub-issue it never created is not')

  // Re-run against a fresh Linear that knows the already-created issue.
  const second = fakeLinear()
  second.store.set('SKI-1', { id: 'uuid-1', identifier: 'SKI-1', url: 'u', description: 'x' })
  const r2 = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: second })
  assert.strictEqual(r2.code, 0)

  const creates = second.log.filter((c) => c.op === 'createIssue')
  assert.strictEqual(creates.length, 1, 'only the missing sub-issue was created — no second spec issue')
  assert.ok(creates[0].input.parentId, 'and it was created as a child')
  assert.match(phase(dir), /linear_issue_id/, 'now stamped too')
})

// --- refusals: nothing written unless everything checks out ------------------

test('a legacy plan is refused before any write', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear()
  const plan = { ...CREATE_PLAN, legacy: { keys: ['linear_project_id'], files: ['00-overview.md'], orphanCount: 4 } }
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, plan)], dir, { adapter: linear })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /pre-9\.0/)
  assert.strictEqual(linear.log.length, 0, 'nothing was written')
  assert.doesNotMatch(overview(dir), /linear_identifier/)
})

test('a state name the workspace lacks fails before any write', async () => {
  const dir = fixtureRepo({ states: { backlog: 'Backlog', 'in-progress': 'Shipping', complete: 'Done', cancelled: 'Canceled' } })
  const linear = fakeLinear()
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: linear })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /Shipping/)
  assert.strictEqual(linear.log.length, 0, 'nothing was written')
  assert.doesNotMatch(overview(dir), /linear_identifier/)
})

test('--via api with no key fails before any write, naming the variable', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear()
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN), '--via', 'api'], dir, {
    adapter: linear,
    env: {},
  })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /LINEAR_API_KEY/)
  assert.strictEqual(linear.log.length, 0)
})

test('it refuses without --plan rather than doing nothing quietly', async () => {
  const dir = fixtureRepo()
  const r = await run(['apply', 'feat-applied'], dir, { adapter: fakeLinear() })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /--plan/)
  assert.match(r.out, /spec-sync push/, 'says how to get one')
})

test('an unreadable plan file fails clearly', async () => {
  const dir = fixtureRepo()
  const file = path.join(dir, 'bad.json')
  fs.writeFileSync(file, '{ not json', 'utf-8')
  const r = await run(['apply', 'feat-applied', '--plan', file], dir, { adapter: fakeLinear() })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /cannot read --plan/)
})

// --- the MCP fallback --------------------------------------------------------

test('no key falls back to MCP: no writes, and it says what to run', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear()
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: linear, env: {} })
  assert.strictEqual(r.code, 0, 'no key is a normal state, not a failure')
  assert.match(r.out, /transport = mcp/)
  assert.match(r.out, /LINEAR_API_KEY/)
  assert.match(r.out, /spec-sync stamp/)
  assert.strictEqual(linear.log.length, 0, 'nothing was written')
})

test('--via mcp forces the fallback even with a key present', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear()
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN), '--via', 'mcp'], dir, {
    adapter: linear,
  })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /transport = mcp/)
  assert.match(r.out, /--via mcp was requested/)
  assert.strictEqual(linear.log.length, 0)
})

test('apply.transport in config sets the default', async () => {
  const dir = fixtureRepo({ apply: { transport: 'mcp' } })
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, CREATE_PLAN)], dir, { adapter: fakeLinear() })
  assert.match(r.out, /transport = mcp/)
})

test('an empty plan is a clean no-op', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear()
  const r = await run(['apply', 'feat-applied', '--plan', planFile(dir, { subIssues: { create: [], update: [] } })], dir, {
    adapter: linear,
  })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /up to date/)
  assert.strictEqual(linear.log.length, 0)
})

// --- `spec-sync states`: the transport decision, asked before anything else ---

test('with a key it reports the api transport and the workspace state names', async () => {
  const dir = fixtureRepo()
  const r = await run(['states'], dir, { adapter: fakeLinear() })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /transport = api/)
  assert.match(r.out, /Backlog, In Progress, Done, Canceled/)
})

test('--json prints the bare array --workspace-states takes', async () => {
  const dir = fixtureRepo()
  const r = await run(['states', '--json'], dir, { adapter: fakeLinear() })
  // Piped straight into `push --workspace-states`, so the shape must match what
  // that flag parses — an array of names, nothing wrapping it.
  assert.deepEqual(JSON.parse(r.out), ['Backlog', 'In Progress', 'Done', 'Canceled'])
})

test('without a key it reports mcp and tells the skill to fetch them itself', async () => {
  const dir = fixtureRepo()
  const r = await run(['states'], dir, { adapter: fakeLinear(), env: {} })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /transport = mcp/)
  assert.match(r.out, /LINEAR_API_KEY/)
  assert.match(r.out, /over MCP/)
})

test('the mcp --json shape is branchable, and carries no states', async () => {
  const dir = fixtureRepo()
  const r = await run(['states', '--json'], dir, { adapter: fakeLinear(), env: {} })
  const got = JSON.parse(r.out)
  assert.strictEqual(got.transport, 'mcp')
  assert.strictEqual(got.states, null, 'null, not [] — an empty array would read as "no states exist"')
})

test('a states fetch that fails reports the reason rather than an empty list', async () => {
  const dir = fixtureRepo()
  const broken = { ...fakeLinear(), async listIssueStates() { throw new Error('Linear API unreachable: ECONNREFUSED') } }
  const r = await run(['states'], dir, { adapter: broken })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /unreachable/)
})
