'use strict'

// The azure-boards spec-sync CLI, end to end and offline: a scaffolded repo, a
// fake adapter, injected streams. Exit-code semantics mirror the other
// providers' table — the assertions here are that contract.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const ORG = 'https://dev.azure.com/acme'
const PROJECT = 'web'

function repoWithSpec({ identifier = null, config = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-cli-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ azure: { orgUrl: ORG, project: PROJECT }, ...config }),
  )
  const spec = path.join(dir, 'specs', 'in-progress', 'feat-demo')
  fs.mkdirSync(spec, { recursive: true })
  const fm = identifier
    ? `---\nazure_identifier: "${identifier}"\nazure_url: "${ORG}/${PROJECT}/_workitems/edit/${identifier.replace(/^AB#/, '')}"\n---\n\n`
    : ''
  fs.writeFileSync(path.join(spec, '00-overview.md'), `${fm}# Demo\n\n## Problem\n\nBody prose.\n`)
  fs.writeFileSync(path.join(spec, '01-outbox.md'), '# Phase 1 — Outbox ⬜\n\n**Goal:** a durable place.\n')
  return dir
}

class Sink {
  constructor(tty = false) {
    this.text = ''
    this.isTTY = tty
  }
  write(s) {
    this.text += s
  }
}

async function run(args, dir, { adapter, env = {}, tty = false } = {}) {
  const out = new Sink(tty)
  const err = new Sink()
  const code = await specSync(args, { cwd: dir, out, err, adapter, env, tty })
  return { code, out: out.text, err: err.text }
}

// A fake adapter that behaves like a healthy Basic-process project.
function fakeAdapter() {
  const calls = []
  let n = 100
  const items = new Map()
  const adapter = {
    calls,
    items,
    async readIssue(id) {
      calls.push(['readIssue', id])
      return items.get(String(id)) || null
    },
    async createIssue({ title, description }) {
      calls.push(['createIssue', title])
      const id = String(++n)
      const item = {
        id,
        identifier: `AB#${id}`,
        url: `${ORG}/${PROJECT}/_workitems/edit/${id}`,
        title,
        description: description ?? null,
        state: { name: 'To Do' },
        type: 'Issue',
      }
      items.set(id, item)
      return { id, identifier: item.identifier, url: item.url }
    },
    async createSubIssue(parentId, { title, description }) {
      calls.push(['createSubIssue', parentId, title])
      const id = String(++n)
      const item = {
        id,
        identifier: `AB#${id}`,
        url: `${ORG}/${PROJECT}/_workitems/edit/${id}`,
        title,
        description: description ?? null,
        state: { name: 'To Do' },
        type: 'Task',
      }
      items.set(id, item)
      return { id, identifier: item.identifier, url: item.url }
    },
    async updateIssue(id, updates) {
      calls.push(['updateIssue', id, updates])
      const item = items.get(String(id))
      if (item && updates.description !== undefined) item.description = updates.description
      return {}
    },
    async transitionTo(id, target) {
      calls.push(['transitionTo', id, target])
      const item = items.get(String(id))
      if (item) item.state = { name: target }
      return { moved: true }
    },
    async searchIssues() {
      calls.push(['searchIssues'])
      return []
    },
    async listIssueStates(type) {
      calls.push(['listIssueStates', type])
      return [
        { name: 'To Do', category: 'Proposed' },
        { name: 'Doing', category: 'InProgress' },
        { name: 'Done', category: 'Completed' },
      ]
    },
    async readViewer() {
      // The contract after the adoption fixes: `id` is the ASSIGNABLE value
      // (uniqueName/email), because `System.AssignedTo` refuses the GUID.
      return { id: 'jane@acme.test', name: 'Jane', email: 'jane@acme.test' }
    },
    async searchUsers(query, opts) {
      calls.push(['searchUsers', query, opts])
      return { users: [{ id: 'id-1', name: 'Jane', email: 'jane@acme.test', active: true }], nextCursor: null }
    },
    async listComments(id) {
      calls.push(['listComments', id])
      return adapter._comments || []
    },
    async createComment(id, body) {
      calls.push(['createComment', id, body])
      ;(adapter._comments = adapter._comments || []).push({ id: '9', body })
      return { id: '9' }
    },
  }
  return adapter
}

// --- refusals and opt-outs --------------------------------------------------

test('an unknown flag refuses before anything runs', async () => {
  const dir = repoWithSpec()
  const r = await run(['plan', 'feat-demo', '--wrte'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /unknown flag --wrte/)
})

test('no config is the opt-out: exit 0, said plainly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-noconfig-'))
  const r = await run(['plan', 'anything'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /not present — Azure Boards sync is off/)
})

test('a spec that does not resolve exits 1 with a message', async () => {
  const dir = repoWithSpec()
  const r = await run(['normalize', 'no-such-spec'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /spec not found/)
})

// --- the state gate ---------------------------------------------------------

test('plan refuses without --workspace-states, naming both exits', async () => {
  const dir = repoWithSpec()
  const r = await run(['plan', 'feat-demo'], dir, { tty: true })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /--workspace-states/)
  assert.match(r.out, /--skip-state-check/)
})

test('plan refuses a configured state the types do not have, with a suggestion', async () => {
  const dir = repoWithSpec({ config: { states: { complete: 'Shipped' } } })
  const states = path.join(dir, 'states.json')
  fs.writeFileSync(states, JSON.stringify(['To Do', 'Doing', 'Done']))
  const r = await run(['plan', 'feat-demo', '--workspace-states', states], dir, { tty: true })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /"Shipped" is not a state/)
  assert.match(r.out, /use "Done" instead/)
})

