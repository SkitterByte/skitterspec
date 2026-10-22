'use strict'

// The GitHub adapter, exercised entirely offline through an injected fetch.
// The GraphQL shapes here are the ones the adapter assumes; phase 7's live
// smoke is what confirms GitHub agrees.

const { test } = require('node:test')
const assert = require('node:assert')

const { makeApiAdapter, GitHubRefusal, numberOf, isLimited } = require('../src/api.js')
const { missingOps, adapterOps } = require('@skitterbyte/skitterspec-provider-kit/src/adapter.js')

const headers = (h = {}) => ({ get: (k) => (k.toLowerCase() in h ? h[k.toLowerCase()] : null) })
const res = (body, status = 200, h = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: headers(h),
  json: async () => body,
})

function adapter(handler, opts = {}) {
  const calls = []
  const fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : undefined
    const call = { url, method: init.method, body, auth: init.headers.Authorization }
    calls.push(call)
    return handler(call, calls.length)
  }
  const a = makeApiAdapter({
    owner: 'SkitterByte',
    repo: 'skitterspec',
    project: 7,
    token: 'tok',
    fetch,
    sleep: async () => {},
    now: () => 0,
    ...opts,
  })
  return { a, calls }
}

const isGraphql = (call) => call.url.endsWith('/graphql')
const gqlKind = (call) =>
  /addProjectV2ItemById/.test(call.body.query)
    ? 'add'
    : /updateProjectV2ItemFieldValue/.test(call.body.query)
      ? 'set'
      : /repositoryOwner/.test(call.body.query)
        ? 'board'
        : 'issue'

const BOARD = {
  data: {
    repositoryOwner: {
      __typename: 'User',
      projectV2: {
        id: 'PVT_1',
        title: 'skitterspec',
        url: 'https://github.com/users/SkitterByte/projects/7',
        fields: {
          nodes: [
            { id: 'F_title', name: 'Title' },
            {
              id: 'F_status',
              name: 'Status',
              options: [
                { id: 'o_back', name: 'Backlog' },
                { id: 'o_prog', name: 'In Progress' },
                { id: 'o_done', name: 'Done' },
              ],
            },
            { id: 'F_dep', name: 'Deployed', options: [{ id: 'o_test', name: 'Test' }] },
          ],
        },
      },
    },
  },
}

function rawIssue({ number = 12, onBoard = true, status = 'In Progress', owner = 'SkitterByte' } = {}) {
  return {
    id: `I_${number}`,
    databaseId: 9000 + number,
    number,
    title: 'Build the thing',
    body: '- [ ] task',
    url: `https://github.com/SkitterByte/skitterspec/issues/${number}`,
    state: 'OPEN',
    stateReason: null,
    assignees: { nodes: [{ login: 'skitterbyte', name: 'Skitter Byte' }] },
    labels: { nodes: [{ name: 'spec' }] },
    parent: null,
    subIssues: { nodes: [{ number: 13, title: 'Phase 1', state: 'CLOSED' }] },
    projectItems: {
      nodes: [
        // Same board NUMBER, different owner: must not be mistaken for ours.
        { id: 'PVTI_other', project: { id: 'PVT_x', number: 7, owner: { login: 'someone-else' } }, fieldValueByName: { name: 'Done' } },
        ...(onBoard
          ? [{ id: 'PVTI_12', project: { id: 'PVT_1', number: 7, owner: { login: owner } }, fieldValueByName: status ? { name: status } : null }]
          : []),
      ],
    },
  }
}

const issueData = (raw) => ({ data: { repository: { issue: raw } } })

// The op set the CLI (phase 3) builds on. The MCP adapter must not be missing
// any of these either.
const REQUIRED_OPS = [
  'readIssue', 'createIssue', 'createSubIssue', 'updateIssue', 'setIssueOpen',
  'listSubIssues', 'searchIssues', 'listIssueStates', 'resolveBoard', 'addToBoard',
  'setStatus', 'setFieldOption', 'readViewer', 'listLabels', 'listComments', 'createComment',
]

test('the API adapter fulfils the op contract', () => {
  const { a } = adapter(() => res({}))
  assert.deepStrictEqual(missingOps(REQUIRED_OPS, a), [])
  assert.ok(adapterOps(a).length >= REQUIRED_OPS.length)
})

test('a repo is required up front', () => {
  assert.throws(() => makeApiAdapter({ owner: '', repo: 'x', token: 't', fetch: async () => res({}) }), /github\.owner/)
})

