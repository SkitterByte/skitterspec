'use strict'

// A state-map change in the config must reach work items that were already
// pushed — child Tasks only, state only — and no resend may drag an item back
// out of a state the host's own CI moved it to (Resolved → On Test → On Prod).

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const ORG = 'https://dev.azure.com/acme'
const PROJECT = 'web'

function completedSpecRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-remap-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  writeConfig(dir, {})
  const spec = path.join(dir, 'specs', 'complete', 'feat-demo')
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(path.join(spec, '00-overview.md'), '# Demo\n\n## Problem\n\nBody prose.\n')
  fs.writeFileSync(path.join(spec, '01-outbox.md'), '# Phase 1 — Outbox ✅\n\n**Goal:** a durable place.\n')
  return dir
}

// The repo owns the parent's state here, as in the host project that hit this:
// under the default `pull` a resend never sends the parent's state at all.
function writeConfig(dir, extra) {
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({
      azure: { orgUrl: ORG, project: PROJECT },
      sync: { fieldOwnership: { workflowState: 'push' } },
      ...extra,
    }),
  )
}

class Sink {
  constructor() {
    this.text = ''
  }
  write(s) {
    this.text += s
  }
}

async function run(args, dir, adapter) {
  const out = new Sink()
  const err = new Sink()
  const code = await specSync(args, { cwd: dir, out, err, adapter, env: {} })
  return { code, out: out.text, err: err.text }
}

function fakeAdapter() {
  const calls = []
  let n = 100
  const items = new Map()
  const make = (title, description, type) => {
    const id = String(++n)
    const item = {
      id,
      identifier: `AB#${id}`,
      url: `${ORG}/${PROJECT}/_workitems/edit/${id}`,
      title,
      description: description ?? null,
      state: { name: 'To Do' },
      type,
    }
    items.set(id, item)
    return { id, identifier: item.identifier, url: item.url }
  }
  return {
    calls,
    items,
    async readIssue(id) {
      const key = String(id).replace(/^AB#/, '')
      calls.push(['readIssue', key])
      return items.get(key) || null
    },
    async createIssue({ title, description }) {
      calls.push(['createIssue', title])
      return make(title, description, 'Issue')
    },
    async createSubIssue(parentId, { title, description }) {
      calls.push(['createSubIssue', parentId, title])
      return make(title, description, 'Task')
    },
    async updateIssue(id, updates) {
      calls.push(['updateIssue', String(id), updates])
      const item = items.get(String(id))
      if (item && updates.description !== undefined) item.description = updates.description
      return {}
    },
    async transitionTo(id, target) {
      calls.push(['transitionTo', String(id), target])
      const item = items.get(String(id))
      if (item) item.state = { name: target }
      return { moved: true }
    },
    async searchIssues() {
      return []
    },
  }
}

async function planAndApply(dir, adapter) {
  const plan = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  assert.strictEqual(plan.code, 0, plan.out + plan.err)
  const planFile = path.join(dir, 'plan.json')
  fs.writeFileSync(planFile, plan.out)
  const applied = await run(['apply', 'feat-demo', '--plan', planFile], dir, adapter)
  assert.strictEqual(applied.code, 0, applied.out)
  return { plan: JSON.parse(plan.out), applied }
}

const PARENT = '101'
const CHILD = '102'

test('a state-map change is planned as a state-only update of the child, never the parent', async () => {
  const dir = completedSpecRepo()
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)
  assert.strictEqual(adapter.items.get(CHILD).state.name, 'Done')

  writeConfig(dir, { statesByType: { Task: { complete: 'Closed' } } })
  adapter.calls.length = 0
  const { plan, applied } = await planAndApply(dir, adapter)

  assert.strictEqual(plan.issue, undefined, 'the parent bucket maps to the same state — nothing to send')
  assert.strictEqual(plan.subIssues.update.length, 1, JSON.stringify(plan))
  assert.strictEqual(adapter.items.get(CHILD).state.name, 'Closed', applied.out)
  // State only: the child's title and body are not rewritten by a remap.
  assert.ok(!adapter.calls.some(([op, id]) => op === 'updateIssue' && id === CHILD), JSON.stringify(adapter.calls))
  assert.ok(!adapter.calls.some(([op, id]) => op === 'transitionTo' && id === PARENT))

  // Closed loop: the remap is recorded, so the next plan is empty.
  const again = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  const p3 = JSON.parse(again.out)
  assert.strictEqual(p3.subIssues.update.length, 0)
  assert.strictEqual(p3.issue, undefined)
})

