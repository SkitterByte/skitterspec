'use strict'

// The REST v3 adapter, exercised entirely offline through an injected fetch.

const { test } = require('node:test')
const assert = require('node:assert')

const { makeApiAdapter, JiraRefusal } = require('../src/api.js')
const { missingOps, adapterOps } = require('@skitterbyte/skitterspec-provider-kit/src/adapter.js')

const SITE = 'https://acme.atlassian.net'

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
})

function adapter(handler) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, init })
    return handler(url, init, calls.length)
  }
  const a = makeApiAdapter({ siteUrl: SITE, email: 'a@b.c', token: 'tok', fetch, sleep: async () => {} })
  return { a, calls }
}

const RAW_ISSUE = {
  id: '10001',
  key: 'PROJ-7',
  fields: {
    summary: 'Build the thing',
    description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body words' }] }] },
    status: { name: 'In Progress' },
    assignee: { accountId: 'acc-1', displayName: 'Jane Dev' },
    parent: null,
    subtasks: [
      { id: '10002', key: 'PROJ-8', fields: { summary: 'Phase 1', status: { name: 'Done' } } },
    ],
  },
}

// The op set the CLI (phase 4) builds on — the contract both transports must
// meet; the MCP adapter may not be missing any of these either.
const REQUIRED_OPS = [
  'readIssue', 'createIssue', 'createSubIssue', 'updateIssue', 'transitionTo',
  'listTransitions', 'searchIssues', 'listIssueStates', 'readViewer',
  'listComments', 'createComment',
]

test('the API adapter fulfils the op contract', () => {
  const { a } = adapter(() => jsonRes({}))
  assert.deepStrictEqual(missingOps(REQUIRED_OPS, a), [])
  assert.ok(adapterOps(a).length >= REQUIRED_OPS.length)
})

test('readIssue normalises at the boundary — ADF becomes text, status a name', async () => {
  const { a, calls } = adapter(() => jsonRes(RAW_ISSUE))
  const issue = await a.readIssue('PROJ-7')
  assert.strictEqual(issue.identifier, 'PROJ-7')
  assert.strictEqual(issue.url, `${SITE}/browse/PROJ-7`)
  assert.strictEqual(issue.description, 'body words')
  assert.deepStrictEqual(issue.state, { name: 'In Progress' })
  assert.deepStrictEqual(issue.assignee, { id: 'acc-1', name: 'Jane Dev' })
  assert.strictEqual(issue.subtasks[0].identifier, 'PROJ-8')
  assert.match(calls[0].url, /\/rest\/api\/3\/issue\/PROJ-7/)
  assert.match(calls[0].init.headers.Authorization, /^Basic /)
})

test('readIssue is null on 404, never a throw', async () => {
  const { a } = adapter(() => jsonRes({ errorMessages: ['gone'] }, 404))
  assert.strictEqual(await a.readIssue('PROJ-404'), null)
})

test('createIssue sends project, type and an ADF description; returns key + url', async () => {
  const { a, calls } = adapter(() => jsonRes({ id: '10009', key: 'PROJ-9' }, 201))
  const created = await a.createIssue({
    title: 'New spec',
    description: '# Body\n\nwords',
    projectKey: 'PROJ',
    issueTypeName: 'Task',
  })
  assert.deepStrictEqual(created, { id: '10009', identifier: 'PROJ-9', url: `${SITE}/browse/PROJ-9` })
  const body = JSON.parse(calls[0].init.body)
  assert.deepStrictEqual(body.fields.project, { key: 'PROJ' })
  assert.deepStrictEqual(body.fields.issuetype, { name: 'Task' })
  assert.strictEqual(body.fields.summary, 'New spec')
  assert.strictEqual(body.fields.description.type, 'doc')
})

test('createSubIssue carries the parent and the subtask type', async () => {
  const { a, calls } = adapter(() => jsonRes({ id: '10010', key: 'PROJ-10' }, 201))
  await a.createSubIssue('10001', { title: 'Phase 2', description: 'goal', projectKey: 'PROJ', subtaskTypeName: 'Subtask' })
  const body = JSON.parse(calls[0].init.body)
  assert.deepStrictEqual(body.fields.parent, { id: '10001' })
  assert.deepStrictEqual(body.fields.issuetype, { name: 'Subtask' })
})

test('updateIssue sends only what is present; a null assignee clears', async () => {
  const { a, calls } = adapter(() => jsonRes({}, 204))
  await a.updateIssue('PROJ-7', { description: 'new body', assigneeId: null })
  const body = JSON.parse(calls[0].init.body)
  assert.strictEqual(body.fields.summary, undefined, 'an absent title says nothing')
  assert.strictEqual(body.fields.description.type, 'doc')
  assert.strictEqual(body.fields.assignee, null)
})

test('updateIssue with nothing to say makes no request', async () => {
  const { a, calls } = adapter(() => jsonRes({}))
  await a.updateIssue('PROJ-7', {})
  assert.strictEqual(calls.length, 0)
})

test('transitionTo applies the transition landing on the target status', async () => {
  const routed = adapter((url, init) => {
    if (url.includes('/transitions') && init.method === 'GET') {
      return jsonRes({ transitions: [
        { id: '11', name: 'Start work', to: { name: 'In Progress' } },
        { id: '21', name: 'Close', to: { name: 'Done' } },
      ] })
    }
    if (url.includes('/transitions') && init.method === 'POST') return jsonRes({}, 204)
    return jsonRes(RAW_ISSUE)
  })
  const r = await routed.a.transitionTo('PROJ-7', 'done')
  assert.deepStrictEqual(r, { moved: true, via: 'Close' })
  const post = routed.calls.find((c) => c.init.method === 'POST')
  assert.deepStrictEqual(JSON.parse(post.init.body), { transition: { id: '21' } })
})