test('numberOf accepts #N, N and an issue, and refuses anything else', () => {
  assert.strictEqual(numberOf('#12'), 12)
  assert.strictEqual(numberOf(' 12 '), 12)
  assert.strictEqual(numberOf(12), 12)
  assert.strictEqual(numberOf({ number: 5 }), 5)
  assert.throws(() => numberOf('SKS-12'), /not a GitHub issue reference/)
})

// --- reads --------------------------------------------------------------------

test('readIssue normalises at the boundary — the board Status is the state', async () => {
  const { a, calls } = adapter(() => res(issueData(rawIssue())))
  const got = await a.readIssue('#12')
  assert.strictEqual(calls[0].auth, 'Bearer tok')
  assert.deepStrictEqual(calls[0].body.variables, { owner: 'SkitterByte', repo: 'skitterspec', number: 12, status: 'Status' })
  assert.deepStrictEqual(
    { id: got.id, identifier: got.identifier, state: got.state, open: got.open, onBoard: got.onBoard, item: got.boardItemId },
    { id: '12', identifier: '#12', state: { name: 'In Progress' }, open: true, onBoard: true, item: 'PVTI_12' },
  )
  assert.deepStrictEqual(got.assignee, { id: 'skitterbyte', name: 'Skitter Byte' })
  assert.deepStrictEqual(got.subtasks, [{ id: '13', identifier: '#13', title: 'Phase 1', open: false }])
  assert.strictEqual(got.description, '- [ ] task')
})

test("an issue on another owner's board 7 is not on ours", async () => {
  const { a } = adapter(() => res(issueData(rawIssue({ onBoard: false }))))
  const got = await a.readIssue(12)
  assert.strictEqual(got.onBoard, false)
  assert.strictEqual(got.state, null, 'off our board there is no state — not the other board\'s "Done"')
})

test('the board owner matches case-insensitively', async () => {
  const { a } = adapter(() => res(issueData(rawIssue({ owner: 'skitterbyte' }))))
  assert.strictEqual((await a.readIssue(12)).onBoard, true)
})

test('a missing issue reads as null, not a refusal', async () => {
  const { a } = adapter(() =>
    res({ data: { repository: { issue: null } }, errors: [{ type: 'NOT_FOUND', message: 'Could not resolve' }] }),
  )
  assert.strictEqual(await a.readIssue(404), null)
})

test('an empty body is the empty text', async () => {
  const { a } = adapter(() => res(issueData({ ...rawIssue(), body: null })))
  assert.strictEqual((await a.readIssue(12)).description, '')
})

// --- writes -------------------------------------------------------------------

test('createIssue sends only what it was given, with labels and no type by default', async () => {
  const { a, calls } = adapter(() => res({ number: 20, id: 9020, node_id: 'I_20', html_url: 'https://x/20' }, 201))
  const got = await a.createIssue({ title: 'T', description: 'B', labels: ['spec'] })
  assert.match(calls[0].url, /\/repos\/SkitterByte\/skitterspec\/issues$/)
  assert.deepStrictEqual(calls[0].body, { title: 'T', body: 'B', labels: ['spec'] })
  assert.deepStrictEqual(got, { id: '20', identifier: '#20', url: 'https://x/20', nodeId: 'I_20', databaseId: 9020 })
})

test('an issue type is sent only when one is named', async () => {
  const { a, calls } = adapter(() => res({ number: 1, id: 1 }, 201))
  await a.createIssue({ title: 'T', type: 'Task' })
  assert.strictEqual(calls[0].body.type, 'Task')
})

test('a body over the cap is refused before anything is sent', async () => {
  const { a, calls } = adapter(() => res({}))
  await assert.rejects(a.createIssue({ title: 'Big', description: 'x'.repeat(70000) }), /"Big" is 70000 characters/)
  assert.strictEqual(calls.length, 0)
})

test('createSubIssue creates, then links by database id', async () => {
  const { a, calls } = adapter((call) =>
    call.url.endsWith('/sub_issues') ? res({}, 201) : res({ number: 21, id: 9021, node_id: 'I_21' }, 201),
  )
  const got = await a.createSubIssue('#12', { title: 'Phase 1', labels: ['phase'] })
  assert.match(calls[1].url, /\/issues\/12\/sub_issues$/)
  assert.deepStrictEqual(calls[1].body, { sub_issue_id: 9021 })
  assert.strictEqual(got.identifier, '#21')
})

