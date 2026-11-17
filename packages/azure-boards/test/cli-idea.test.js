'use strict'

/**
 * `spec-sync idea` on Azure Boards: an idea is a work item tagged
 * `intake.ideaTag`, created with no area path. "Open" comes from the type's
 * state categories, so the test process uses names a stock template would not.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

function repo({ adopted = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'az-idea-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ azure: { orgUrl: 'https://dev.azure.com/acme', project: 'Demo' } }))
  if (adopted) {
    const folder = path.join(dir, 'specs', 'backlog', 'feat-adopted')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, '00-overview.md'), `---\nazure_identifier: "${adopted}"\n---\n\n# A\n`)
  }
  return dir
}

const STATES = [
  { name: 'Parked', category: 'Proposed' },
  { name: 'Busy', category: 'InProgress' },
  { name: 'Shipped', category: 'Completed' },
  { name: 'Binned', category: 'Removed' },
]

function fakeAzure(items = []) {
  const calls = []
  return {
    calls,
    async createIssue(input) {
      calls.push(['createIssue', input])
      return { id: '501', identifier: '#501', url: 'https://dev.azure.com/acme/Demo/_workitems/edit/501' }
    },
    async listIssueStates(type) {
      calls.push(['listIssueStates', type])
      return STATES
    },
    async searchIssues(query) {
      calls.push(['searchIssues', query])
      return items
    },
    async createComment(id, body) {
      calls.push(['createComment', id, body])
    },
    async transitionTo(id, target) {
      calls.push(['transitionTo', id, target])
      return { moved: true }
    },
  }
}

async function run(argv, dir, { adapter, env = {} } = {}) {
  let out = ''
  const code = await specSync(argv, { cwd: dir, adapter, env, out: { write: (s) => (out += s) }, err: { write() {} } })
  return { code, out }
}

test('idea add creates a tagged work item with no area path', async () => {
  const az = fakeAzure()
  const r = await run(['idea', 'add', 'Dark mode\nplease', '--json'], repo(), { adapter: az })
  assert.strictEqual(r.code, 0, r.out)
  const input = az.calls.find((c) => c[0] === 'createIssue')[1]
  assert.deepStrictEqual(input, { title: 'Dark mode', description: 'please', workItemType: 'Issue', tags: ['idea'] })
  assert.strictEqual(JSON.parse(r.out).identifier, '#501')
})

test('idea list reads open states from categories and leaves out adopted ideas', async () => {
  const az = fakeAzure([
    { id: '1', identifier: '#1', title: 'Adopted' },
    { id: '2', identifier: '#2', title: 'Waiting' },
  ])
  const r = await run(['idea', 'list', '--json'], repo({ adopted: '#1' }), { adapter: az })
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual(JSON.parse(r.out).ideas.map((i) => i.identifier), ['#2'])
  const query = az.calls.find((c) => c[0] === 'searchIssues')[1]
  assert.deepStrictEqual([query.tag, query.states], ['idea', ['Parked', 'Busy']])
})

test('idea drop moves the idea to the Removed-category state with a comment', async () => {
  const az = fakeAzure([{ id: '2', identifier: '#2', title: 'Waiting' }])
  const r = await run(['idea', 'drop', '#2', '--reason', 'superseded'], repo(), { adapter: az })
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual(az.calls.find((c) => c[0] === 'transitionTo'), ['transitionTo', '2', 'Binned'])
  assert.match(az.calls.find((c) => c[0] === 'createComment')[2], /superseded/)
})

test('idea drop refuses anything that is not an open idea', async () => {
  const az = fakeAzure([])
  const r = await run(['idea', 'drop', '#9'], repo(), { adapter: az })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /not an open idea/)
  assert.ok(!az.calls.some((c) => c[0] === 'transitionTo'))
})

test('stays silent: without a token a listing exits 0 with no count, and a capture refuses', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'az-idea-home-'))
  const env = { XDG_CONFIG_HOME: home, HOME: home }
  const list = await run(['idea', 'list', '--count', '--json'], repo(), { env })
  assert.strictEqual(list.code, 0, list.out)
  assert.strictEqual(JSON.parse(list.out).count, null)
  const add = await run(['idea', 'add', 'Keep me'], repo(), { env })
  assert.strictEqual(add.code, 1)
  assert.match(add.out, /Keep me/)
})
