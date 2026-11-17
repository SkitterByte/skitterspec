'use strict'

/**
 * `spec-sync idea` on Linear: an idea is an issue in the team carrying
 * `intake.ideaLabel`, in no project. A fake adapter stands in for Linear.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const KEY = { LINEAR_API_KEY: 'lin_api_test' }

function repo({ adopted = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-idea-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1', projectId: 'P1' } }), 'utf-8')
  if (adopted) {
    const folder = path.join(dir, 'specs', 'backlog', 'feat-adopted')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, '00-overview.md'), `---\nlinear_identifier: "${adopted}"\n---\n\n# A\n`, 'utf-8')
  }
  return dir
}

function fakeLinear({ labels = [{ id: 'L-idea', name: 'idea' }] } = {}) {
  const calls = []
  const ideas = []
  return {
    calls,
    ideas,
    async listLabels(teamId) {
      calls.push(['listLabels', teamId])
      return labels
    },
    async createIssue(input) {
      calls.push(['createIssue', input])
      const identifier = `SKS-${100 + ideas.length}`
      const made = { id: `uuid-${identifier}`, identifier, url: `https://linear.app/x/${identifier}`, title: input.title }
      ideas.push(made)
      return made
    },
    async searchIssues(query) {
      calls.push(['searchIssues', query])
      return ideas
    },
    async listIssueStates() {
      return [
        { id: 's-b', name: 'Backlog', type: 'backlog' },
        { id: 's-c', name: 'Canceled', type: 'canceled' },
      ]
    },
    async createComment(id, body) {
      calls.push(['createComment', id, body])
    },
    async updateIssue(id, updates) {
      calls.push(['updateIssue', id, updates])
    },
  }
}

async function run(argv, dir, { adapter, env = KEY } = {}) {
  let out = ''
  const code = await specSync(argv, { cwd: dir, adapter, env, out: { write: (s) => (out += s) }, err: { write() {} } })
  return { code, out }
}

test('idea add files a labelled issue in the team and in no project', async () => {
  const linear = fakeLinear()
  const r = await run(['idea', 'add', 'Dark mode\nfor the review page', '--json'], repo(), { adapter: linear })
  assert.strictEqual(r.code, 0, r.out)
  const input = linear.calls.find((c) => c[0] === 'createIssue')[1]
  assert.deepStrictEqual(input, { teamId: 'T1', title: 'Dark mode', description: 'for the review page', labelIds: ['L-idea'] })
  assert.ok(!('projectId' in input), 'an idea belongs to no project')
  assert.strictEqual(JSON.parse(r.out).identifier, 'SKS-100')
})

test('idea add refuses with the text back when the team has no idea label', async () => {
  const r = await run(['idea', 'add', 'Keep me'], repo(), { adapter: fakeLinear({ labels: [] }) })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /no "idea" label/)
  assert.match(r.out, /Keep me/)
})

test('idea list asks for open ideas only and leaves out adopted ones', async () => {
  const linear = fakeLinear()
  linear.ideas.push({ id: 'u1', identifier: 'SKS-1', title: 'Adopted' }, { id: 'u2', identifier: 'SKS-2', title: 'Waiting' })
  const r = await run(['idea', 'list', '--json'], repo({ adopted: 'SKS-1' }), { adapter: linear })
  assert.deepStrictEqual(JSON.parse(r.out).ideas.map((i) => i.identifier), ['SKS-2'])
  assert.deepStrictEqual(linear.calls.find((c) => c[0] === 'searchIssues')[1], { label: 'idea', teamId: 'T1', openOnly: true })
})

test('idea drop moves the idea to the cancelled state with the reason as a comment', async () => {
  const linear = fakeLinear()
  linear.ideas.push({ id: 'u2', identifier: 'SKS-2', title: 'Waiting' })
  const r = await run(['idea', 'drop', 'SKS-2', '--reason', 'not worth it'], repo(), { adapter: linear })
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual(linear.calls.find((c) => c[0] === 'updateIssue'), ['updateIssue', 'u2', { stateId: 's-c' }])
  assert.match(linear.calls.find((c) => c[0] === 'createComment')[2], /not worth it/)
})

test('idea drop refuses anything that is not an open idea', async () => {
  const linear = fakeLinear()
  const r = await run(['idea', 'drop', 'SKS-9'], repo(), { adapter: linear })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /not an open idea/)
  assert.ok(!linear.calls.some((c) => c[0] === 'updateIssue'))
})

test('stays silent: without a key a listing exits 0 with no count, and a capture refuses', async () => {
  // A private config home, so a key stored on this machine cannot answer.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-idea-home-'))
  const env = { XDG_CONFIG_HOME: home, HOME: home }
  const list = await run(['idea', 'list', '--count', '--json'], repo(), { env })
  assert.strictEqual(list.code, 0)
  assert.strictEqual(JSON.parse(list.out).count, null)
  const add = await run(['idea', 'add', 'Keep me'], repo(), { env })
  assert.strictEqual(add.code, 1)
  assert.match(add.out, /Keep me/)
})