test('a link that fails after the create names the orphan it left', async () => {
  const { a } = adapter((call) =>
    call.url.endsWith('/sub_issues') ? res({ message: 'Validation Failed' }, 422) : res({ number: 22, id: 9022 }, 201),
  )
  await assert.rejects(a.createSubIssue(12, { title: 'Phase 2' }), (err) => {
    assert.ok(err instanceof GitHubRefusal)
    assert.match(err.message, /created #22 but could not link it under #12/)
    assert.strictEqual(err.orphan.identifier, '#22')
    return true
  })
})

test('updateIssue with nothing to say sends nothing; a null assignee clears', async () => {
  const { a, calls } = adapter(() => res({}))
  assert.deepStrictEqual(await a.updateIssue(12, {}), {})
  assert.strictEqual(calls.length, 0)
  await a.updateIssue(12, { assigneeId: null, description: 'new' })
  assert.deepStrictEqual(calls[0].body, { body: 'new', assignees: [] })
  assert.strictEqual(calls[0].method, 'PATCH')
})

test('setIssueOpen closes with a reason and reopens as reopened', async () => {
  const { a, calls } = adapter(() => res({}))
  await a.setIssueOpen(12, { open: false, reason: 'not_planned' })
  await a.setIssueOpen(12, { open: true })
  assert.deepStrictEqual(calls[0].body, { state: 'closed', state_reason: 'not_planned' })
  assert.deepStrictEqual(calls[1].body, { state: 'open', state_reason: 'reopened' })
})

// --- the board ------------------------------------------------------------------

test('listIssueStates returns the Status options, resolving the board once', async () => {
  const { a, calls } = adapter(() => res(BOARD))
  const names = (await a.listIssueStates()).map((s) => s.name)
  await a.listIssueStates()
  assert.deepStrictEqual(names, ['Backlog', 'In Progress', 'Done'])
  assert.strictEqual(calls.length, 1, 'the board is cached per adapter')
  assert.deepStrictEqual(calls[0].body.variables, { owner: 'SkitterByte', number: 7 })
})

test('setStatus on an issue already at that option changes nothing', async () => {
  const { a, calls } = adapter((call) => res(gqlKind(call) === 'board' ? BOARD : issueData(rawIssue())))
  assert.deepStrictEqual(await a.setStatus('#12', 'in progress'), { changed: false })
  assert.ok(!calls.some((c) => isGraphql(c) && ['add', 'set'].includes(gqlKind(c))))
})

test('setStatus on an issue already on the board sets the option on its item', async () => {
  const { a, calls } = adapter((call) => res(gqlKind(call) === 'board' ? BOARD : gqlKind(call) === 'set' ? { data: {} } : issueData(rawIssue())))
  assert.deepStrictEqual(await a.setStatus(12, 'Done'), { changed: true })
  const set = calls.find((c) => gqlKind(c) === 'set')
  assert.deepStrictEqual(set.body.variables, { project: 'PVT_1', item: 'PVTI_12', field: 'F_status', option: 'o_done' })
  assert.ok(!calls.some((c) => gqlKind(c) === 'add'), 'an item that exists is not re-added')
})

test('setStatus adds an off-board issue to the board first', async () => {
  const { a, calls } = adapter((call) => {
    const k = gqlKind(call)
    if (k === 'board') return res(BOARD)
    if (k === 'add') return res({ data: { addProjectV2ItemById: { item: { id: 'PVTI_new' } } } })
    if (k === 'set') return res({ data: {} })
    return res(issueData(rawIssue({ onBoard: false })))
  })
  await a.setStatus(12, 'Backlog')
  const add = calls.find((c) => gqlKind(c) === 'add')
  assert.deepStrictEqual(add.body.variables, { project: 'PVT_1', content: 'I_12' })
  assert.strictEqual(calls.find((c) => gqlKind(c) === 'set').body.variables.item, 'PVTI_new')
})

test('an unknown option is a named refusal listing the options that exist', async () => {
  const { a, calls } = adapter(() => res(BOARD))
  await assert.rejects(a.setStatus(12, 'On Test'), /no option "On Test" — options: "Backlog", "In Progress", "Done"/)
  assert.strictEqual(calls.length, 1, 'refused before the issue is read or written')
})

test('a missing single-select field is a named refusal listing the ones that exist', async () => {
  const { a } = adapter(() => res(BOARD), { statusField: 'Stage' })
  await assert.rejects(a.listIssueStates(), /no single-select field "Stage" — single-select fields: "Status", "Deployed"/)
})

test('setFieldOption reaches a second field (Deployed) by name', async () => {
  const { a, calls } = adapter((call) => res(gqlKind(call) === 'board' ? BOARD : gqlKind(call) === 'set' ? { data: {} } : issueData(rawIssue())))
  await a.setFieldOption(12, 'Deployed', 'Test')
  assert.deepStrictEqual(calls.find((c) => gqlKind(c) === 'set').body.variables.option, 'o_test')
})

test('no board configured, or none visible, is a named refusal', async () => {
  const none = adapter(() => res({}), { project: null })
  await assert.rejects(none.a.listIssueStates(), /set github\.project/)
  const hidden = adapter(() => res({ data: { repositoryOwner: { projectV2: null } }, errors: [{ type: 'NOT_FOUND' }] }))
  await assert.rejects(hidden.a.listIssueStates(), /no board 7 owned by SkitterByte .* `project` scope/)
})

test('a GraphQL scope error says which scopes a classic token needs', async () => {
  const { a } = adapter(() => res({ errors: [{ type: 'INSUFFICIENT_SCOPES', message: 'Your token has not been granted the required scopes' }] }))
  await assert.rejects(a.listIssueStates(), /needs the `repo` and `project` scopes/)
})

// --- other reads ----------------------------------------------------------------

test('searchIssues is scoped to the repo and to titles', async () => {
  const { a, calls } = adapter(() => res({ items: [{ number: 3, title: 'Build "it"' }] }))
  const got = await a.searchIssues({ query: 'Build "it"' })
  const q = new URL(calls[0].url).searchParams.get('q')
  assert.strictEqual(q, 'repo:SkitterByte/skitterspec is:issue in:title "Build it"')
  assert.deepStrictEqual(got, [{ id: '3', identifier: '#3', title: 'Build "it"', state: null, parent: null }])
})

test('readViewer reports classic scopes, and null — cannot tell — for a fine-grained token', async () => {
  const classic = adapter(() => res({ login: 'skitterbyte', name: null }, 200, { 'x-oauth-scopes': 'repo, project' }))
  assert.deepStrictEqual(await classic.a.readViewer(), {
    id: 'skitterbyte',
    login: 'skitterbyte',
    name: 'skitterbyte',
    email: null,
    scopes: ['repo', 'project'],
  })
  const fine = adapter(() => res({ login: 'skitterbyte' }))
  assert.strictEqual((await fine.a.readViewer()).scopes, null)
})

test('comments page until a short page', async () => {
  const page = (n, count) => Array.from({ length: count }, (_, i) => ({ id: n * 1000 + i, body: `c${i}` }))
  const { a, calls } = adapter((call) => {
    const p = Number(new URL(call.url).searchParams.get('page'))
    return res(p === 1 ? page(1, 100) : page(2, 3))
  })
  const got = await a.listComments(12)
  assert.strictEqual(got.length, 103)
  assert.strictEqual(calls.length, 2)
})

test('createComment posts markdown as-is', async () => {
  const { a, calls } = adapter(() => res({ id: 77 }, 201))
  assert.deepStrictEqual(await a.createComment('#12', '**original**'), { id: '77' })
  assert.deepStrictEqual(calls[0].body, { body: '**original**' })
})

// --- failures -------------------------------------------------------------------

test('a 404 on a write names both readings, never just "missing"', async () => {
  const { a } = adapter(() => res({ message: 'Not Found' }, 404))
  await assert.rejects(a.updateIssue(12, { title: 'x' }), /does not exist, or this token cannot see it/)
})

test('a 401 is phrased for the person holding the token', async () => {
  const { a } = adapter(() => res({ message: 'Bad credentials' }, 401))
  await assert.rejects(a.readViewer(), /rejected the token \(HTTP 401\)/)
})

test('a secondary rate limit (403 + Retry-After) waits and retries', async () => {
  const waits = []
  const calls = []
  const a = makeApiAdapter({
    owner: 'o',
    repo: 'r',
    token: 't',
    sleep: async (ms) => waits.push(ms),
    fetch: async () => {
      calls.push(1)
      return calls.length === 1 ? res({ message: 'secondary rate limit' }, 403, { 'retry-after': '2' }) : res({ id: 1 }, 201)
    },
  })
  await a.createComment(1, 'x')
  assert.deepStrictEqual(waits, [2000])
})

test('a primary limit waits until X-RateLimit-Reset', async () => {
  const waits = []
  let n = 0
  const a = makeApiAdapter({
    owner: 'o',
    repo: 'r',
    token: 't',
    now: () => 10_000,
    sleep: async (ms) => waits.push(ms),
    fetch: async () => (++n === 1 ? res({}, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '15' }) : res({ id: 1 }, 201)),
  })
  await a.createComment(1, 'x')
  assert.deepStrictEqual(waits, [5000])
})

