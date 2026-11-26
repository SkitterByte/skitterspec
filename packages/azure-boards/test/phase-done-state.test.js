'use strict'

// bug-azure-phase-done-state (the root cause, found on the no-token path):
// the /spec-push skill told the agent to map a planned bucket "via
// config.states", which skips statesByType — so a Task done while its spec is
// in-progress was written the parent's Resolved. The plan now carries the
// resolved name per item (`stateName`), the one the API apply writes.
//
// The engine's own apply was never wrong, and the first tests below pin that: a phase Task pushed as done while its spec is
// still in-progress must take statesByType[childType].complete ("Closed"), not
// the parent's states.complete ("Resolved"). Reported from ereqs (AB#669):
// Boards held Resolved and the snapshot recorded
// stateNames.subIssues["AB#669"]: "Resolved", until `restate` moved it.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const ORG = 'https://dev.azure.com/acme'
const PROJECT = 'web'
const SPEC = 'feat-heartbeat'

// The ereqs shape: User Story parent, Task children, Resolved for the parent's
// complete and Closed for a Task's.
const EREQS = {
  azure: { orgUrl: ORG, project: PROJECT, workItemType: 'User Story', childType: 'Task' },
  states: { backlog: 'New', 'in-progress': 'Active', complete: 'Resolved', cancelled: 'Removed' },
  statesByType: { Task: { complete: 'Closed' } },
}

function overview(phase2) {
  return (
    '# Heartbeat\n\n## Problem\n\nBody prose.\n\n## Phases\n\n' +
    '| # | Phase | Status | File |\n|---|-------|--------|------|\n' +
    '| 1 | Emit | ✅ | [01-emit.md](01-emit.md) |\n' +
    `| 2 | Verify | ${phase2} | [02-verify.md](02-verify.md) |\n` +
    '| 3 | Alert | ⬜ | [03-alert.md](03-alert.md) |\n'
  )
}

// Phase 2 done, in the file heading and the overview index alike — edited in
// place, so the ids the first push stamped into the frontmatter survive.
function finishPhase2(spec) {
  const flip = (file, from, to) => {
    const p = path.join(spec, file)
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(from, to))
  }
  flip('02-verify.md', 'Verify 🔄', 'Verify ✅')
  flip('00-overview.md', '| 2 | Verify | 🔄 |', '| 2 | Verify | ✅ |')
}

function repo(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-phase-done-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify(config))
  const spec = path.join(dir, 'specs', 'in-progress', SPEC)
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(path.join(spec, '00-overview.md'), overview('🔄'))
  fs.writeFileSync(path.join(spec, '01-emit.md'), '# Phase 1 — Emit ✅\n\n**Goal:** emit a beat.\n')
  fs.writeFileSync(path.join(spec, '02-verify.md'), '# Phase 2 — Verify 🔄\n\n**Goal:** verify the beat.\n')
  fs.writeFileSync(path.join(spec, '03-alert.md'), '# Phase 3 — Alert ⬜\n\n**Goal:** alert on silence.\n')
  return { dir, spec }
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