test('plan with valid states prints the plan JSON', async () => {
  const dir = repoWithSpec()
  const states = path.join(dir, 'states.json')
  fs.writeFileSync(states, JSON.stringify(['To Do', 'Doing', 'Done']))
  const r = await run(['plan', 'feat-demo', '--workspace-states', states, '--json'], dir)
  assert.strictEqual(r.code, 0)
  const plan = JSON.parse(r.out)
  assert.strictEqual(plan.subIssues.create.length, 1)
})

// --- apply ------------------------------------------------------------------

test('apply mints item + child, moves states, stamps, records — then the next plan is empty', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  const plan = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  const planFile = path.join(dir, 'plan.json')
  fs.writeFileSync(planFile, plan.out)

  const r = await run(['apply', 'feat-demo', '--plan', planFile], dir, { adapter })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /transport = api/)
  assert.match(r.out, /issue created: AB#101/)
  assert.match(r.out, /sub-issue created: 01-outbox → AB#102/)
  assert.match(r.out, /round-tripped intact/)
  assert.match(r.out, /snapshot: specs\/\.core\/azure-base\/AB#101\.base\.json/)

  // The state moved by a direct write, with the NUMERIC id — never AB#n.
  assert.ok(adapter.calls.some(([op, id, t]) => op === 'transitionTo' && id === '101' && t === 'Doing'))

  // Stamps landed in the spec files.
  const overview = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')
  assert.match(overview, /^azure_identifier: "AB#101"$/m)
  const phase = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '01-outbox.md'), 'utf-8')
  assert.match(phase, /^azure_item_id: "AB#102"$/m)

  // Closed loop: the next plan is empty.
  const again = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  const p2 = JSON.parse(again.out)
  assert.strictEqual(p2.subIssues.create.length, 0)
  assert.strictEqual(p2.issue, undefined)
})

test('apply over MCP writes nothing and hands the skill instructions (exit 0)', async () => {
  const dir = repoWithSpec()
  const plan = path.join(dir, 'plan.json')
  fs.writeFileSync(plan, JSON.stringify({ subIssues: { create: [], update: [] }, issue: { description: 'x' } }))
  const r = await run(['apply', 'feat-demo', '--plan', plan, '--via', 'mcp'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /transport = mcp/)
  assert.match(r.out, /wit_work_item_write/)
})

test('a twin with the spec title and no claiming spec refuses the mint', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  adapter.searchIssues = async () => [{ identifier: 'AB#77', title: 'Demo' }]
  const plan = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  const planFile = path.join(dir, 'plan.json')
  fs.writeFileSync(planFile, plan.out)
  const r = await run(['apply', 'feat-demo', '--plan', planFile], dir, { adapter })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /AB#77 is already titled "Demo"/)
  assert.match(r.out, /--force-new/)
})

// --- stamp ------------------------------------------------------------------

test('stamp validates everything before writing anything', async () => {
  const dir = repoWithSpec()
  const r = await run(['stamp', 'feat-demo', '--issue', 'not-an-id', '--sub', 'nope=AB#9'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /not a work item id/)
  assert.match(r.out, /no phase file named nope/)
  const overview = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')
  assert.doesNotMatch(overview, /azure_identifier/, 'nothing written on a refusal')
})

test('stamp writes identifier, derived url and child stamps — bare numbers normalise', async () => {
  const dir = repoWithSpec()
  const r = await run(['stamp', 'feat-demo', '--issue', '7', '--sub', '01-outbox=8'], dir)
  assert.strictEqual(r.code, 0)
  const overview = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')
  assert.match(overview, /azure_identifier: "AB#7"/)
  assert.match(overview, new RegExp(`azure_url: "${ORG}/${PROJECT}/_workitems/edit/7"`))
  const phase = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '01-outbox.md'), 'utf-8')
  assert.match(phase, /azure_item_id: "8"/)
})

// --- status / verify --------------------------------------------------------

test('status reports drift only on a positive answer', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  await run(['record', 'feat-demo'], dir)
  const remote = path.join(dir, 'remote.json')
  fs.writeFileSync(remote, JSON.stringify({ state: { name: 'Done' }, description: 'whatever' }))
  const r = await run(['status', 'feat-demo', '--remote', remote], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /drift: Azure says "complete", the repo says "in-progress"/)
  // Push resends State only when the spec's own state changes, so promising the
  // repo wins on the next push is a promise the engine does not keep.
  const stateLine = r.out.split('\n').find((l) => /drift: Azure says/.test(l))
  assert.doesNotMatch(stateLine, /repo wins on next push/)
  assert.match(stateLine, /push resends State only when the spec moves/)
})

test('status reports a state skitterspec does not map as position, not drift', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  await run(['record', 'feat-demo'], dir)
  const remote = path.join(dir, 'remote.json')
  fs.writeFileSync(remote, JSON.stringify({ id: 7, fields: { 'System.State': 'Blocked' } }))
  const r = await run(['status', 'feat-demo', '--remote', remote], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /state: Azure has it in "Blocked", a state skitterspec does not map — left alone/)
  assert.doesNotMatch(r.out, /drift: Azure says/, 'an unmapped state is not a disagreement')
})