test('a plain 403 is a permissions answer, not retried', async () => {
  const { a, calls } = adapter(() => res({ message: 'Resource not accessible by personal access token' }, 403))
  await assert.rejects(a.createComment(1, 'x'), /Resource not accessible/)
  assert.strictEqual(calls.length, 1)
})

test('a limit that never lifts is a retryable refusal', async () => {
  const { a } = adapter(() => res({}, 429), { maxRetries: 2 })
  await assert.rejects(a.createComment(1, 'x'), (err) => err.retryable === true && /did not recover after 2 retries/.test(err.message))
})

test('isLimited: a 429, or a 403 that says it is a limit — nothing else', () => {
  assert.ok(isLimited(res({}, 429)))
  assert.ok(isLimited(res({}, 403, { 'retry-after': '1' })))
  assert.ok(isLimited(res({}, 403, { 'x-ratelimit-remaining': '0' })))
  assert.ok(!isLimited(res({}, 403, { 'x-ratelimit-remaining': '12' })))
  assert.ok(!isLimited(res({}, 500)))
})

// --- releases ---------------------------------------------------------------------

test('releaseTagExists: 200 yes, 404 no, anything else throws', async () => {
  assert.strictEqual(await adapter(() => res({ ref: 'refs/tags/x' })).a.releaseTagExists('x'), true)
  assert.strictEqual(await adapter(() => res({}, 404)).a.releaseTagExists('x'), false)
  await assert.rejects(adapter(() => res({}, 500)).a.releaseTagExists('x'), /answered 500/)
})

