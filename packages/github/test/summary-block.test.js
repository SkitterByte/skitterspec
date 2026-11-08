'use strict'

// Summary mode end to end through `spec-sync apply` (feat-tracker-held-specs
// phase 3): a ticket carries the block, a team's text around it survives every
// push, and the drift warning fires only for an edit inside the block.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const GH = { owner: 'SkitterByte', repo: 'demo', project: 7 }
const STATUS_OPTIONS = ['Backlog', 'In Progress', 'Done', 'Cancelled']
const BEGIN = '<!-- skitterspec:begin -->'
const END = '<!-- skitterspec:end -->'

function repo({ mapping = { description: 'summary' } } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-summary-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ github: GH, mapping }))
  const spec = path.join(dir, 'specs', 'in-progress', 'feat-demo')
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(path.join(spec, '00-overview.md'), '# Demo\n\n## Problem\n\nFirst version.\n\n## Decisions\n\n1. Internal.\n')
  fs.writeFileSync(path.join(spec, '01-outbox.md'), '# Phase 1 — Outbox ⬜\n\n**Goal:** a durable place.\n\n## Tasks\n\n- [ ] write it\n')
  return dir
}

const overview = (dir) => path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md')

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
  const code = await specSync(args, { cwd: dir, out, err, adapter, env: {}, tty: false })
  return { code, out: out.text + err.text }
}

