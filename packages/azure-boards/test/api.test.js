'use strict'

// The REST 7.1 adapter, exercised entirely offline through an injected fetch.

const { test } = require('node:test')
const assert = require('node:assert')

const { makeApiAdapter, AzureRefusal, vsspsUrlOf } = require('../src/api.js')
const { missingOps, adapterOps } = require('@skitterbyte/skitterspec-provider-kit/src/adapter.js')

const ORG = 'https://dev.azure.com/acme'
const PROJECT = 'web'

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
  const a = makeApiAdapter({ orgUrl: ORG, project: PROJECT, token: 'pat', fetch, sleep: async () => {} })
  return { a, calls }
}

const RAW_ITEM = {
  id: 7,
  fields: {
    'System.Title': 'Build the thing',
    'System.Description': '## body\n\n- [ ] words',
    'System.State': 'Doing',
    'System.WorkItemType': 'Issue',
    'System.AssignedTo': { id: 'id-1', displayName: 'Jane Dev', uniqueName: 'jane@acme.test' },
    'System.Tags': 'bug; triage',
  },
  multilineFieldsFormat: { 'System.Description': 'markdown' },
  relations: [
    { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/acme/_apis/wit/workItems/8' },
  ],
}

// The op set the CLI (phase 3) builds on — the contract both transports must
// meet; the MCP adapter may not be missing any of these either. No
// `listTransitions`: Azure has no transition API, state moves are direct
// writes (spec Decision 4).
const REQUIRED_OPS = [
  'readIssue', 'createIssue', 'createSubIssue', 'updateIssue', 'transitionTo',
  'searchIssues', 'listIssueStates', 'readViewer', 'searchUsers',
  'listComments', 'createComment',
]

test('the API adapter fulfils the op contract', () => {
  const { a } = adapter(() => jsonRes({}))
  assert.deepStrictEqual(missingOps(REQUIRED_OPS, a), [])
  assert.ok(adapterOps(a).length >= REQUIRED_OPS.length)
})

test('readIssue normalises at the boundary and batch-reads the children', async () => {
  const { a, calls } = adapter((url) => {
    if (url.includes('/workitemsbatch')) {
      return jsonRes({ value: [{ id: 8, fields: { 'System.Title': 'Phase 1', 'System.State': 'Done' } }] })
    }
    return jsonRes(RAW_ITEM)
  })
  const item = await a.readIssue(7)
  assert.strictEqual(item.identifier, 'AB#7')
  assert.strictEqual(item.url, `${ORG}/${PROJECT}/_workitems/edit/7`)
  assert.strictEqual(item.description, '## body\n\n- [ ] words')
  assert.deepStrictEqual(item.state, { name: 'Doing' })
  assert.strictEqual(item.type, 'Issue')
  assert.deepStrictEqual(item.assignee, { id: 'id-1', name: 'Jane Dev', email: 'jane@acme.test' })
  assert.deepStrictEqual(item.tags, ['bug', 'triage'])
  assert.deepStrictEqual(item.subtasks, [{ id: '8', identifier: 'AB#8', title: 'Phase 1', state: { name: 'Done' } }])
  // URLSearchParams percent-encodes the `$`; Azure accepts either spelling.
  assert.match(calls[0].url, /%24expand=relations/)
  const batchBody = JSON.parse(calls[1].init.body)
  assert.deepStrictEqual(batchBody.ids, [8])
})

test('an HTML-era description is reduced to text at the boundary', async () => {
  const raw = {
    id: 9,
    fields: { 'System.Description': '<div>old <b>body</b></div>', 'System.Title': 't' },
  }
  const { a } = adapter((url) => (url.includes('workitemsbatch') ? jsonRes({ value: [] }) : jsonRes(raw)))
  const item = await a.readIssue(9)
  assert.strictEqual(item.description, 'old body')
})

test('createIssue sends a JSON Patch with the markdown format op and the right media type', async () => {
  const { a, calls } = adapter(() => jsonRes({ id: 42 }))
  const created = await a.createIssue({
    title: 'New spec',
    description: '## md',
    workItemType: 'User Story',
    areaPath: 'web\\team-a',
  })
  assert.deepStrictEqual(created, { id: '42', identifier: 'AB#42', url: `${ORG}/${PROJECT}/_workitems/edit/42` })
  assert.match(calls[0].url, /\/wit\/workitems\/\$User%20Story\?/)
  assert.strictEqual(calls[0].init.headers['Content-Type'], 'application/json-patch+json')
  const ops = JSON.parse(calls[0].init.body)
  assert.deepStrictEqual(ops, [
    { op: 'add', path: '/fields/System.Title', value: 'New spec' },
    { op: 'add', path: '/fields/System.Description', value: '## md' },
    { op: 'add', path: '/multilineFieldsFormat/System.Description', value: 'Markdown' },
    { op: 'add', path: '/fields/System.AreaPath', value: 'web\\team-a' },
  ])
})

test('createSubIssue carries the parent hierarchy relation in the same patch', async () => {
  const { a, calls } = adapter(() => jsonRes({ id: 43 }))
  await a.createSubIssue(42, { title: 'Phase 1', description: '- [ ] a', childType: 'Task' })
  const ops = JSON.parse(calls[0].init.body)
  const rel = ops.find((o) => o.path === '/relations/-')
  assert.deepStrictEqual(rel.value, {
    rel: 'System.LinkTypes.Hierarchy-Reverse',
    url: 'https://dev.azure.com/acme/_apis/wit/workItems/42',
  })
})

test('updateIssue sends only the keys that are present, and nothing for none', async () => {
  const { a, calls } = adapter(() => jsonRes({}))
  await a.updateIssue(7, { title: 'Renamed' })
  assert.deepStrictEqual(JSON.parse(calls[0].init.body), [
    { op: 'add', path: '/fields/System.Title', value: 'Renamed' },
  ])
  const before = calls.length
  await a.updateIssue(7, {})
  assert.strictEqual(calls.length, before)
})

test('transitionTo is idempotent on the current state', async () => {
  const { a, calls } = adapter((url) =>
    url.includes('workitemsbatch') ? jsonRes({ value: [] }) : jsonRes(RAW_ITEM),
  )
  const got = await a.transitionTo(7, 'doing')
  assert.deepStrictEqual(got, { moved: false, already: true })
  // The read happened; no PATCH followed.
  assert.ok(calls.every((c) => (c.init.method || 'GET') !== 'PATCH'))
})

test('transitionTo PATCHes the state directly when it differs', async () => {
  const { a, calls } = adapter((url, init) => {
    if (url.includes('workitemsbatch')) return jsonRes({ value: [] })
    if ((init.method || 'GET') === 'PATCH') return jsonRes({ id: 7 })
    return jsonRes(RAW_ITEM)
  })
  const got = await a.transitionTo(7, 'Done')
  assert.deepStrictEqual(got, { moved: true })
  const patch = calls.find((c) => (c.init.method || 'GET') === 'PATCH')
  assert.deepStrictEqual(JSON.parse(patch.init.body), [
    { op: 'add', path: '/fields/System.State', value: 'Done' },
  ])
})

test('a refused state write becomes a named refusal listing the states the type has', async () => {
  const { a } = adapter((url, init) => {
    if (url.includes('workitemsbatch')) return jsonRes({ value: [] })
    if ((init.method || 'GET') === 'PATCH') {
      return jsonRes(
        { message: "The field 'State' contains the value 'Bogus' that is not in the list of supported values", typeKey: 'RuleValidationException' },
        400,
      )
    }
    if (url.includes('/states')) {
      return jsonRes({ value: [{ name: 'To Do', category: 'Proposed' }, { name: 'Doing', category: 'InProgress' }, { name: 'Done', category: 'Completed' }] })
    }
    return jsonRes(RAW_ITEM)
  })
  await assert.rejects(
    () => a.transitionTo(7, 'Bogus'),
    (err) => {
      assert.ok(err instanceof AzureRefusal)
      assert.match(err.message, /AB#7/)
      assert.match(err.message, /"To Do", "Doing", "Done"/)
      return true
    },
  )
})

test('searchIssues runs WIQL with doubled quotes and batch-reads the hits', async () => {
  const { a, calls } = adapter((url) => {
    if (url.includes('/wiql')) return jsonRes({ workItems: [{ id: 7 }] })
    return jsonRes({ value: [{ id: 7, fields: { 'System.Title': "it's here", 'System.State': 'Doing' } }] })
  })
  const hits = await a.searchIssues({ query: "it's here", workItemType: 'Issue' })
  const wiql = JSON.parse(calls[0].init.body).query
  assert.match(wiql, /\[System\.Title\] CONTAINS 'it''s here'/)
  assert.match(wiql, /\[System\.WorkItemType\] = 'Issue'/)
  assert.strictEqual(hits[0].identifier, 'AB#7')
})

test('listIssueStates returns names with their categories', async () => {
  const { a, calls } = adapter(() =>
    jsonRes({ value: [{ name: 'To Do', category: 'Proposed', color: 'eee' }] }),
  )
  const states = await a.listIssueStates('User Story')
  assert.deepStrictEqual(states, [{ name: 'To Do', category: 'Proposed' }])
  assert.match(calls[0].url, /workitemtypes\/User%20Story\/states/)
})

test('readViewer reads connectionData at the org level', async () => {
  const { a, calls } = adapter(() =>
    jsonRes({
      authenticatedUser: {
        id: 'id-1',
        providerDisplayName: 'Jane Dev',
        properties: { Account: { $value: 'jane@acme.test' } },
      },
    }),
  )
  const me = await a.readViewer()
  assert.deepStrictEqual(me, { id: 'id-1', name: 'Jane Dev', email: 'jane@acme.test' })
  assert.match(calls[0].url, /^https:\/\/dev\.azure\.com\/acme\/_apis\/connectionData/)
})

test('searchUsers hits the vssps host and names the missing scope on 401', async () => {
  const { a } = adapter(() => jsonRes({}, 401))
  await assert.rejects(() => a.searchUsers({ query: 'jane' }), /Identity \(Read\)/)
})

test('searchUsers normalises identities on success', async () => {
  const { a, calls } = adapter(() =>
    jsonRes({ value: [{ id: 'id-2', providerDisplayName: 'Sam', properties: { Account: { $value: 's@a.t' } } }] }),
  )
  const users = await a.searchUsers({ query: 'sam' })
  assert.deepStrictEqual(users, [{ id: 'id-2', name: 'Sam', email: 's@a.t' }])
  assert.match(calls[0].url, /^https:\/\/vssps\.dev\.azure\.com\/acme\/_apis\/identities/)
})

test('comments are listed as text and created as markdown', async () => {
  const { a, calls } = adapter((url, init) => {
    if ((init.method || 'GET') === 'POST') return jsonRes({ id: 5 })
    return jsonRes({ comments: [{ id: 4, text: '<div>html era</div>' }, { id: 5, text: '**md**' }] })
  })
  const comments = await a.listComments(7)
  assert.deepStrictEqual(comments, [{ id: '4', body: 'html era' }, { id: '5', body: '**md**' }])
  const made = await a.createComment(7, '**original**')
  assert.deepStrictEqual(made, { id: '5' })
  const post = calls.find((c) => (c.init.method || 'GET') === 'POST')
  assert.match(post.url, /format=markdown/)
  assert.match(post.url, /api-version=7\.1-preview\.4/)
})

test('401, 403 and 203 are all phrased as credential rejections', async () => {
  for (const status of [401, 403, 203]) {
    const { a } = adapter(() => jsonRes({}, status))
    await assert.rejects(() => a.readIssue(1), /rejected the credentials/)
  }
})

test('a 429 that never recovers is a retryable refusal, not a generic error', async () => {
  const { a } = adapter(() => jsonRes({}, 429))
  await assert.rejects(
    () => a.readIssue(1),
    (err) => err instanceof AzureRefusal && err.retryable === true && err.status === 429,
  )
})

test('an Azure refusal carries its message and typeKey', async () => {
  const { a } = adapter(() => jsonRes({ message: 'TF401232: nope', typeKey: 'WorkItemUnauthorizedException' }, 400))
  await assert.rejects(
    () => a.updateIssue(1, { title: 'x' }),
    (err) => err instanceof AzureRefusal && /TF401232/.test(err.message) && err.typeKey === 'WorkItemUnauthorizedException',
  )
})

test('vsspsUrlOf knows both hosted shapes and refuses the rest', () => {
  assert.strictEqual(vsspsUrlOf('https://dev.azure.com/acme'), 'https://vssps.dev.azure.com/acme')
  assert.strictEqual(vsspsUrlOf('https://acme.visualstudio.com'), 'https://acme.vssps.visualstudio.com')
  assert.strictEqual(vsspsUrlOf('https://ado.internal.example'), null)
})
