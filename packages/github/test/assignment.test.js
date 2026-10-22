'use strict'

// Assignment over GitHub: the kit's `assign` / `whoami` / `users` bound to a
// login, the owner-scoped store, and the repo's assignees.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')
const { makeApiAdapter } = require('../src/api.js')

function repo({ linked = true, config = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-assign-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ github: { owner: 'SkitterByte', repo: 'demo', project: 7 }, ...config }))
  const spec = path.join(dir, 'specs', 'in-progress', 'feat-demo')
  fs.mkdirSync(spec, { recursive: true })
  const fm = linked ? '---\ngithub_identifier: "#101"\n---\n\n' : ''
  fs.writeFileSync(path.join(spec, '00-overview.md'), `${fm}# Demo\n\n## Problem\n\nBody.\n`)
  fs.writeFileSync(path.join(spec, '01-a.md'), '# Phase 1 — A ⬜\n\n**Goal:** a.\n')
  return dir
}
const overview = (dir) => fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')

class Sink {
  constructor() {
    this.text = ''
  }
  write(s) {
    this.text += s
  }
}
async function run(args, dir, io = {}) {
  const out = new Sink()
  const code = await specSync(args, { cwd: dir, out, err: new Sink(), env: { XDG_CONFIG_HOME: io.xdg || fs.mkdtempSync(path.join(os.tmpdir(), 'gh-xdg-')) }, ...io })
  return { code, out: out.text }
}

function fakeAdapter({ assignable = ['skitterbyte', 'teammate'], check = 'ok' } = {}) {
  return {
    async checkAssignable(login) {
      if (check === 'throw') throw new Error('offline')
      return assignable.includes(login)
    },
    async searchUsers(q) {
      return { users: assignable.filter((l) => l.includes(q)).map((l) => ({ id: l, name: l, active: true })), nextCursor: null }
    },
    async readViewer() {
      return { id: 'skitterbyte', login: 'skitterbyte', name: 'Skitter Byte' }
    },
  }
}

test('take it: assign stamps the login and says push next', async () => {
  const dir = repo()
  const r = await run(['assign', 'feat-demo', '--to', 'skitterbyte', '--name', 'Skitter Byte'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /assigned to Skitter Byte \(skitterbyte\) \(#101\)/)
  assert.match(r.out, /next: push it, so GitHub agrees/)
  assert.match(overview(dir), /github_assignee_id: "skitterbyte"/)
  assert.match(overview(dir), /github_assignee_name: "Skitter Byte"/)
})

test('hand it to a teammate, then hand it back', async () => {
  const dir = repo()
  assert.strictEqual((await run(['assign', 'feat-demo', '--to', 'teammate'], dir, { adapter: fakeAdapter() })).code, 0)
  assert.match(overview(dir), /github_assignee_id: "teammate"/)
  const back = await run(['assign', 'feat-demo', '--release'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(back.code, 0)
  assert.match(back.out, /released \(#101\)/)
  assert.match(back.out, /so GitHub is unassigned too/)
  assert.doesNotMatch(overview(dir), /github_assignee_id/)
})

test('a login that is not a collaborator is a named refusal, and nothing is written', async () => {
  const dir = repo()
  const r = await run(['assign', 'feat-demo', '--to', 'stranger'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /stranger cannot be assigned in SkitterByte\/demo — only collaborators can/)
  assert.doesNotMatch(overview(dir), /github_assignee_id/)
})

test('a check that cannot run is a cannot-tell: the stamp proceeds', async () => {
  const dir = repo()
  const r = await run(['assign', 'feat-demo', '--to', 'stranger'], dir, { adapter: fakeAdapter({ check: 'throw' }) })
  assert.strictEqual(r.code, 0, r.out)
  const noToken = repo()
  assert.strictEqual((await run(['assign', 'feat-demo', '--to', 'stranger'], noToken)).code, 0)
})

test('an unlinked spec, or a repo that declined assignee, refuses', async () => {
  const unlinked = await run(['assign', 'feat-demo', '--to', 'skitterbyte'], repo({ linked: false }), { adapter: fakeAdapter() })
  assert.strictEqual(unlinked.code, 1)
  assert.match(unlinked.out, /not linked to GitHub/)
  const declined = await run(['assign', 'feat-demo', '--to', 'skitterbyte'], repo({ config: { sync: { fieldOwnership: { assignee: 'none' } } } }), {
    adapter: fakeAdapter(),
  })
  assert.strictEqual(declined.code, 1)
  assert.match(declined.out, /does not own the assignee field/)
})

test('whoami derives the login from the token and caches it under the owner', async () => {
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-xdg-'))
  const dir = repo()
  const first = await run(['whoami'], dir, { adapter: fakeAdapter(), xdg })
  assert.strictEqual(first.code, 0, first.out)
  assert.match(first.out, /Skitter Byte <skitterbyte>/)
  assert.match(first.out, /owner:  github\.com\/skitterbyte/)
  assert.match(first.out, /derived from the token/)
  const second = await run(['whoami', '--json'], dir, { xdg })
  assert.deepStrictEqual(
    (({ id, source, owner }) => ({ id, source, owner }))(JSON.parse(second.out)),
    { id: 'skitterbyte', source: 'store', owner: 'github.com/skitterbyte' },
  )
})

test('whoami with no token is an unknown, exit 0, naming --set <login>', async () => {
  const r = await run(['whoami'], repo())
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /unknown/)
  assert.match(r.out, /whoami --set <login>/)
})

test('users lists the assignable people, filtered by the query', async () => {
  const r = await run(['users', 'team'], repo(), { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /1 match\(es\)/)
  assert.match(r.out, /teammate <teammate>/)
})

test('a stamped assignee rides out on the next apply', async () => {
  const dir = repo()
  await run(['assign', 'feat-demo', '--to', 'skitterbyte'], dir, { adapter: fakeAdapter() })
  const states = path.join(dir, 's.json')
  fs.writeFileSync(states, JSON.stringify(['Backlog', 'In Progress', 'Done', 'Cancelled']))
  const plan = await run(['plan', 'feat-demo', '--workspace-states', states, '--json'], dir)
  assert.strictEqual(JSON.parse(plan.out).issue.assignee, 'skitterbyte')
})

// --- the adapter half ---------------------------------------------------------

const res = (body, status = 200) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body })

test('searchUsers reads the repo assignees and filters by login', async () => {
  const a = makeApiAdapter({
    owner: 'o',
    repo: 'r',
    token: 't',
    fetch: async (url) => {
      assert.match(url, /\/repos\/o\/r\/assignees\?/)
      return res([{ login: 'Alice' }, { login: 'bob' }])
    },
  })
  assert.deepStrictEqual((await a.searchUsers('ali')).users.map((u) => u.id), ['Alice'])
})

test('checkAssignable: 204 yes, 404 no, anything else throws (cannot tell)', async () => {
  const at = (status) => makeApiAdapter({ owner: 'o', repo: 'r', token: 't', sleep: async () => {}, fetch: async () => res({}, status) })
  assert.strictEqual(await at(204).checkAssignable('a'), true)
  assert.strictEqual(await at(404).checkAssignable('a'), false)
  await assert.rejects(at(502).checkAssignable('a'), /answered 502/)
})