// A Boards-like fake: each item has a type, and a Task refuses a state its
// process does not have, as the Agile Task does with Resolved.
function fakeAdapter() {
  let n = 100
  const items = new Map()
  const TASK_STATES = ['New', 'Active', 'Closed', 'Removed']
  const make = (title, description, type) => {
    const id = String(++n)
    items.set(id, { id, identifier: `AB#${id}`, url: `${ORG}/${PROJECT}/_workitems/edit/${id}`, title, description: description ?? null, state: { name: 'New' }, type })
    return { id, identifier: `AB#${id}`, url: `${ORG}/${PROJECT}/_workitems/edit/${id}` }
  }
  return {
    items,
    writes: [],
    async readIssue(id) {
      return items.get(String(id).replace(/^AB#/, '')) || null
    },
    async createIssue({ title, description, workItemType }) {
      return make(title, description, workItemType || 'User Story')
    },
    async createSubIssue(parentId, { title, description, childType }) {
      return make(title, description, childType || 'Task')
    },
    async updateIssue(id, updates) {
      const item = items.get(String(id))
      if (item && updates.description !== undefined) item.description = updates.description
      return {}
    },
    async transitionTo(id, target) {
      const item = items.get(String(id))
      this.writes.push([String(id), target, item && item.type])
      if (item && item.type === 'Task' && !TASK_STATES.includes(target)) {
        throw new Error(`TF401320: Rule Error for field State. Error code: Required, InvalidListValue — "${target}" is not a Task state`)
      }
      if (item) item.state = { name: target }
      return { moved: true }
    },
    async searchIssues() {
      return []
    },
  }
}

async function planAndApply(dir, adapter) {
  const plan = await run(['plan', SPEC, '--skip-state-check', '--json'], dir)
  assert.strictEqual(plan.code, 0, plan.out + plan.err)
  const planFile = path.join(dir, `plan-${Date.now()}-${Math.random()}.json`)
  fs.writeFileSync(planFile, plan.out)
  const applied = await run(['apply', SPEC, '--plan', planFile], dir, adapter)
  return { plan: JSON.parse(plan.out), applied }
}

function snapshot(dir) {
  const base = path.join(dir, 'specs', '.core', 'azure-base')
  const file = fs.readdirSync(base).find((f) => f.endsWith('.base.json'))
  return JSON.parse(fs.readFileSync(path.join(base, file), 'utf8'))
}

function childFor(adapter, title) {
  return [...adapter.items.values()].find((i) => i.type === 'Task' && i.title.includes(title))
}

test('a phase flipped to ✅ while the spec is in-progress writes the Task its Closed state', async () => {
  const { dir, spec } = repo(EREQS)
  const adapter = fakeAdapter()
  const first = await planAndApply(dir, adapter)
  assert.strictEqual(first.applied.code, 0, first.applied.out)
  assert.strictEqual(childFor(adapter, 'Emit').state.name, 'Closed', 'phase 1, done at link time, is Closed')

  finishPhase2(spec)
  const second = await planAndApply(dir, adapter)
  assert.strictEqual(second.applied.code, 0, second.applied.out + second.applied.err)

  const verify = childFor(adapter, 'Verify')
  assert.strictEqual(verify.state.name, 'Closed', `phase 2 Task state — ${second.applied.out}`)
  assert.strictEqual(snapshot(dir).stateNames.subIssues[verify.identifier], 'Closed', JSON.stringify(snapshot(dir).stateNames))
})

test('after that push, restate finds nothing to move', async () => {
  const { dir, spec } = repo(EREQS)
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)
  finishPhase2(spec)
  await planAndApply(dir, adapter)

  const restate = await run(['restate', SPEC], dir, adapter)
  assert.strictEqual(restate.code, 0, restate.out + restate.err)
  assert.doesNotMatch(restate.out, /→/, restate.out)
})

// Stays silent: with no statesByType a Task takes the shared map, exactly as
// before — the fix must not invent an override.
test('with no statesByType, a done phase still takes states.complete', async () => {
  const config = { azure: { ...EREQS.azure }, states: { ...EREQS.states, complete: 'Closed' } }
  const { dir, spec } = repo(config)
  const adapter = fakeAdapter()
  await planAndApply(dir, adapter)
  finishPhase2(spec)
  const second = await planAndApply(dir, adapter)
  assert.strictEqual(second.applied.code, 0, second.applied.out)
  const verify = childFor(adapter, 'Verify')
  assert.strictEqual(verify.state.name, 'Closed')
  assert.strictEqual(snapshot(dir).stateNames.subIssues[verify.identifier], 'Closed')
})

// RED before the fix: the plan carried only the bucket, so a no-token apply had
// to resolve the name itself, from the wrong table.
test('the plan names the state each item is written, per type', async () => {
  const { dir, spec } = repo(EREQS)
  const adapter = fakeAdapter()
  const first = await planAndApply(dir, adapter)
  assert.strictEqual(first.plan.issue.stateName, 'Active', 'the User Story, in-progress')
  const created = Object.fromEntries(first.plan.subIssues.create.map((s) => [s.ref, s.stateName]))
  assert.deepStrictEqual(created, { '01-emit': 'Closed', '02-verify': 'Active', '03-alert': 'New' })

  finishPhase2(spec)
  const plan = await run(['plan', SPEC, '--skip-state-check', '--json'], dir)
  const update = JSON.parse(plan.out).subIssues.update.find((u) => u.ref === '02-verify')
  assert.strictEqual(update.state, 'complete')
  assert.strictEqual(update.stateName, 'Closed', 'a done Task is Closed, never the parent\'s Resolved')
})

// Stays silent: a bucket the config maps to null sends no state, and the plan
// says so with a null name rather than inventing one.
test('a bucket mapped to null plans a null stateName', async () => {
  const config = { ...EREQS, statesByType: { Task: { complete: 'Closed', backlog: null } } }
  const { dir } = repo(config)
  const plan = await run(['plan', SPEC, '--skip-state-check', '--json'], dir)
  const alert = JSON.parse(plan.out).subIssues.create.find((s) => s.ref === '03-alert')
  assert.strictEqual(alert.state, 'backlog')
  assert.strictEqual(alert.stateName, null)
})