// --remote is documented as "fetch the work item JSON", which is the raw REST
// shape: everything under `fields`. The default readers expect the flat shape,
// so without the provider hooks every check below routes to its silent
// cannot-tell branch.

test('status --remote reads the state drift off a raw work item', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  await run(['record', 'feat-demo'], dir)
  const remote = path.join(dir, 'remote.json')
  fs.writeFileSync(remote, JSON.stringify({ id: 7, fields: { 'System.State': 'Done' } }))
  const r = await run(['status', 'feat-demo', '--remote', remote], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /drift: Azure says "complete", the repo says "in-progress"/)
})

test('status --remote reports a raw description edited since the push', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  await run(['record', 'feat-demo'], dir)
  const remote = path.join(dir, 'remote.json')
  fs.writeFileSync(
    remote,
    JSON.stringify({
      id: 7,
      fields: { 'System.State': 'Doing', 'System.Description': 'entirely different words' },
      multilineFieldsFormat: { 'System.Description': 'markdown' },
    }),
  )
  const r = await run(['status', 'feat-demo', '--remote', remote], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /description was edited on Azure Boards/)
  assert.match(r.out, /drift: none — Azure agrees with the repo/)
})

test('status --remote stays silent on the description the repo itself pushed', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  // The projection's own text, exactly as a push writes it — markdown is
  // stored verbatim, so the read-back IS the pushed text.
  const states = path.join(dir, 'states.json')
  fs.writeFileSync(states, JSON.stringify(['To Do', 'Doing', 'Done']))
  const plan = await run(['plan', 'feat-demo', '--workspace-states', states, '--json'], dir)
  const description = JSON.parse(plan.out).issue.description
  await run(['record', 'feat-demo'], dir)
  const remote = path.join(dir, 'remote.json')
  fs.writeFileSync(
    remote,
    JSON.stringify({
      id: 7,
      fields: { 'System.State': 'Doing', 'System.Description': description },
      multilineFieldsFormat: { 'System.Description': 'markdown' },
    }),
  )
  const r = await run(['status', 'feat-demo', '--remote', remote], dir)
  assert.strictEqual(r.code, 0)
  assert.doesNotMatch(r.out, /description was edited/)
  assert.match(r.out, /drift: none — Azure agrees with the repo/)
})

test('status --remote says nothing about fields the payload never carried', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  await run(['record', 'feat-demo'], dir)
  const remote = path.join(dir, 'remote.json')
  // State fetched, description not asked for: its absence is not an edit.
  fs.writeFileSync(remote, JSON.stringify({ id: 7, fields: { 'System.State': 'Doing' } }))
  const r = await run(['status', 'feat-demo', '--remote', remote], dir)
  assert.strictEqual(r.code, 0)
  assert.doesNotMatch(r.out, /description was edited/)
  // Nothing recognisable at all: both checks stay silent rather than accuse.
  fs.writeFileSync(remote, JSON.stringify({ id: 7 }))
  const bare = await run(['status', 'feat-demo', '--remote', remote], dir)
  assert.strictEqual(bare.code, 0)
  assert.doesNotMatch(bare.out, /drift/)
})

test('verify refuses a .base.json passed as --stored', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  const stored = path.join(dir, 'base.json')
  fs.writeFileSync(stored, JSON.stringify({ issue: 'x', issueFields: { description: 'h' }, subIssues: {} }))
  const r = await run(['verify', 'feat-demo', '--stored', stored], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /looks like a \.base\.json snapshot/)
})

test('verify warns on lost text and still exits 0', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  const stored = path.join(dir, 'stored.json')
  fs.writeFileSync(stored, JSON.stringify({ issue: 'entirely different words', subIssues: {} }))
  const r = await run(['verify', 'feat-demo', '--stored', stored], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /!! issue: the tracker stored different text/)
})

// --- ref --------------------------------------------------------------------

test('ref prints the bare identifier on stdout only on success', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  const r = await run(['ref', 'feat-demo'], dir)
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.out, 'AB#7\n')
})

test('ref on an unlinked spec is stderr + exit 1, stdout empty', async () => {
  const dir = repoWithSpec()
  const r = await run(['ref', 'feat-demo'], dir)
  assert.strictEqual(r.code, 1)
  assert.strictEqual(r.out, '')
  assert.match(r.err, /has no azure_identifier — omit the trailer/)
})

// --- released ---------------------------------------------------------------
// Deliberately NOT shipped: the kit's trailer scan hardcodes KEY-N and would
// count every AB#n ref as unreferenced — an accusation against a healthy repo.
// The refusal names the dependency rather than mis-scanning.

// --- preserve ---------------------------------------------------------------

test('preserve posts the original once, marked, and is idempotent', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  const adapter = fakeAdapter()
  adapter.items.set('7', { id: '7', identifier: 'AB#7', description: 'the reporter wrote this' })
  const first = await run(['preserve', 'feat-demo'], dir, { adapter })
  assert.strictEqual(first.code, 0)
  assert.match(first.out, /original report preserved as a comment/)
  // The comment went to the NUMERIC id, which is what the API takes.
  assert.ok(adapter.calls.some(([op, id]) => op === 'createComment' && id === '7'))
  const again = await run(['preserve', 'feat-demo'], dir, { adapter })
  assert.strictEqual(again.code, 0)
  assert.match(again.out, /already preserved/)
})

