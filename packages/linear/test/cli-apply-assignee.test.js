'use strict'

/**
 * `spec-sync apply` sending the assignee — the wire half of the feature.
 *
 * The trap this file exists for: every other field on an issue update goes
 * through `withoutNull`, which strips nulls so an unset field is simply not
 * sent. `assigneeId` is the one field where **null is the payload** — it is how
 * Linear unassigns — so passing it through that stripper would silently drop
 * exactly the clear that finishing a spec depends on, and the mirror would keep
 * a completed spec assigned forever. Nothing about that failure is visible: the
 * push succeeds, the plan looked right, and only Linear disagrees.
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

// `linked` stamps an identifier so the apply takes the UPDATE branch, which is
// the only one where a clear is possible.
function fixtureRepo({ linked = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-assignee-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(
    cfg,
    JSON.stringify({
      linear: { teamId: 'T1' },
      sync: { fieldOwnership: { description: 'push', subIssues: 'push', workflowState: 'push', assignee: 'push' } },
    }),
    'utf-8',
  )

  const folder = path.join(dir, 'specs', 'in-progress', 'feat-assigned')
  fs.mkdirSync(folder, { recursive: true })
  const fm = linked ? '---\nlinear_identifier: "SKI-1"\n---\n\n' : ''
  fs.writeFileSync(path.join(folder, '00-overview.md'), `${fm}# Assigned\n\n## Problem\n\nProse.\n`, 'utf-8')
  fs.writeFileSync(path.join(folder, '01-engine.md'), '# Phase 1 — Engine ⬜\n\n**Goal:** go.\n', 'utf-8')
  return dir
}

function planFile(dir, plan) {
  const file = path.join(dir, 'plan.json')
  fs.writeFileSync(file, JSON.stringify(plan), 'utf-8')
  return file
}

function fakeLinear() {
  const log = []
  const store = new Map()
  const existing = { id: 'uuid-1', identifier: 'SKI-1', url: 'https://linear.app/x/SKI-1', description: 'old' }
  store.set('SKI-1', existing)
  store.set('uuid-1', existing)
  let seq = 1
  const api = {
    log,
    async listIssueStates() {
      return STATES
    },
    async createIssue(input) {
      log.push({ op: 'createIssue', input })
      seq++
      const issue = { id: `uuid-${seq}`, identifier: `SKI-${seq}`, url: 'u', description: input.description }
      store.set(issue.id, issue)
      store.set(issue.identifier, issue)
      return issue
    },
    async updateIssue(id, input) {
      log.push({ op: 'updateIssue', id, input })
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

function run(argv, cwd, adapter) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env: { LINEAR_API_KEY: 'lin_api_test' },
    adapter,
  }).then((code) => ({ code, out: out.join('') }))
}

const updateOf = (adapter) => adapter.log.find((c) => c.op === 'updateIssue')
const createOf = (adapter) => adapter.log.find((c) => c.op === 'createIssue')

// --- assigning ---------------------------------------------------------------

test('an assignee in the plan reaches Linear as assigneeId', async () => {
  const dir = fixtureRepo({ linked: true })
  const adapter = fakeLinear()
  const plan = planFile(dir, { issue: { assignee: 'user-1' }, subIssues: { create: [], update: [] } })
  const r = await run(['apply', 'feat-assigned', '--plan', plan, '--dir', dir], dir, adapter)
  assert.equal(r.code, 0)
  assert.equal(updateOf(adapter).input.assigneeId, 'user-1')
})

test('a minted issue carries its assignee', async () => {
  const dir = fixtureRepo()
  const adapter = fakeLinear()
  const plan = planFile(dir, {
    issue: { description: '# Assigned', state: 'in-progress', assignee: 'user-1' },
    subIssues: { create: [], update: [] },
  })
  await run(['apply', 'feat-assigned', '--plan', plan, '--dir', dir], dir, adapter)
  assert.equal(createOf(adapter).input.assigneeId, 'user-1')
})

// --- THE CLEAR ---------------------------------------------------------------

test('a null assignee survives withoutNull and reaches Linear as the clear', async () => {
  const dir = fixtureRepo({ linked: true })
  const adapter = fakeLinear()
  const plan = planFile(dir, { issue: { assignee: null }, subIssues: { create: [], update: [] } })
  const r = await run(['apply', 'feat-assigned', '--plan', plan, '--dir', dir], dir, adapter)
  assert.equal(r.code, 0)
  const sent = updateOf(adapter).input
  assert.ok('assigneeId' in sent, 'the clear must not be stripped as an empty field')
  assert.strictEqual(sent.assigneeId, null)
})

test('a clear rides alongside the state change that caused it', async () => {
  // What /spec-complete actually produces: the bucket moved to complete, which
  // is what drove the projection's assignee to null in the first place.
  const dir = fixtureRepo({ linked: true })
  const adapter = fakeLinear()
  const plan = planFile(dir, { issue: { state: 'complete', assignee: null }, subIssues: { create: [], update: [] } })
  await run(['apply', 'feat-assigned', '--plan', plan, '--dir', dir], dir, adapter)
  const sent = updateOf(adapter).input
  assert.strictEqual(sent.assigneeId, null)
  assert.strictEqual(sent.stateId, 's-done')
})

// --- stays silent ------------------------------------------------------------

test('a plan with no assignee key sends no assigneeId at all', async () => {
  // The whole point of decision 6: a spec that never recorded an assignee must
  // not touch the field, or a PM's triage is wiped on the next unrelated push.
  const dir = fixtureRepo({ linked: true })
  const adapter = fakeLinear()
  const plan = planFile(dir, { issue: { description: 'new prose' }, subIssues: { create: [], update: [] } })
  await run(['apply', 'feat-assigned', '--plan', plan, '--dir', dir], dir, adapter)
  const sent = updateOf(adapter).input
  assert.ok(!('assigneeId' in sent), 'silence, not a null')
})

test('a mint with no assignee sends no assigneeId', async () => {
  const dir = fixtureRepo()
  const adapter = fakeLinear()
  const plan = planFile(dir, {
    issue: { description: '# Assigned', state: 'in-progress' },
    subIssues: { create: [], update: [] },
  })
  await run(['apply', 'feat-assigned', '--plan', plan, '--dir', dir], dir, adapter)
  assert.ok(!('assigneeId' in createOf(adapter).input))
})

test('sub-issues are never assigned', async () => {
  // Decision 10: one person builds a spec, and N assigned sub-issues is N
  // notifications for one piece of work.
  const dir = fixtureRepo({ linked: true })
  const adapter = fakeLinear()
  const plan = planFile(dir, {
    issue: { assignee: 'user-1' },
    subIssues: { create: [{ ref: '01-engine', name: 'Engine', goal: 'g', state: 'backlog' }], update: [] },
  })
  await run(['apply', 'feat-assigned', '--plan', plan, '--dir', dir], dir, adapter)
  for (const call of adapter.log.filter((c) => c.input && c.input.parentId)) {
    assert.ok(!('assigneeId' in call.input), 'a phase sub-issue carries no assignee')
  }
})