test('a full resend leaves a parent the host moved past complete where it is, and names it', async () => {
  const dir = completedSpecRepo()
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)

  // The host's release CI moved the parent on; then the snapshot was lost.
  adapter.items.get(PARENT).state = { name: 'On Prod' }
  fs.rmSync(path.join(dir, 'specs', '.core', 'azure-base'), { recursive: true, force: true })
  adapter.calls.length = 0

  const { applied } = await planAndApply(dir, adapter)
  assert.strictEqual(adapter.items.get(PARENT).state.name, 'On Prod', applied.out)
  assert.ok(!adapter.calls.some(([op, id]) => op === 'transitionTo' && id === PARENT))
  assert.match(applied.out, /AB#101.*On Prod/)
})

test('a full resend still moves a parent that is behind its bucket', async () => {
  const dir = completedSpecRepo()
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)

  adapter.items.get(PARENT).state = { name: 'Doing' }
  fs.rmSync(path.join(dir, 'specs', '.core', 'azure-base'), { recursive: true, force: true })

  await planAndApply(dir, adapter)
  assert.strictEqual(adapter.items.get(PARENT).state.name, 'Done')
})

test('STAYS SILENT: a snapshot that never recorded state names plans nothing on a remap', async () => {
  const dir = completedSpecRepo()
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)

  // A snapshot written before state names were recorded: cannot tell what was
  // sent, so a config change must not turn into a workspace-wide resend.
  const baseDir = path.join(dir, 'specs', '.core', 'azure-base')
  for (const file of fs.readdirSync(baseDir)) {
    const p = path.join(baseDir, file)
    const snap = JSON.parse(fs.readFileSync(p, 'utf-8'))
    delete snap.stateNames
    fs.writeFileSync(p, JSON.stringify(snap))
  }
  writeConfig(dir, { statesByType: { Task: { complete: 'Closed' } } })

  const plan = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  const p = JSON.parse(plan.out)
  assert.strictEqual(p.subIssues.update.length, 0)
  assert.strictEqual(p.issue, undefined)
})

test('STAYS SILENT: a genuine bucket move is sent as before, even backwards', async () => {
  const dir = completedSpecRepo()
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)

  // Reopened: the spec itself moved, which is the repo's transition to send.
  fs.renameSync(path.join(dir, 'specs', 'complete'), path.join(dir, 'specs', 'in-progress'))
  await planAndApply(dir, adapter)
  assert.strictEqual(adapter.items.get(PARENT).state.name, 'Doing')
})

test('a full resend leaves a child the host moved on where it is', async () => {
  const dir = completedSpecRepo()
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)

  adapter.items.get(CHILD).state = { name: 'On Prod' }
  fs.rmSync(path.join(dir, 'specs', '.core', 'azure-base'), { recursive: true, force: true })

  const { applied } = await planAndApply(dir, adapter)
  assert.strictEqual(adapter.items.get(CHILD).state.name, 'On Prod')
  assert.match(applied.out, /state kept: AB#102 at "On Prod"/)
})

test('the host project shape: Tasks move Resolved → Closed, the parent stays put', async () => {
  const dir = completedSpecRepo()
  writeConfig(dir, { states: { complete: 'Resolved' } })
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)
  assert.strictEqual(adapter.items.get(CHILD).state.name, 'Resolved')
  adapter.items.get(PARENT).state = { name: 'On Prod' }

  writeConfig(dir, { states: { complete: 'Resolved' }, statesByType: { Task: { complete: 'Closed' } } })
  await planAndApply(dir, adapter)
  assert.strictEqual(adapter.items.get(CHILD).state.name, 'Closed')
  assert.strictEqual(adapter.items.get(PARENT).state.name, 'On Prod')
})

test('a remap of the parent bucket resends its state, guarded', async () => {
  const dir = completedSpecRepo()
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)

  writeConfig(dir, { states: { complete: 'Closed' } })
  const { plan } = await planAndApply(dir, adapter)
  assert.deepStrictEqual(plan.issue, { state: 'complete', stateResend: 'remap' })
  assert.strictEqual(adapter.items.get(PARENT).state.name, 'Closed')
})

test('STAYS SILENT: under pull, a remap never re-asserts the parent state', async () => {
  const dir = completedSpecRepo()
  const pull = { sync: { fieldOwnership: { workflowState: 'pull' } } }
  writeConfig(dir, pull)
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)

  writeConfig(dir, { ...pull, states: { complete: 'Closed' } })
  const plan = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  assert.strictEqual(JSON.parse(plan.out).issue, undefined)
})

// --- restate: items pushed before the snapshot recorded names ----------------

