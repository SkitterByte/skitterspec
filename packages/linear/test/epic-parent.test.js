'use strict'

// Epics on Linear (spec feat-epics, phase 6): a member's issue gets its epic's
// as its parent, and `spec-sync list` shows members under their epic even
// though its parentless query cannot return them.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { makeApiAdapter } = require('../src/api.js')
const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

// --- the adapter ---------------------------------------------------------------

// A Linear whose issue reads answer from `issues` (by uuid or identifier) and
// whose issueUpdate moves the parent — or, with `stick: false`, does not.
function linearFetch(issues, { stick = true } = {}) {
  const writes = []
  const find = (id) => Object.values(issues).find((i) => i.id === id || i.identifier === id)
  const fetch = async (_url, init) => {
    const { query, variables } = JSON.parse(init.body)
    let data
    if (/issueUpdate/.test(query)) {
      writes.push(variables)
      if (stick) find(variables.id).parent = { id: variables.input.parentId }
      data = { issueUpdate: { success: true, issue: find(variables.id) } }
    } else data = { issue: find(variables.id) || null }
    return { ok: true, status: 200, json: async () => ({ data: JSON.parse(JSON.stringify(data)) }) }
  }
  return { fetch, writes }
}

const issues = (memberParent = null) => ({
  epic: { id: 'u-epic', identifier: 'SKI-1', parent: null },
  other: { id: 'u-other', identifier: 'SKI-9', parent: null },
  member: { id: 'u-member', identifier: 'SKI-2', parent: memberParent ? { id: memberParent } : null },
})

test('setParent puts the member under its epic by uuid, and reads it back', async () => {
  const { fetch, writes } = linearFetch(issues())
  const a = makeApiAdapter({ apiKey: 'k', fetch })
  assert.deepStrictEqual(await a.setParent('u-member', 'SKI-1'), { changed: true, moved: false })
  assert.deepStrictEqual(writes, [{ id: 'u-member', input: { parentId: 'u-epic' } }])
})

test('setParent leaves a member already under that epic alone', async () => {
  const { fetch, writes } = linearFetch(issues('u-epic'))
  const a = makeApiAdapter({ apiKey: 'k', fetch })
  assert.deepStrictEqual(await a.setParent('u-member', 'SKI-1'), { changed: false })
  assert.deepStrictEqual(writes, [])
})

test('setParent moves a member that changed epics', async () => {
  const { fetch } = linearFetch(issues('u-other'))
  const a = makeApiAdapter({ apiKey: 'k', fetch })
  assert.deepStrictEqual(await a.setParent('u-member', 'SKI-1'), { changed: true, moved: true })
})

test('setParent refuses when Linear reads back another parent', async () => {
  const { fetch } = linearFetch(issues(), { stick: false })
  const a = makeApiAdapter({ apiKey: 'k', fetch })
  await assert.rejects(a.setParent('u-member', 'SKI-1'), /was put under SKI-1 but Linear reads it back elsewhere/)
})

// --- the CLI -------------------------------------------------------------------

const STATES = [
  { id: 's-backlog', name: 'Backlog' },
  { id: 's-progress', name: 'In Progress' },
  { id: 's-done', name: 'Done' },
  { id: 's-cancel', name: 'Canceled' },
]

function repo({ epicId = 'SKI-1' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-epic-'))
  fs.mkdirSync(path.dirname(path.join(dir, CONFIG_FILE)), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ linear: { teamId: 'T1' } }))
  const write = (spec, text) => {
    fs.mkdirSync(path.join(dir, 'specs', 'backlog', spec), { recursive: true })
    fs.writeFileSync(path.join(dir, 'specs', 'backlog', spec, '00-overview.md'), text)
  }
  write('epic-library', `${epicId ? `---\nlinear_identifier: "${epicId}"\n---\n\n` : ''}# Library\n\n> **Type:** Epic\n`)
  write('feat-gen', '# Gen\n\n> **Epic:** epic-library\n\n## Problem\n\nP.\n')
  return dir
}

function fakeLinear() {
  let seq = 10
  const store = new Map()
  const calls = []
  const put = (i) => {
    store.set(i.id, i)
    store.set(i.identifier, i)
    return i
  }
  put({ id: 'u-1', identifier: 'SKI-1', title: 'Library', state: STATES[0], parent: null })
  return {
    calls,
    store,
    put,
    async listIssueStates() {
      return STATES
    },
    async createIssue(input) {
      seq++
      return put({ id: `u-${seq}`, identifier: `SKI-${seq}`, url: `https://l/SKI-${seq}`, title: input.title, description: input.description, parent: null })
    },
    async updateIssue(id, input) {
      return put({ ...store.get(id), ...input })
    },
    async readIssue(id) {
      return store.get(id) || null
    },
    async searchIssues() {
      return []
    },
    async setParent(ref, parentRef) {
      calls.push(['setParent', ref, parentRef])
      const i = store.get(ref)
      const p = store.get(parentRef)
      if (i.parent && i.parent.id === p.id) return { changed: false }
      i.parent = { id: p.id }
      return { changed: true }
    },
  }
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

async function push(dir, spec, adapter) {
  const states = path.join(dir, 'states.json')
  fs.writeFileSync(states, JSON.stringify(STATES.map((st) => st.name)))
  const planned = await run(['plan', spec, '--workspace-states', states, '--json'], dir, adapter)
  assert.strictEqual(planned.code, 0, planned.out)
  const file = path.join(dir, 'plan.json')
  fs.writeFileSync(file, planned.out)
  return run(['apply', spec, '--plan', file], dir, adapter)
}

test('a member is minted and put under its epic', async () => {
  const dir = repo()
  const linear = fakeLinear()
  const r = await push(dir, 'feat-gen', linear)
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual(linear.calls.map((c) => c[2]), ['SKI-1'])
  assert.match(r.out, /parent set: SKI-\d+ under epic SKI-1/)
})

test('an unlinked epic is named and skipped, never minted', async () => {
  const dir = repo({ epicId: null })
  const linear = fakeLinear()
  const r = await push(dir, 'feat-gen', linear)
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /epic epic-library is not linked yet — parent skipped/)
  assert.deepStrictEqual(linear.calls, [])
})