test('preserve exits 0 on every cannot-tell', async () => {
  const dir = repoWithSpec() // unlinked
  const unlinked = await run(['preserve', 'feat-demo'], dir)
  assert.strictEqual(unlinked.code, 0)
  assert.match(unlinked.out, /not linked/)

  const linkedDir = repoWithSpec({ identifier: 'AB#7' })
  const adapter = fakeAdapter() // item 7 unknown -> not found
  const missing = await run(['preserve', 'feat-demo'], linkedDir, { adapter })
  assert.strictEqual(missing.code, 0)
  assert.match(missing.out, /not found on Azure/)
})

// --- states / list ----------------------------------------------------------

test('states --json emits the bare array --workspace-states consumes', async () => {
  const dir = repoWithSpec()
  const r = await run(['states', '--json'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0)
  assert.deepStrictEqual(JSON.parse(r.out), ['To Do', 'Doing', 'Done'])
})

test('states asks BOTH configured types and unions the answer', async () => {
  const dir = repoWithSpec({ config: { azure: { orgUrl: ORG, project: PROJECT, workItemType: 'User Story', childType: 'Task' } } })
  const adapter = fakeAdapter()
  adapter.listIssueStates = async (type) => {
    adapter.calls.push(['listIssueStates', type])
    return type === 'User Story'
      ? [{ name: 'New', category: 'Proposed' }, { name: 'Closed', category: 'Completed' }]
      : [{ name: 'To Do', category: 'Proposed' }, { name: 'Closed', category: 'Completed' }]
  }
  const r = await run(['states', '--json'], dir, { adapter })
  assert.strictEqual(r.code, 0)
  assert.deepStrictEqual(JSON.parse(r.out), ['New', 'Closed', 'To Do'])
  const asked = adapter.calls.filter(([op]) => op === 'listIssueStates').map(([, t]) => t)
  assert.deepStrictEqual(asked.sort(), ['Task', 'User Story'])
})

test('states over MCP degrades to instructions, exit 0', async () => {
  const dir = repoWithSpec()
  const r = await run(['states', '--via', 'mcp'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /transport = mcp/)
})

// --- the bucket map -----------------------------------------------------------
test('states renders the bucket map, naming the miss and its closest match', async () => {
  const dir = repoWithSpec({ config: { states: { complete: 'Shipped' } } })
  const r = await run(['states'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /map: lifecycle bucket -> Boards state/)
  assert.match(r.out, /backlog\s+-> To Do\s+ok \[Proposed\]/)
  assert.match(r.out, /complete\s+-> Shipped\s+MISSING from these types — closest: "Done"/)
  assert.match(r.out, /remap: spec-sync init-config --force --state/)
})

test('a fully-mapped project earns ok rows and no remap line', async () => {
  const dir = repoWithSpec()
  const r = await run(['states'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0)
  assert.doesNotMatch(r.out, /MISSING/)
  assert.doesNotMatch(r.out, /remap:/)
})

// --- init-config / credentials / doctor ------------------------------------

test('init-config writes only what was set, and validates through the loader', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-init-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-inithome-'))
  const r = await run(['init-config', '--org-url', ORG, '--project', PROJECT, '--state', 'complete=Shipped'], dir, {
    env: { XDG_CONFIG_HOME: home },
  })
  assert.strictEqual(r.code, 0)
  const written = JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf-8'))
  assert.deepStrictEqual(written, {
    azure: { orgUrl: ORG, project: PROJECT },
    states: { complete: 'Shipped' },
  })
  // Spec worktrees fork from commits, so a written-but-uncommitted config is
  // invisible exactly where the sync skills run — the write must say so.
  assert.match(r.out, /commit it/)
  const again = await run(['init-config', '--org-url', ORG, '--project', PROJECT], dir, {
    env: { XDG_CONFIG_HOME: home },
  })
  assert.strictEqual(again.code, 1)
  assert.match(again.out, /--force/)
})

test('init-config refuses a non-bucket --state key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-init-'))
  const r = await run(['init-config', '--org-url', ORG, '--project', 'p', '--state', 'shipped=Done'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /not a lifecycle bucket/)
})

test('init-config refuses a map the types cannot express, naming the choices', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-initval-'))
  const adapter = {
    async listIssueStates() {
      return [{ name: 'New' }, { name: 'Active' }, { name: 'On Live' }]
    },
  }
  const r = await run(['init-config', '--org-url', ORG, '--project', 'erq'], dir, { adapter })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /refusing — nothing written/)
  assert.match(r.out, /"Done" is not a state in erq/)
  assert.match(r.out, /available: New, Active, On Live/)
  assert.strictEqual(fs.existsSync(path.join(dir, CONFIG_FILE)), false)

  const fixed = await run(
    [
      'init-config', '--org-url', ORG, '--project', 'erq',
      '--state', 'backlog=New', '--state', 'in-progress=Active',
      '--state', 'complete=On Live', '--state', 'cancelled=On Live',
    ],
    dir,
    { adapter },
  )
  assert.strictEqual(fixed.code, 0, fixed.out)
  assert.match(fixed.out, /wrote/)
})

test('init-config stays usable with no credentials — written, with one honest line', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-initnocred-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-inithome-'))
  const r = await run(['init-config', '--org-url', ORG, '--project', PROJECT], dir, {
    env: { XDG_CONFIG_HOME: home },
  })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /states not checked against the project/)
  assert.ok(fs.existsSync(path.join(dir, CONFIG_FILE)))
})