function fakeAdapter() {
  const calls = []
  let n = 100
  const issues = new Map()
  const get = (ref) => issues.get(String(ref && ref.id != null ? ref.id : ref).replace(/^#/, ''))
  const make = (title, description, labels) => {
    const number = ++n
    const issue = { id: String(number), number, identifier: `#${number}`, url: `https://github.com/SkitterByte/demo/issues/${number}`, nodeId: `I_${number}`, title, description: description ?? '', state: null, open: true, labels: labels || [], comments: [] }
    issues.set(String(number), issue)
    return issue
  }
  return {
    calls,
    issues,
    async readIssue(ref) {
      const i = get(ref)
      return i ? { ...i } : null
    },
    async createIssue({ title, description, labels }) {
      const i = make(title, description, labels)
      return { id: i.id, identifier: i.identifier, url: i.url, nodeId: i.nodeId }
    },
    async createSubIssue(parentId, { title, description, labels }) {
      const i = make(title, description, labels)
      i.parent = String(parentId)
      return { id: i.id, identifier: i.identifier, url: i.url, nodeId: i.nodeId }
    },
    async updateIssue(ref, updates) {
      calls.push(['updateIssue', String(ref), updates])
      const i = get(ref)
      if (i && updates.description !== undefined) i.description = updates.description
      return {}
    },
    async setStatus(issueOrRef, name) {
      const i = get(issueOrRef)
      if (i) i.state = { name }
      return { changed: true }
    },
    async setIssueOpen() {
      return {}
    },
    async searchIssues() {
      return []
    },
    async listIssueStates() {
      return STATUS_OPTIONS.map((name, k) => ({ id: `o${k}`, name, category: null }))
    },
    async listComments(ref) {
      return (get(ref) || { comments: [] }).comments
    },
    async createComment(ref, body) {
      calls.push(['createComment', String(ref)])
      get(ref).comments.push({ id: 'c1', body })
      return { id: 'c1' }
    },
  }
}

async function apply(dir, adapter) {
  const states = path.join(dir, 'states.json')
  fs.writeFileSync(states, JSON.stringify(STATUS_OPTIONS))
  const plan = await run(['plan', 'feat-demo', '--workspace-states', states, '--json'], dir)
  assert.strictEqual(plan.code, 0, plan.out)
  const file = path.join(dir, 'plan.json')
  fs.writeFileSync(file, plan.out)
  return run(['apply', 'feat-demo', '--plan', file], dir, adapter)
}

const editProblem = (dir, text) =>
  fs.writeFileSync(overview(dir), fs.readFileSync(overview(dir), 'utf-8').replace(/First version\.|Second version\./, text))

test('a first apply mints the issue and sub-issue with blocks, not the spec', async () => {
  const dir = repo()
  const adapter = fakeAdapter()
  const r = await apply(dir, adapter)
  assert.strictEqual(r.code, 0, r.out)
  const issue = adapter.issues.get('101').description
  assert.ok(issue.startsWith(BEGIN) && issue.endsWith(END), issue)
  assert.match(issue, /First version\./)
  assert.doesNotMatch(issue, /Internal\./)
  const sub = adapter.issues.get('102').description
  assert.strictEqual(sub, `${BEGIN}\na durable place.\n${END}`)
  assert.match(r.out, /round-tripped intact/)
})

test('a later push replaces the block and keeps every byte the team wrote around it', async () => {
  const dir = repo()
  const adapter = fakeAdapter()
  assert.strictEqual((await apply(dir, adapter)).code, 0)
  const above = 'PM context, written on GitHub.\n\n[design](https://x.invalid)\n\n'
  const below = '\n\n![shot](https://github.com/user-attachments/assets/1)\n\nTEXT AT THE BOTTOM\n'
  for (const id of ['101', '102']) {
    const i = adapter.issues.get(id)
    i.description = above + i.description + below
  }
  editProblem(dir, 'Second version.')
  fs.writeFileSync(
    path.join(dir, 'specs', 'in-progress', 'feat-demo', '01-outbox.md'),
    '---\ngithub_issue_id: "#102"\n---\n\n# Phase 1 — Outbox 🔄\n\n**Goal:** a durable, ordered place.\n',
  )
  const r = await apply(dir, adapter)
  assert.strictEqual(r.code, 0, r.out)
  const issue = adapter.issues.get('101').description
  assert.ok(issue.startsWith(above) && issue.endsWith(below), issue)
  assert.match(issue, /Second version\./)
  assert.doesNotMatch(issue, /First version\./)
  const sub = adapter.issues.get('102').description
  assert.strictEqual(sub, `${above}${BEGIN}\na durable, ordered place.\n${END}${below}`)
  // STAYS-SILENT: writing around the block is not editing it.
  assert.doesNotMatch(r.out, /edited on GitHub/)
  assert.match(r.out, /round-tripped intact/)
})

test('an edit inside the block is reported before the push replaces it', async () => {
  const dir = repo()
  const adapter = fakeAdapter()
  assert.strictEqual((await apply(dir, adapter)).code, 0)
  const i = adapter.issues.get('101')
  i.description = i.description.replace('First version.', 'Someone rewrote this.')
  editProblem(dir, 'Second version.')
  const r = await apply(dir, adapter)
  assert.match(r.out, /#101's body was edited on GitHub/)
  assert.match(adapter.issues.get('101').description, /Second version\./)
})

test('a damaged block is left alone and named, never spliced', async () => {
  const dir = repo()
  const adapter = fakeAdapter()
  assert.strictEqual((await apply(dir, adapter)).code, 0)
  const i = adapter.issues.get('101')
  i.description = `${i.description.replace(END, '')}\n\nTeam text.`
  const before = i.description
  editProblem(dir, 'Second version.')
  const r = await apply(dir, adapter)
  assert.match(r.out, /#101: its summary block's delimiters were edited — block not written/)
  assert.strictEqual(adapter.issues.get('101').description, before)
})

test('preserve is a no-op in summary mode — the original stays in the description', async () => {
  const dir = repo()
  fs.writeFileSync(overview(dir), `---\ngithub_identifier: "#101"\n---\n\n${fs.readFileSync(overview(dir), 'utf-8')}`)
  const adapter = fakeAdapter()
  const r = await run(['preserve', 'feat-demo'], dir, adapter)
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /summary mode keeps the original description in place/)
  assert.ok(!adapter.calls.some((c) => c[0] === 'createComment'))
})

test('phases: none mints the issue alone', async () => {
  const dir = repo({ mapping: { description: 'summary', phases: 'none' } })
  const adapter = fakeAdapter()
  const r = await apply(dir, adapter)
  assert.strictEqual(r.code, 0, r.out)
  assert.strictEqual(adapter.issues.size, 1)
})

// STAYS-SILENT: a config without the key pushes the whole spec, as it always did.
test('a config with no mapping.description still pushes the spec', async () => {
  const dir = repo({ mapping: {} })
  const adapter = fakeAdapter()
  assert.strictEqual((await apply(dir, adapter)).code, 0)
  const issue = adapter.issues.get('101').description
  assert.ok(!issue.includes(BEGIN))
  assert.match(issue, /Internal\./)
})