test('transitionTo is idempotent when the issue already sits on the target', async () => {
  const already = adapter((url) => {
    if (url.includes('/transitions')) return jsonRes({ transitions: [] })
    return jsonRes({ ...RAW_ISSUE, fields: { ...RAW_ISSUE.fields, status: { name: 'In Progress' } } })
  })
  const r = await already.a.transitionTo('PROJ-7', 'In Progress')
  assert.deepStrictEqual(r, { moved: false, already: true })
})

test('an unreachable status refuses loudly, naming what IS available', async () => {
  const { a } = adapter((url) => {
    if (url.includes('/transitions')) {
      return jsonRes({ transitions: [{ id: '11', name: 'Start work', to: { name: 'In Progress' } }] })
    }
    return jsonRes(RAW_ISSUE)
  })
  await assert.rejects(
    () => a.transitionTo('PROJ-7', 'Shipped'),
    (err) => {
      assert.ok(err instanceof JiraRefusal)
      assert.match(err.message, /no transition .*reaches "Shipped"/)
      assert.match(err.message, /"In Progress"/)
      assert.match(err.message, /does not path-find/)
      return true
    },
  )
})

test('searchIssues escapes quotes into the JQL and scopes to the project', async () => {
  const { a, calls } = adapter(() => jsonRes({ issues: [{ id: '1', key: 'PROJ-1', fields: { summary: 'T', status: { name: 'To Do' } } }] }))
  const found = await a.searchIssues({ query: 'say "hello"', projectKey: 'PROJ' })
  assert.strictEqual(found[0].identifier, 'PROJ-1')
  const jql = new URL(calls[0].url).searchParams.get('jql')
  assert.strictEqual(jql, 'project = "PROJ" AND summary ~ "say \\"hello\\""')
})

test('listIssueStates dedupes status names across issue types', async () => {
  const { a } = adapter(() => jsonRes([
    { name: 'Task', statuses: [{ id: '1', name: 'To Do' }, { id: '3', name: 'Done' }] },
    { name: 'Subtask', statuses: [{ id: '1', name: 'To Do' }, { id: '2', name: 'In Progress' }] },
  ]))
  const states = await a.listIssueStates('PROJ')
  assert.deepStrictEqual(states.map((s) => s.name), ['To Do', 'Done', 'In Progress'])
})

test('readViewer maps accountId and displayName', async () => {
  const { a } = adapter(() => jsonRes({ accountId: 'acc-9', displayName: 'Sam Ops', emailAddress: 's@o.p' }))
  assert.deepStrictEqual(await a.readViewer(), { id: 'acc-9', name: 'Sam Ops', email: 's@o.p' })
})

test('a 429 waits (honouring Retry-After) and then succeeds', async () => {
  const waits = []
  let n = 0
  const fetch = async () => {
    n++
    if (n === 1) return { ok: false, status: 429, headers: { get: (h) => (h === 'retry-after' ? '2' : null) }, json: async () => ({}) }
    return jsonRes(RAW_ISSUE)
  }
  const a = makeApiAdapter({ siteUrl: SITE, email: 'a@b.c', token: 't', fetch, sleep: async (ms) => waits.push(ms) })
  const issue = await a.readIssue('PROJ-7')
  assert.strictEqual(issue.identifier, 'PROJ-7')
  assert.deepStrictEqual(waits, [2000])
})

test('a 429 that never recovers is a RETRYABLE refusal', async () => {
  const fetch = async () => ({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })
  const a = makeApiAdapter({ siteUrl: SITE, email: 'a@b.c', token: 't', fetch, sleep: async () => {}, maxRetries: 2 })
  await assert.rejects(
    () => a.readIssue('PROJ-7'),
    (err) => err instanceof JiraRefusal && err.retryable === true,
  )
})

test('401 is phrased for the human holding the token', async () => {
  const { a } = adapter(() => jsonRes({}, 401))
  await assert.rejects(() => a.readIssue('PROJ-7'), /rejected the credentials .*check the email and API token/)
})

test("Jira's own refusal carries its errorMessages and field errors", async () => {
  const { a } = adapter(() => jsonRes({ errorMessages: ['issuetype required'], errors: { summary: 'too long' } }, 400))
  await assert.rejects(
    () => a.createIssue({ title: 'x', projectKey: 'P', issueTypeName: 'T' }),
    (err) => {
      assert.ok(err instanceof JiraRefusal)
      assert.match(err.message, /issuetype required/)
      assert.match(err.message, /summary: too long/)
      return true
    },
  )
})

test('comments round-trip through ADF at the boundary', async () => {
  const { a, calls } = adapter((url, init) => {
    if (init.method === 'POST') return jsonRes({ id: '501' }, 201)
    return jsonRes({ comments: [{ id: '500', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'original report' }] }] } }] })
  })
  const list = await a.listComments('PROJ-7')
  assert.deepStrictEqual(list, [{ id: '500', body: 'original report' }])
  const created = await a.createComment('PROJ-7', '**Original report**\n\nkept words')
  assert.deepStrictEqual(created, { id: '501' })
  const body = JSON.parse(calls[1].init.body)
  assert.strictEqual(body.body.type, 'doc')
})

test('no error message ever carries the token', async () => {
  const { a } = adapter(() => jsonRes({ errorMessages: ['bad'] }, 400))
  try {
    await a.createIssue({ title: 'x', projectKey: 'P', issueTypeName: 'T' })
    assert.fail('should refuse')
  } catch (err) {
    assert.doesNotMatch(String(err.message), /tok/)
    assert.doesNotMatch(String(err.stack || ''), /Basic /)
  }
})