test('credentials status is a readiness check: exit 1 with none, never a token in output', async () => {
  const dir = repoWithSpec()
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-home-'))
  const r = await run(['credentials', 'status'], dir, { env: { XDG_CONFIG_HOME: home } })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /token: {2}not set/)
  assert.match(r.out, /Run this yourself, in your own terminal/)

  const withEnv = await run(['credentials', 'status'], dir, {
    env: { XDG_CONFIG_HOME: home, AZURE_DEVOPS_EXT_PAT: 'supersecret99' },
  })
  assert.strictEqual(withEnv.code, 0)
  assert.doesNotMatch(withEnv.out, /supersecret99/)
  assert.match(withEnv.out, /…et99/)
})

test('credentials set --key is refused on purpose', async () => {
  const dir = repoWithSpec()
  const r = await run(['credentials', 'set', '--key', 'sekret'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /--key is not supported, on purpose/)
  assert.doesNotMatch(r.out, /sekret/)
})

test('credentials works before the repo opts in, keyed by --org-url', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-precfg-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-prehome-'))
  const bare = await run(['credentials', 'status'], dir, { env: { XDG_CONFIG_HOME: home } })
  assert.strictEqual(bare.code, 1)
  assert.match(bare.out, /pass --org-url/)

  const status = await run(['credentials', 'status', '--org-url', ORG], dir, {
    env: { XDG_CONFIG_HOME: home, AZURE_DEVOPS_EXT_PAT: 'tok' },
  })
  assert.strictEqual(status.code, 0, status.out)
  assert.match(status.out, new RegExp(ORG.replace(/[/.]/g, '\\$&')))
})

test('doctor: missing config is missing (ok), a half-filled one is broken', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-doc-'))
  const missing = await run(['doctor', '--json'], empty)
  assert.strictEqual(missing.code, 0, 'a declined opt-in never fails the run')
  const report = JSON.parse(missing.out)
  assert.strictEqual(report.checks.find((c) => c.id === 'tracker').state, 'missing')

  const half = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-doc-'))
  fs.mkdirSync(path.join(half, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(half, CONFIG_FILE), JSON.stringify({ azure: { orgUrl: ORG } }))
  const broken = await run(['doctor', '--json'], half)
  assert.strictEqual(broken.code, 1)
  assert.strictEqual(JSON.parse(broken.out).checks.find((c) => c.id === 'tracker').state, 'broken')
})

test('doctor --check-remote validates states and probes identity search', async () => {
  const dir = repoWithSpec({ config: { states: { complete: 'Shipped' } } })
  const adapter = fakeAdapter()
  const r = await run(['doctor', '--check-remote', '--json'], dir, {
    adapter,
    env: { AZURE_DEVOPS_EXT_PAT: 't' },
  })
  assert.strictEqual(r.code, 1)
  const report = JSON.parse(r.out)
  const states = report.checks.find((c) => c.id === 'states')
  assert.strictEqual(states.state, 'broken')
  assert.match(states.detail, /Shipped/)
  assert.strictEqual(report.checks.find((c) => c.id === 'identity').state, 'ok')
})

test('doctor warns, never breaks, on a PAT without Identity (Read)', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  adapter.searchUsers = async () => {
    throw new Error('Azure DevOps refused the identity search — the PAT needs the Identity (Read) scope for `users`; work item ops and `whoami` do not')
  }
  const r = await run(['doctor', '--check-remote', '--json'], dir, {
    adapter,
    env: { AZURE_DEVOPS_EXT_PAT: 't' },
  })
  assert.strictEqual(r.code, 0, r.out)
  const identity = JSON.parse(r.out).checks.find((c) => c.id === 'identity')
  assert.strictEqual(identity.state, 'warn')
  assert.match(identity.detail, /Identity \(Read\)/)
})

test('doctor warns on an untracked config, and stays silent once committed', async () => {
  const { execFileSync } = require('node:child_process')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-doc-git-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ azure: { orgUrl: ORG, project: PROJECT } }))
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  git('init')

  const untracked = await run(['doctor', '--json'], dir)
  assert.strictEqual(untracked.code, 0, 'a warn never fails the run')
  const warnRow = JSON.parse(untracked.out).checks.find((c) => c.label === 'Config committed')
  assert.ok(warnRow, 'untracked config gets a row')
  assert.strictEqual(warnRow.state, 'warn')
  assert.match(warnRow.detail, /untracked/)

  git('add', '--', CONFIG_FILE)
  git('-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-m', 'config')
  const committed = await run(['doctor', '--json'], dir)
  assert.strictEqual(
    JSON.parse(committed.out).checks.find((c) => c.label === 'Config committed'),
    undefined,
    'a committed config earns silence, not an ok row',
  )
})

test('doctor says nothing about committing outside a git repo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-doc-nogit-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ azure: { orgUrl: ORG, project: PROJECT } }))
  const r = await run(['doctor', '--json'], dir)
  assert.strictEqual(r.code, 0)
  assert.strictEqual(
    JSON.parse(r.out).checks.find((c) => c.label === 'Config committed'),
    undefined,
    'no git is a cannot-tell, not an accusation',
  )
})

// --- linked (offline) -------------------------------------------------------

test('linked lists every spec with its link state, offline', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  const r = await run(['linked', '--json'], dir)
  assert.strictEqual(r.code, 0)
  assert.deepStrictEqual(JSON.parse(r.out), [{ spec: 'feat-demo', bucket: 'in-progress', identifier: 'AB#7' }])
})

// --- stamp's live check -------------------------------------------------------

