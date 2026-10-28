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
  // The id slot carries the assignable uniqueName, not the GUID — see
  // `readViewer answers with the assignable identity first` below.
  assert.deepStrictEqual(me, { id: 'jane@acme.test', name: 'Jane Dev', email: 'jane@acme.test' })
  assert.match(calls[0].url, /^https:\/\/dev\.azure\.com\/acme\/_apis\/connectionData/)
})

test('searchUsers hits the vssps host and names the missing scope on 401', async () => {
  const { a } = adapter(() => jsonRes({}, 401))
  await assert.rejects(() => a.searchUsers('jane'), /Identity \(Read\)/)
})

test('searchUsers returns the kit page shape', async () => {
  const { a, calls } = adapter(() =>
    jsonRes({ value: [{ id: 'id-2', providerDisplayName: 'Sam', properties: { Account: { $value: 's@a.t' } } }] }),
  )
  const page = await a.searchUsers('sam')
  assert.deepStrictEqual(page, {
    users: [{ id: 's@a.t', name: 'Sam', email: 's@a.t', active: true }],
    nextCursor: null,
  })
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

// --- the release carrier (kit release seam, Azure work item impl) --------------

function releaseAdapter(handler) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, init, method: (init && init.method) || 'GET' })
    return handler(url, init, calls)
  }
  const a = makeApiAdapter({ orgUrl: ORG, project: PROJECT, token: 'pat', releaseType: 'Release', fetch, sleep: async () => {} })
  return { a, calls }
}

test('releaseFind looks up by exact title under the release type', async () => {
  const { a, calls } = releaseAdapter((url, init) => {
    if (url.includes('/wiql')) return jsonRes({ workItems: [{ id: 50 }] })
    if (url.includes('workitemsbatch')) return jsonRes({ value: [] })
    return jsonRes({ id: 50, fields: { 'System.Title': 'v1.2.0', 'System.State': 'To Do', 'System.WorkItemType': 'Release', 'System.Description': 'notes' }, multilineFieldsFormat: { 'System.Description': 'markdown' } })
  })
  const release = await a.releaseFind("v1.2.0")
  assert.strictEqual(release.id, '50')
  assert.strictEqual(release.body, 'notes')
  const wiql = JSON.parse(calls[0].init.body).query
  assert.match(wiql, /\[System\.WorkItemType\] = 'Release'/)
  assert.match(wiql, /\[System\.Title\] = 'v1\.2\.0'/)
})

test('releaseFind returns null on none and throws on two', async () => {
  const none = releaseAdapter(() => jsonRes({ workItems: [] }))
  assert.strictEqual(await none.a.releaseFind('v9'), null)
  const two = releaseAdapter(() => jsonRes({ workItems: [{ id: 1 }, { id: 2 }] }))
  await assert.rejects(() => two.a.releaseFind('v9'), /cannot tell which is the release/)
})