test('releaseFind: a 404 is a positive "none"; a found release is normalised', async () => {
  assert.strictEqual(await adapter(() => res({ message: 'Not Found' }, 404)).a.releaseFind('demo@1'), null)
  const { a, calls } = adapter(() => res({ id: 5, tag_name: 'demo@1', html_url: 'https://x/5', body: null, prerelease: true }))
  assert.deepStrictEqual(await a.releaseFind('demo@1'), { id: 5, tag: 'demo@1', url: 'https://x/5', body: '', prerelease: true })
  assert.match(calls[0].url, /\/releases\/tags\/demo%401$/)
})

test('releaseCreate stages as a prerelease that is not Latest', async () => {
  const { a, calls } = adapter(() => res({ id: 6, tag_name: 't', body: 'b', prerelease: true }, 201))
  await a.releaseCreate({ tag: 't', name: 't', body: 'b' })
  assert.deepStrictEqual(calls[0].body, { tag_name: 't', name: 't', body: 'b', prerelease: true, make_latest: 'false' })
})

test('releaseComplete clears prerelease and makes it Latest', async () => {
  const { a, calls } = adapter(() => res({ id: 6, tag_name: 't', prerelease: false }))
  await a.releaseComplete({ id: 6, tag: 't' })
  assert.deepStrictEqual(calls[0].body, { prerelease: false, make_latest: 'true' })
})

test('releaseAttach comments once per issue, found again by its marker', async () => {
  const posted = []
  const { a } = adapter((call) => {
    if (call.method === 'POST') {
      posted.push(call.url)
      return res({ id: 1 }, 201)
    }
    return res(/issues\/1\/comments/.test(call.url) ? [{ id: 9, body: 'Shipped\n\n<!-- skitterspec:released t@1 -->' }] : [])
  })
  const got = await a.releaseAttach({ tag: 't@1', url: 'https://x' }, [{ ref: '#1' }, { ref: '#2' }])
  assert.deepStrictEqual(got, { attached: 1, already: 1 })
  assert.strictEqual(posted.length, 1)
  assert.match(posted[0], /issues\/2\/comments$/)
})

test('releaseStage refuses an unknown Deployed option before any write', async () => {
  const { a, calls } = adapter(() => res(BOARD))
  await assert.rejects(a.releaseStage({ tag: 't' }, 'Prod', [{ ref: '#1' }]), /"Deployed" field has no option "Prod"/)
  assert.ok(calls.every((c) => gqlKind(c) === 'board'))
})