test('stamp refuses an id Azure says does not exist, writing nothing', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter() // holds no items at all
  const r = await run(['stamp', 'feat-demo', '--issue', 'AB#99'], dir, { adapter })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /AB#99: Azure has no such work item/)
  const overview = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')
  assert.doesNotMatch(overview, /azure_identifier/)
})

test('stamp verifies the id when it can, and says so', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  const made = await adapter.createIssue({ title: 'Hand-filed', description: 'PM text' })
  const r = await run(['stamp', 'feat-demo', '--issue', made.identifier], dir, { adapter })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /verified against Azure/)
})

test('an unreachable Azure stamps anyway, saying it could not check', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  adapter.readIssue = async () => {
    throw new Error('getaddrinfo ENOTFOUND')
  }
  const r = await run(['stamp', 'feat-demo', '--issue', 'AB#7'], dir, { adapter })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /could not check the id\(s\) against Azure — stamping anyway/)
  assert.match(r.out, /AB#7 stamped onto feat-demo/)
  assert.doesNotMatch(r.out, /verified against Azure/)
})

// --- assignment (the kit seam, Azure's binding) -------------------------------

test('assign stamps the assignee fields and names the next step', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  const r = await run(['assign', 'feat-demo', '--to', 'id-1', '--name', 'Jane Dev'], dir)
  assert.strictEqual(r.code, 0, r.out)
  const overview = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')
  assert.match(overview, /azure_assignee_id: "id-1"/)
  assert.match(overview, /azure_assignee_name: "Jane Dev"/)
  assert.match(r.out, /assigned to Jane Dev \(id-1\)/)
  assert.match(r.out, /push it, so Azure Boards agrees/)
})

test('assign refuses an unlinked spec, writing nothing', async () => {
  const dir = repoWithSpec()
  const r = await run(['assign', 'feat-demo', '--to', 'id-1'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /not linked to Azure Boards/)
  const overview = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')
  assert.doesNotMatch(overview, /azure_assignee_id/)
})

test('assign --release clears the stamp', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  await run(['assign', 'feat-demo', '--to', 'id-1', '--name', 'Jane'], dir)
  const r = await run(['assign', 'feat-demo', '--release'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /released \(AB#7\)/)
  const overview = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')
  assert.doesNotMatch(overview, /azure_assignee_id/)
})

test('whoami derives from the PAT via connectionData and caches it', async () => {
  const dir = repoWithSpec()
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-whoami-'))
  const adapter = fakeAdapter()
  const r = await run(['whoami', '--json'], dir, { adapter, env: { XDG_CONFIG_HOME: home } })
  assert.strictEqual(r.code, 0, r.out)
  const got = JSON.parse(r.out)
  assert.strictEqual(got.ok, true)
  // The cached value is the one `System.AssignedTo` accepts — the account
  // email — never the connectionData GUID Azure refuses.
  assert.strictEqual(got.id, 'jane@acme.test')
  assert.strictEqual(got.source, 'viewer')
  // The derive was cached: a second ask answers from the store, no adapter.
  const again = await run(['whoami', '--json'], dir, { env: { XDG_CONFIG_HOME: home } })
  assert.strictEqual(JSON.parse(again.out).source, 'store')
})

test('whoami with no org configured names the gap', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-noorg-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ azure: {} }))
  const r = await run(['whoami'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /no azure\.orgUrl/)
})