// The host project's history: pushed under complete → Resolved by a version
// that recorded no names, then the Task map changed and CI moved the parent on.
async function legacyHostRepo() {
  const dir = completedSpecRepo()
  writeConfig(dir, { states: { complete: 'Resolved' } })
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)
  const baseDir = path.join(dir, 'specs', '.core', 'azure-base')
  for (const file of fs.readdirSync(baseDir)) {
    const p = path.join(baseDir, file)
    const snap = JSON.parse(fs.readFileSync(p, 'utf-8'))
    delete snap.stateNames
    fs.writeFileSync(p, JSON.stringify(snap))
  }
  adapter.items.get(PARENT).state = { name: 'On Prod' }
  writeConfig(dir, { states: { complete: 'Resolved' }, statesByType: { Task: { complete: 'Closed' } } })
  adapter.calls.length = 0
  return { dir, adapter }
}

const snapshotOfDemo = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'specs', '.core', 'azure-base', 'AB#101.base.json'), 'utf-8'))

test('restate is a dry run by default: it reads, names the move, and writes nothing', async () => {
  const { dir, adapter } = await legacyHostRepo()
  const before = snapshotOfDemo(dir)
  const r = await run(['restate', 'feat-demo'], dir, adapter)
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /AB#102 "Resolved" → "Closed" \(dry run\)/)
  assert.match(r.out, /1 would move/)
  assert.ok(!adapter.calls.some(([op]) => op === 'transitionTo' || op === 'updateIssue'))
  assert.deepStrictEqual(snapshotOfDemo(dir), before)
})

test('restate --apply moves the Tasks, leaves the parent, and records the names', async () => {
  const { dir, adapter } = await legacyHostRepo()
  const r = await run(['restate', 'feat-demo', '--apply'], dir, adapter)
  assert.strictEqual(r.code, 0, r.out)
  assert.strictEqual(adapter.items.get(CHILD).state.name, 'Closed')
  assert.strictEqual(adapter.items.get(PARENT).state.name, 'On Prod')
  assert.ok(!adapter.calls.some(([op, id]) => id === PARENT && op !== 'readIssue'))
  assert.deepStrictEqual(snapshotOfDemo(dir).stateNames, { subIssues: { 'AB#102': 'Closed' } })

  // Recorded, so the next state-map change is plain `plan` work again.
  writeConfig(dir, { states: { complete: 'Resolved' }, statesByType: { Task: { complete: 'Done' } } })
  const plan = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  assert.strictEqual(JSON.parse(plan.out).subIssues.update.length, 1)
})

test('restate --parents still leaves a parent in a state the host moved it to, and names it', async () => {
  const { dir, adapter } = await legacyHostRepo()
  const r = await run(['restate', 'feat-demo', '--parents', '--apply'], dir, adapter)
  assert.strictEqual(adapter.items.get(PARENT).state.name, 'On Prod')
  assert.match(r.out, /state kept: AB#101 at "On Prod"/)
})

test('restate --parents moves a parent that is behind its bucket', async () => {
  const { dir, adapter } = await legacyHostRepo()
  adapter.items.get(PARENT).state = { name: 'Doing' }
  await run(['restate', 'feat-demo', '--parents', '--apply'], dir, adapter)
  assert.strictEqual(adapter.items.get(PARENT).state.name, 'Resolved')
  assert.strictEqual(snapshotOfDemo(dir).stateNames.issue, 'Resolved')
})

test('restate --all <bucket> walks every spec in the bucket', async () => {
  const { dir, adapter } = await legacyHostRepo()
  const r = await run(['restate', '--all', 'complete', '--apply'], dir, adapter)
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /restate: feat-demo \(AB#101\)/)
  assert.strictEqual(adapter.items.get(CHILD).state.name, 'Closed')
})

test('STAYS SILENT: a child already on the target is reported, not moved', async () => {
  const { dir, adapter } = await legacyHostRepo()
  adapter.items.get(CHILD).state = { name: 'Closed' }
  const r = await run(['restate', 'feat-demo', '--apply'], dir, adapter)
  assert.match(r.out, /AB#102 already "Closed"/)
  assert.ok(!adapter.calls.some(([op]) => op === 'transitionTo'))
})

test('restate over MCP exits 0 and writes nothing', async () => {
  const { dir } = await legacyHostRepo()
  const r = await run(['restate', 'feat-demo', '--via', 'mcp'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /transport = mcp/)
})

test('restate --all refuses a name that is not a bucket', async () => {
  const { dir, adapter } = await legacyHostRepo()
  const r = await run(['restate', '--all', 'done'], dir, adapter)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /not a lifecycle bucket: done/)
})