test('releaseAttach links only the missing tickets and comments once each', async () => {
  const { a, calls } = releaseAdapter((url, init) => {
    const method = (init && init.method) || 'GET'
    if (url.includes('%24expand=relations') || url.includes('$expand=relations')) {
      return jsonRes({
        id: 50,
        fields: { 'System.Title': 'v1.2.0' },
        relations: [{ rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/acme/_apis/wit/workItems/7' }],
      })
    }
    if (method === 'PATCH') return jsonRes({ id: 50 })
    if (method === 'POST') return jsonRes({ id: 99 })
    return jsonRes({})
  })
  const got = await a.releaseAttach({ id: '50', url: 'u' }, [{ ref: 'AB#7' }, { ref: 'AB#8' }])
  assert.deepStrictEqual(got, { attached: 1, already: 1, tagged: 0 })
  const patch = calls.find((c) => c.method === 'PATCH')
  const rel = JSON.parse(patch.init.body)[0]
  assert.strictEqual(rel.value.url, 'https://dev.azure.com/acme/_apis/wit/workItems/8')
  const comment = calls.find((c) => c.method === 'POST' && c.url.includes('/comments'))
  assert.ok(comment, 'the newly attached ticket got a comment')
  assert.match(comment.url, /workItems\/8\/comments/)
})

// A release item titled v1.2.0 with ticket 7 already linked; `tags` maps a
// ticket id to the System.Tags value the batch read returns for it.
function tagAdapter(tags, opts = {}) {
  const calls = []
  const fetch = async (url, init) => {
    const method = (init && init.method) || 'GET'
    calls.push({ url, init, method })
    if (url.includes('$expand=relations') || url.includes('%24expand=relations')) {
      return jsonRes({
        id: 50,
        fields: { 'System.Title': 'v1.2.0' },
        relations: [{ rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/acme/_apis/wit/workItems/7' }],
      })
    }
    if (url.includes('workitemsbatch')) {
      const ids = JSON.parse(init.body).ids
      return jsonRes({ value: ids.map((id) => ({ id, fields: tags[id] ? { 'System.Tags': tags[id] } : {} })) })
    }
    if (method === 'PATCH') return jsonRes({ id: 1 })
    if (method === 'POST') return jsonRes({ id: 99 })
    return jsonRes({})
  }
  const a = makeApiAdapter({ orgUrl: ORG, project: PROJECT, token: 'pat', releaseType: 'Release', fetch, sleep: async () => {}, ...opts })
  return { a, calls }
}

const tagWrites = (calls) =>
  calls
    .filter((c) => c.method === 'PATCH')
    .map((c) => ({ url: c.url, op: JSON.parse(c.init.body)[0] }))
    .filter((w) => w.op.path === '/fields/System.Tags')

test('releaseAttach tags each ticket with the release, keeping the tags it has', async () => {
  const { a, calls } = tagAdapter({ 8: 'bug; triage' })
  const got = await a.releaseAttach({ id: '50', url: 'u' }, [{ ref: 'AB#8' }])
  assert.deepStrictEqual(got, { attached: 1, already: 0, tagged: 1 })
  const writes = tagWrites(calls)
  assert.strictEqual(writes.length, 1)
  assert.match(writes[0].url, /workitems\/8\b/)
  assert.strictEqual(writes[0].op.value, 'bug; triage; v1.2.0')
})

test('releaseAttach backfills the tag on an already-linked ticket without a second comment', async () => {
  const { a, calls } = tagAdapter({})
  const got = await a.releaseAttach({ id: '50', url: 'u' }, [{ ref: 'AB#7' }])
  assert.deepStrictEqual(got, { attached: 0, already: 1, tagged: 1 })
  assert.strictEqual(tagWrites(calls)[0].op.value, 'v1.2.0')
  assert.ok(!calls.some((c) => c.url.includes('/comments')), 'no comment on a ticket already linked')
})

test('releaseAttach leaves a ticket that already carries the tag alone, in any case', async () => {
  const { a, calls } = tagAdapter({ 7: 'V1.2.0; bug' })
  const got = await a.releaseAttach({ id: '50', url: 'u' }, [{ ref: 'AB#7' }])
  assert.deepStrictEqual(got, { attached: 0, already: 1, tagged: 0 })
  assert.strictEqual(tagWrites(calls).length, 0)
})

test('releaseAttach writes no tags when ticketTag is off', async () => {
  const { a, calls } = tagAdapter({}, { ticketTag: false })
  const got = await a.releaseAttach({ id: '50', url: 'u' }, [{ ref: 'AB#7' }, { ref: 'AB#8' }])
  assert.deepStrictEqual(got, { attached: 1, already: 1 })
  assert.strictEqual(tagWrites(calls).length, 0)
  assert.ok(!calls.some((c) => c.url.includes('workitemsbatch')), 'no tag read either')
})

// Release item 50 at "On Test"; `items` maps a ticket id to its type and its
// current Custom.Deployed value; `allowed` maps a type to its allowed values
// (absent = the type has no such field, a 404).
function stageAdapter({ items, allowed, deployedField = 'Custom.Deployed' }) {
  const calls = []
  const fetch = async (url, init) => {
    const method = (init && init.method) || 'GET'
    calls.push({ url, init, method })
    if (url.includes('workitemsbatch')) {
      const ids = JSON.parse(init.body).ids
      return jsonRes({
        value: ids.map((id) => ({
          id,
          fields: { 'System.WorkItemType': items[id].type, ...(items[id].value ? { 'Custom.Deployed': items[id].value } : {}) },
        })),
      })
    }
    const field = url.match(/workitemtypes\/([^/]+)\/fields\//)
    if (field) {
      const type = decodeURIComponent(field[1])
      return type in allowed ? jsonRes({ referenceName: 'Custom.Deployed', allowedValues: allowed[type] }) : jsonRes({ message: 'nope' }, 404)
    }
    if (method === 'GET' && url.includes('/workitems/50')) {
      return jsonRes({ id: 50, fields: { 'System.State': 'On Test', 'System.WorkItemType': 'Release' } })
    }
    if (method === 'PATCH') return jsonRes({ id: 1 })
    return jsonRes({})
  }
  const a = makeApiAdapter({ orgUrl: ORG, project: PROJECT, token: 'pat', releaseType: 'Release', deployedField, fetch, sleep: async () => {} })
  return { a, calls }
}

const patches = (calls) =>
  calls.filter((c) => c.method === 'PATCH').map((c) => ({ url: c.url, op: JSON.parse(c.init.body)[0] }))

const VALUES = ['On Test', 'On Demo', 'Released']

test('releaseStage sets the Deployed field on each ticket, skipping ones already there', async () => {
  const { a, calls } = stageAdapter({
    items: { 7: { type: 'User Story' }, 8: { type: 'Bug', value: 'On Demo' }, 9: { type: 'User Story', value: 'On Test' } },
    allowed: { 'User Story': VALUES, Bug: VALUES },
  })
  const got = await a.releaseStage({ id: '50' }, 'On Demo', [{ ref: 'AB#7' }, { ref: 'AB#8' }, { ref: 'AB#9' }])
  assert.deepStrictEqual(got, { set: 3 })
  const writes = patches(calls)
  assert.deepStrictEqual(writes.map((w) => w.op.path), ['/fields/System.State', '/fields/Custom.Deployed', '/fields/Custom.Deployed'])
  assert.match(writes[1].url, /workitems\/7\b/)
  assert.match(writes[2].url, /workitems\/9\b/)
  assert.ok(writes.slice(1).every((w) => w.op.value === 'On Demo'))
})

test('releaseStage refuses a value the field does not allow, writing nothing', async () => {
  const { a, calls } = stageAdapter({ items: { 7: { type: 'User Story' } }, allowed: { 'User Story': VALUES } })
  await assert.rejects(
    () => a.releaseStage({ id: '50' }, 'on demo', [{ ref: 'AB#7' }]),
    /"on demo" is not an allowed value of Custom\.Deployed on "User Story" \(allows: "On Test", "On Demo", "Released"\)/,
  )
  assert.strictEqual(patches(calls).length, 0, 'not even the release item moved')
})

test('releaseStage refuses a ticket type without the field, writing nothing', async () => {
  const { a, calls } = stageAdapter({ items: { 7: { type: 'User Story' }, 8: { type: 'Bug' } }, allowed: { 'User Story': VALUES } })
  await assert.rejects(() => a.releaseStage({ id: '50' }, 'On Demo', [{ ref: 'AB#7' }, { ref: 'AB#8' }]), /the "Bug" type has no field "Custom\.Deployed"/)
  assert.strictEqual(patches(calls).length, 0)
})

test('releaseStage without deployedField only moves the release item', async () => {
  const { a, calls } = stageAdapter({ items: { 7: { type: 'User Story' } }, allowed: {}, deployedField: '' })
  const got = await a.releaseStage({ id: '50' }, 'On Demo', [{ ref: 'AB#7' }])
  assert.deepStrictEqual(got, { set: 1 })
  assert.deepStrictEqual(patches(calls).map((w) => w.op.path), ['/fields/System.State'])
  assert.ok(!calls.some((c) => c.url.includes('workitemsbatch') || c.url.includes('/fields/')), 'no ticket reads either')
})

test('releaseComplete moves the item to the Completed-category state, or refuses by name', async () => {
  const { a } = releaseAdapter((url, init) => {
    if (url.includes('/states')) {
      return jsonRes({ value: [{ name: 'To Do', category: 'Proposed' }, { name: 'Shipped', category: 'Completed' }] })
    }
    if (url.includes('workitemsbatch')) return jsonRes({ value: [] })
    if ((init && init.method) === 'PATCH') return jsonRes({ id: 50 })
    return jsonRes({ id: 50, fields: { 'System.State': 'Staged', 'System.WorkItemType': 'Release' } })
  })
  await a.releaseComplete({ id: '50', type: 'Release' })

  const bare = releaseAdapter((url) => {
    if (url.includes('/states')) return jsonRes({ value: [{ name: 'To Do', category: 'Proposed' }] })
    return jsonRes({})
  })
  await assert.rejects(() => bare.a.releaseComplete({ id: '50', type: 'Release' }), /no Completed-category state/)
})

// --- the adoption handoff fixes (bug-azure-boards-adoption-fixes) -------------

test('a markdown description reads back entity-decoded', async () => {
  // Azure stores markdown with stray specials HTML-entity-encoded (observed
  // live: `>` → `&gt;`, `"` → `&quot;`); the read is the inverse of the store.
  const raw = {
    ...RAW_ITEM,
    fields: {
      ...RAW_ITEM.fields,
      'System.Description': '&gt; quote a &lt; b &amp; c &quot;d&quot; &#39;e&#39;',
    },
  }
  const { a } = adapter(() => jsonRes({ ...raw, relations: [] }))
  const item = await a.readIssue('7')
  assert.strictEqual(item.description, '> quote a < b & c "d" \'e\'')
})

test('searchUsers surfaces the assignable identity, not the vssps GUID', async () => {
  // `System.AssignedTo` refuses the identity GUID (live repro); the uniqueName
  // (account email) is what Azure accepts, so that is what `users` must print
  // for `--to` to stamp something writable.
  const { a } = adapter(() =>
    jsonRes({
      value: [
        {
          id: '45635853-aaaa-bbbb-cccc-121212121212',
          providerDisplayName: 'Jane Dev',
          properties: { Account: { $value: 'jane@acme.test' } },
        },
        // No account property: the GUID is the only handle there is, so it stays.
        { id: 'deadbeef-0000-0000-0000-000000000000', providerDisplayName: 'Build Bot' },
      ],
    }),
  )
  const { users } = await a.searchUsers('jane')
  assert.strictEqual(users[0].id, 'jane@acme.test')
  assert.strictEqual(users[0].email, 'jane@acme.test')
  assert.strictEqual(users[1].id, 'deadbeef-0000-0000-0000-000000000000')
})

test('readViewer answers with the assignable identity first', async () => {
  const { a } = adapter(() =>
    jsonRes({
      authenticatedUser: {
        id: '45635853-aaaa-bbbb-cccc-121212121212',
        providerDisplayName: 'Jane Dev',
        properties: { Account: { $value: 'jane@acme.test' } },
      },
    }),
  )
  const viewer = await a.readViewer()
  assert.strictEqual(viewer.id, 'jane@acme.test', 'the id slot carries what System.AssignedTo accepts')
  assert.strictEqual(viewer.email, 'jane@acme.test')
})