test('users lists identities through the adapter page', async () => {
  const dir = repoWithSpec()
  const r = await run(['users', 'jane'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /Jane <id-1>\s+jane@acme\.test/)
})

// --- released (AB#n trailers, foreign history) ---------------------------------

const { execFileSync } = require('node:child_process')

function gitRepo(dir) {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
  git('init', '-q')
  git('config', 'user.email', 't@e.st')
  git('config', 'user.name', 'T')
  return git
}

test('released reads AB#n trailers and counts an earlier tracker as historical', async () => {
  const dir = repoWithSpec()
  const git = gitRepo(dir)
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a')
  git('add', '-A')
  git('commit', '-q', '-m', 'feat(x): thing\n\nRefs: AB#7')
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b')
  git('add', '-A')
  git('commit', '-q', '-m', 'fix(y): older era\n\nRefs: SKS-12')
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c')
  git('add', '-A')
  git('commit', '-q', '-m', 'chore: no trailer here')
  const r = await run(['released', 'HEAD', '--json'], dir)
  assert.strictEqual(r.code, 0, r.out)
  const report = JSON.parse(r.out)
  assert.deepStrictEqual(report.tickets, [{ ref: 'AB#7', commits: 1 }])
  assert.strictEqual(report.historical, 1)
  assert.strictEqual(report.unreferenced, 1)
})

test('released refuses an invalid refs.foreignPatterns entry by name', async () => {
  const dir = repoWithSpec({ config: { refs: { foreignPatterns: ['[oops'] } } })
  gitRepo(dir)
  const r = await run(['released', 'HEAD'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /invalid pattern\(s\): \[oops/)
})

// --- the release verbs (kit seam over the work item carrier) -------------------

function releaseFakes() {
  const adapter = fakeAdapter()
  const store = { release: null }
  adapter.releaseFind = async () => store.release
  adapter.releaseCreate = async ({ tag, body }) => {
    store.release = { id: '50', url: `${ORG}/${PROJECT}/_workitems/edit/50`, body }
    return store.release
  }
  adapter.releaseUpdate = async (release, { body }) => {
    store.release = { ...release, body }
    return store.release
  }
  adapter.releaseAttach = async (release, tickets) => ({ attached: tickets.length, already: 0 })
  adapter.releaseStage = async () => ({ set: 1 })
  adapter.releaseComplete = async (release) => release
  return { adapter, store }
}

function releaseRepo() {
  const dir = repoWithSpec({
    identifier: 'AB#7',
    config: {
      azure: { orgUrl: ORG, project: PROJECT },
      releases: { workItemType: 'Release', series: [{ tagPrefix: 'v', envs: { staged: 'Staged', published: 'Published' } }] },
    },
  })
  const git = gitRepo(dir)
  git('add', '-A')
  git('commit', '-q', '-m', 'feat(x): thing\n\nRefs: AB#7')
  git('tag', 'v1.0.0')
  fs.writeFileSync(path.join(dir, 'z.txt'), 'z')
  git('add', '-A')
  git('commit', '-q', '-m', 'feat(z): more\n\nRefs: AB#7')
  git('tag', 'v1.1.0')
  return dir
}

test('release create is a dry run by default and writes with --apply', async () => {
  const dir = releaseRepo()
  const { adapter, store } = releaseFakes()
  const dry = await run(['release', 'create', 'v1.1.0'], dir, { adapter })
  assert.strictEqual(dry.code, 0, dry.out)
  assert.match(dry.out, /dry run — pass --apply/)
  assert.match(dry.out, /range: {4}v1\.0\.0\.\.v1\.1\.0/)
  assert.strictEqual(store.release, null, 'a dry run writes nothing')

  const wet = await run(['release', 'create', 'v1.1.0', '--apply'], dir, { adapter })
  assert.strictEqual(wet.code, 0, wet.out)
  assert.match(wet.out, /created:/)
  assert.ok(store.release, 'the release item exists')
  assert.match(store.release.body, /skitterspec:release v1 stage=staged/)
})

test('release create reports how many tickets it tagged', async () => {
  const dir = releaseRepo()
  const { adapter } = releaseFakes()
  adapter.releaseAttach = async () => ({ attached: 1, already: 0, tagged: 1 })
  const wet = await run(['release', 'create', 'v1.1.0', '--apply'], dir, { adapter })
  assert.strictEqual(wet.code, 0, wet.out)
  assert.match(wet.out, /issues: {3}1 noted, 0 already noted, 1 tagged/)
})

test('release deployed moves the release item and complete closes it', async () => {
  const dir = releaseRepo()
  const { adapter, store } = releaseFakes()
  await run(['release', 'create', 'v1.1.0', '--apply'], dir, { adapter })
  const dep = await run(['release', 'deployed', 'v1.1.0', 'published', '--apply'], dir, { adapter })
  assert.strictEqual(dep.code, 0, dep.out)
  assert.match(dep.out, /set: {6}1 issue\(s\)/)
  assert.match(store.release.body, /stage=published/)
  const done = await run(['release', 'complete', 'v1.1.0', '--apply'], dir, { adapter })
  assert.strictEqual(done.code, 0, done.out)
  assert.match(done.out, /completed:/)
})

test('release deployed refuses an env the series does not configure', async () => {
  const dir = releaseRepo()
  const { adapter } = releaseFakes()
  await run(['release', 'create', 'v1.1.0', '--apply'], dir, { adapter })
  const r = await run(['release', 'deployed', 'v1.1.0', 'mars', '--apply'], dir, { adapter })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /pass an env of v: staged, published/)
})

// --- the adoption handoff fixes (bug-azure-boards-adoption-fixes) -------------
// Live repros against an Agile-process project; each test here is one of the
// five reported defects, red before its fix.

function gitRepo(dir) {
  const { execFileSync } = require('node:child_process')
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@t.t')
  git('config', 'user.name', 'T')
  git('config', 'commit.gpgsign', 'false')
  return git
}

test('a bare ref answers from the branch, and only on success', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  const git = gitRepo(dir)
  git('add', '-A')
  git('commit', '-qm', 'init')
  git('switch', '-qc', 'feat/demo')
  const r = await run(['ref'], dir)
  assert.deepStrictEqual([r.code, r.out], [0, 'AB#7\n'], r.err)

  // The stays-silent case: on the base branch there is no spec to answer with,
  // so stderr names the real reason and stdout stays empty for `$(…)` callers.
  git('switch', '-q', 'main')
  const r2 = await run(['ref'], dir)
  assert.strictEqual(r2.code, 1)
  assert.strictEqual(r2.out, '')
  assert.match(r2.err, /no spec matches branch|not on a branch/)
})

test('an assignee the tracker refuses is skipped and reported; the apply still lands', async () => {
  const dir = repoWithSpec({ identifier: 'AB#7' })
  const adapter = fakeAdapter()
  const item = {
    id: '7', identifier: 'AB#7', url: `${ORG}/${PROJECT}/_workitems/edit/7`,
    title: 'Demo', description: 'old', state: { name: 'To Do' }, type: 'Issue',
  }
  // The real adapter strips AB# itself; the fake is keyed by whatever the
  // caller passes, so seed both spellings of the one item.
  adapter.items.set('7', item)
  adapter.items.set('AB#7', item)
  const GUID = '45635853-aaaa-bbbb-cccc-121212121212'
  const updates = []
  adapter.updateIssue = async (id, input) => {
    updates.push(input)
    if (input.assigneeId && /^[0-9a-f-]{36}$/i.test(input.assigneeId)) {
      throw new Error(`Azure DevOps refused the request: The identity value '${input.assigneeId}' for field 'Assigned To' is an unknown identity.`)
    }
    const item = adapter.items.get(String(id))
    if (input.description !== undefined) item.description = input.description
    return item
  }
  const planFile = path.join(dir, 'plan.json')
  fs.writeFileSync(planFile, JSON.stringify({
    issue: { description: 'new body', state: 'in-progress', assignee: GUID },
    subIssues: { create: [], update: [] },
  }))
  const r = await run(['apply', 'feat-demo', '--plan', planFile], dir, { adapter })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /issue updated: AB#7/)
  assert.match(r.out, /assignee .*skipped|skipped.* assignee/i)
  assert.ok(updates.some((u) => u.description === 'new body' && u.assigneeId === undefined),
    'the description still lands, in a write carrying no assignee')
})

function repoWithBugSpec({ config = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-cli-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ azure: { orgUrl: ORG, project: PROJECT }, ...config }),
  )
  const spec = path.join(dir, 'specs', 'in-progress', 'bug-demo')
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(path.join(spec, '00-overview.md'), '# Bug demo\n\n## Symptom\n\nIt breaks.\n')
  fs.writeFileSync(path.join(spec, '01-fix.md'), '# Phase 1 — Fix ⬜\n\n**Goal:** stop it breaking.\n')
  return dir
}

test('a bug spec mints with azure.workItemTypeByKind, a feature falls back to workItemType', async () => {
  const byKind = { azure: { orgUrl: ORG, project: PROJECT, workItemType: 'User Story', workItemTypeByKind: { bug: 'Bug' } } }

  const bugDir = repoWithBugSpec({ config: byKind })
  const bugAdapter = fakeAdapter()
  const minted = []
  const mint = (a) => {
    const original = a.createIssue.bind(a)
    a.createIssue = async (input) => { minted.push(input.workItemType); return original(input) }
  }
  mint(bugAdapter)
  let plan = await run(['plan', 'bug-demo', '--skip-state-check', '--json'], bugDir)
  fs.writeFileSync(path.join(bugDir, 'plan.json'), plan.out)
  let r = await run(['apply', 'bug-demo', '--plan', path.join(bugDir, 'plan.json')], bugDir, { adapter: bugAdapter })
  assert.strictEqual(r.code, 0, r.out)
  assert.strictEqual(minted[0], 'Bug')

  // The stays-silent half: without workItemTypeByKind a bug spec mints exactly
  // as 1.1.0 did — the single configured type.
  const plainDir = repoWithBugSpec()
  const plainAdapter = fakeAdapter()
  minted.length = 0
  mint(plainAdapter)
  plan = await run(['plan', 'bug-demo', '--skip-state-check', '--json'], plainDir)
  fs.writeFileSync(path.join(plainDir, 'plan.json'), plan.out)
  r = await run(['apply', 'bug-demo', '--plan', path.join(plainDir, 'plan.json')], plainDir, { adapter: plainAdapter })
  assert.strictEqual(r.code, 0, r.out)
  assert.strictEqual(minted[0], require('../src/config.js').loadAzureConfig(plainDir).config.azure.workItemType)
})

test('states asks every configured type once, workItemTypeByKind included', async () => {
  const dir = repoWithSpec({
    config: { azure: { orgUrl: ORG, project: PROJECT, workItemType: 'User Story', childType: 'Task', workItemTypeByKind: { bug: 'Bug', hotfix: 'Bug' } } },
  })
  const adapter = fakeAdapter()
  const r = await run(['states', '--json'], dir, { adapter })
  assert.strictEqual(r.code, 0, r.out)
  const asked = adapter.calls.filter(([op]) => op === 'listIssueStates').map(([, t]) => t)
  assert.deepStrictEqual(asked.sort(), ['Bug', 'Task', 'User Story'])
})

test('apply warns when env.config.json does not claim the snapshot it wrote', async () => {
  const dir = repoWithSpec()
  // A project that adopted Azure Boards over a Linear-era isolation config: the
  // engine writes azure-base/… while stage only claims linear-base/….
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({
      branch: { identifierField: 'linear_identifier' },
      spec: { companionPaths: ['specs/.core/linear-base/{identifier}.base.json'] },
    }),
  )
  const adapter = fakeAdapter()
  const plan = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  fs.writeFileSync(path.join(dir, 'plan.json'), plan.out)
  const r = await run(['apply', 'feat-demo', '--plan', path.join(dir, 'plan.json')], dir, { adapter })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /spec\.companionPaths/)
  assert.match(r.out, /azure-base\/\{identifier\}\.base\.json/)
})

test('apply stays silent about companions when env.config claims the snapshot, or is absent', async () => {
  // Correctly configured isolation: no note.
  const configured = repoWithSpec()
  fs.writeFileSync(
    path.join(configured, 'specs', '.core', 'env.config.json'),
    JSON.stringify({
      branch: { identifierField: 'azure_identifier' },
      spec: { companionPaths: ['specs/.core/azure-base/{identifier}.base.json'] },
    }),
  )
  for (const dir of [configured, repoWithSpec()]) {
    const adapter = fakeAdapter()
    const plan = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
    fs.writeFileSync(path.join(dir, 'plan.json'), plan.out)
    const r = await run(['apply', 'feat-demo', '--plan', path.join(dir, 'plan.json')], dir, { adapter })
    assert.strictEqual(r.code, 0, r.out)
    assert.doesNotMatch(r.out, /companionPaths/)
  }
})
