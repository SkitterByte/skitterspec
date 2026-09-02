'use strict'

/**
 * The GraphQL transport: `api.js`.
 *
 * Every test injects `fetch`, so the suite stays offline and deterministic — the
 * same discipline `mcp.test.js` gets from injecting `callTool`. What matters
 * here is that the adapter fulfils the SAME operation contract as the MCP one
 * (so `apply` can be written once), that a bad key fails loudly before any
 * write, and that the key never leaks into anything a human or a file will see.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const {
  ENDPOINT,
  resolveApiKey,
  makeApiAdapter,
  fetchWorkspaceStates,
  stateIdFor,
} = require('../src/api.js')
const { makeAdapter } = require('../src/mcp.js')
const { DEFAULT_CONFIG } = require('../src/config.js')

const KEY = 'lin_api_secret_value_do_not_leak'

// A fake fetch returning `data`, recording every call it received.
function fakeFetch(data, { status = 200, errors = null } = {}) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) })
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return errors ? { errors } : { data }
      },
    }
  }
  fn.calls = calls
  return fn
}

const adapterWith = (fetchImpl, apiKey = KEY) => makeApiAdapter({ apiKey, fetch: fetchImpl })

// --- credential resolution ---------------------------------------------------

test('the key is read from LINEAR_API_KEY by default', () => {
  const r = resolveApiKey(DEFAULT_CONFIG, { LINEAR_API_KEY: KEY })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.key, KEY)
  assert.strictEqual(r.envVar, 'LINEAR_API_KEY')
})

test('auth.keyEnv names a different variable', () => {
  const config = { auth: { keyEnv: 'WORK_LINEAR_KEY' } }
  assert.strictEqual(resolveApiKey(config, { WORK_LINEAR_KEY: KEY }).key, KEY)
  // The default variable is NOT consulted once another is named — otherwise a
  // stale key in the environment would silently win.
  assert.strictEqual(resolveApiKey(config, { LINEAR_API_KEY: KEY }).ok, false)
})

test('a missing key is a branchable result, not a throw, and names the variable', () => {
  const r = resolveApiKey(DEFAULT_CONFIG, {})
  assert.strictEqual(r.ok, false)
  assert.match(r.error, /LINEAR_API_KEY/)
  assert.match(r.error, /--via mcp/, 'points at the fallback rather than dead-ending')
})

test('a blank or whitespace key counts as absent', () => {
  assert.strictEqual(resolveApiKey(DEFAULT_CONFIG, { LINEAR_API_KEY: '' }).ok, false)
  assert.strictEqual(resolveApiKey(DEFAULT_CONFIG, { LINEAR_API_KEY: '   ' }).ok, false)
})

// --- transport ---------------------------------------------------------------

test('the key goes in Authorization raw, with no Bearer prefix', async () => {
  const f = fakeFetch({ issue: { id: 'x' } })
  await adapterWith(f).readIssue('SKI-1')
  const { url, init } = f.calls[0]
  assert.strictEqual(url, ENDPOINT)
  assert.strictEqual(init.headers.Authorization, KEY, 'raw key — Bearer would fail auth')
  assert.strictEqual(init.method, 'POST')
  assert.strictEqual(init.headers['Content-Type'], 'application/json')
})

test('a GraphQL errors payload fails loudly', async () => {
  const f = fakeFetch(null, { errors: [{ message: 'Entity not found' }] })
  await assert.rejects(() => adapterWith(f).readIssue('nope'), /Entity not found/)
})

test('a 401 names the key variable rather than the key', async () => {
  const f = fakeFetch(null, { status: 401 })
  await assert.rejects(
    () => adapterWith(f).readIssue('SKI-1'),
    (e) => /key environment variable/.test(e.message) && !e.message.includes(KEY),
  )
})

test('an unreachable API is reported as such, not as a bad key', async () => {
  const boom = async () => {
    throw new Error('ECONNREFUSED')
  }
  await assert.rejects(() => adapterWith(boom).readIssue('SKI-1'), /unreachable/)
})

// --- the operation contract --------------------------------------------------

test('it exposes exactly the operations the MCP adapter does', () => {
  const mcpOps = Object.keys(makeAdapter(async () => ({}), {})).sort()
  const apiOps = Object.keys(adapterWith(fakeFetch({}))).sort()
  // The API adapter may add ops (listIssueStates has no MCP equivalent), but it
  // must never be MISSING one — that is what lets `apply` take either.
  const missing = mcpOps.filter((op) => !apiOps.includes(op))
  assert.deepEqual(missing, [], 'the API adapter must satisfy the MCP contract')
})

test('createIssue sends issueCreate and returns the issue', async () => {
  const issue = { id: 'uuid-1', identifier: 'SKI-11', url: 'https://linear.app/x', description: 'body' }
  const f = fakeFetch({ issueCreate: { success: true, issue } })
  const got = await adapterWith(f).createIssue({ title: 'T', teamId: 'team-1', description: 'body' })
  assert.deepEqual(got, issue)
  assert.match(f.calls[0].body.query, /issueCreate/)
  assert.deepEqual(f.calls[0].body.variables.input, { title: 'T', teamId: 'team-1', description: 'body' })
})

test('updateIssue sends issueUpdate keyed by id', async () => {
  const issue = { id: 'uuid-1', identifier: 'SKI-11' }
  const f = fakeFetch({ issueUpdate: { success: true, issue } })
  await adapterWith(f).updateIssue('uuid-1', { description: 'new' })
  assert.match(f.calls[0].body.query, /issueUpdate/)
  assert.strictEqual(f.calls[0].body.variables.id, 'uuid-1')
  assert.deepEqual(f.calls[0].body.variables.input, { description: 'new' })
})

test('a sub-issue is an ordinary issueCreate carrying parentId', async () => {
  const issue = { id: 'uuid-2', identifier: 'SKI-12' }
  const f = fakeFetch({ issueCreate: { success: true, issue } })
  await adapterWith(f).createSubIssue('uuid-1', { title: 'Phase 1', description: 'goal' })
  assert.match(f.calls[0].body.query, /issueCreate/)
  assert.strictEqual(f.calls[0].body.variables.input.parentId, 'uuid-1')
  assert.strictEqual(f.calls[0].body.variables.input.title, 'Phase 1')
})

test('readIssue asks for the fields the stamp and the verify need', async () => {
  const f = fakeFetch({ issue: { id: 'uuid-1' } })
  await adapterWith(f).readIssue('SKI-11')
  for (const field of ['identifier', 'url', 'description']) {
    assert.match(f.calls[0].body.query, new RegExp(field), `${field} is read back`)
  }
})

test('listSubIssues reads the children of a parent', async () => {
  const f = fakeFetch({ issue: { children: { nodes: [{ id: 'c1' }] } } })
  assert.deepEqual(await adapterWith(f).listSubIssues('uuid-1'), [{ id: 'c1' }])
})

test('searchIssues uses text search only when a term is given', async () => {
  const withTerm = fakeFetch({ searchIssues: { nodes: [{ id: 'a' }] } })
  await adapterWith(withTerm).searchIssues({ query: 'outbox', teamId: 't1' })
  assert.match(withTerm.calls[0].body.query, /searchIssues/)

  const noTerm = fakeFetch({ issues: { nodes: [{ id: 'b' }] } })
  await adapterWith(noTerm).searchIssues({ label: 'spec', teamId: 't1' })
  assert.doesNotMatch(noTerm.calls[0].body.query, /searchIssues/)
  assert.deepEqual(noTerm.calls[0].body.variables.filter, {
    labels: { name: { eq: 'spec' } },
    team: { id: { eq: 't1' } },
  })
})

test('listProjects scopes to a team when given one', async () => {
  const scoped = fakeFetch({ team: { projects: { nodes: [{ id: 'p1', name: 'P' }] } } })
  assert.deepEqual(await adapterWith(scoped).listProjects('t1'), [{ id: 'p1', name: 'P' }])
  const all = fakeFetch({ projects: { nodes: [{ id: 'p2', name: 'Q' }] } })
  assert.deepEqual(await adapterWith(all).listProjects(), [{ id: 'p2', name: 'Q' }])
})

// --- workspace states --------------------------------------------------------

const STATES = [
  { id: 's1', name: 'Backlog', type: 'backlog' },
  { id: 's2', name: 'In Progress', type: 'started' },
  { id: 's3', name: 'Done', type: 'completed' },
  { id: 's4', name: 'Canceled', type: 'canceled' },
]

test('workspace states come back as the name array the state check already takes', async () => {
  const f = fakeFetch({ team: { states: { nodes: STATES } } })
  const names = await fetchWorkspaceStates(adapterWith(f), 't1')
  assert.deepEqual(names, ['Backlog', 'In Progress', 'Done', 'Canceled'])
})

test('a bucket resolves to the state id its configured name points at', () => {
  assert.strictEqual(stateIdFor('in-progress', DEFAULT_CONFIG, STATES), 's2')
  assert.strictEqual(stateIdFor('complete', DEFAULT_CONFIG, STATES), 's3')
})

test('a configured state the workspace lacks fails, naming what it does have', () => {
  const config = { states: { ...DEFAULT_CONFIG.states, complete: 'Shipped' } }
  assert.throws(
    () => stateIdFor('complete', config, STATES),
    (e) => /Shipped/.test(e.message) && /Backlog, In Progress, Done, Canceled/.test(e.message),
  )
})

// --- the key never leaks -----------------------------------------------------

test('the key appears in no error message the user could ever see', async () => {
  const cases = [
    fakeFetch(null, { status: 401 }),
    fakeFetch(null, { status: 500 }),
    fakeFetch(null, { errors: [{ message: 'bad' }] }),
    async () => {
      throw new Error('ECONNREFUSED')
    },
  ]
  for (const f of cases) {
    await assert.rejects(
      () => adapterWith(f).readIssue('SKI-1'),
      (e) => !e.message.includes(KEY) && !e.stack.includes(KEY),
    )
  }
  // And not from the resolver either, whose whole job is handling the key.
  assert.ok(!JSON.stringify(resolveApiKey(DEFAULT_CONFIG, {})).includes(KEY))
})

test('the key travels only in the Authorization header, never in the payload', async () => {
  const f = fakeFetch({ issueCreate: { success: true, issue: { id: 'x' } } })
  await adapterWith(f).createIssue({ title: 'T', teamId: 't1' })
  const { init } = f.calls[0]
  assert.strictEqual(init.headers.Authorization, KEY)
  assert.ok(!init.body.includes(KEY), 'the request body carries no key')
})

// --- rate limiting: what a 250-spec backfill actually hits --------------------

// A fetch that 429s the first `times` calls, then succeeds.
function rateLimited(times, { retryAfter = null } = {}) {
  let n = 0
  const waits = []
  const fn = async () => {
    if (n++ < times) {
      return {
        ok: false,
        status: 429,
        headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? retryAfter : null) },
        async json() {
          return {}
        },
      }
    }
    return { ok: true, status: 200, async json() { return { data: { issue: { id: 'x' } } } } }
  }
  fn.waits = waits
  return fn
}

test('a 429 is waited out and retried, not surfaced as a failure', async () => {
  const waits = []
  const adapter = makeApiAdapter({ apiKey: KEY, fetch: rateLimited(2), sleep: async (ms) => waits.push(ms) })
  assert.deepEqual(await adapter.readIssue('SKI-1'), { id: 'x' })
  assert.deepEqual(waits, [1000, 2000], 'exponential backoff when Linear names no delay')
})

test("Linear's Retry-After is honoured over our own guess", async () => {
  const waits = []
  const adapter = makeApiAdapter({
    apiKey: KEY,
    fetch: rateLimited(1, { retryAfter: '7' }),
    sleep: async (ms) => waits.push(ms),
  })
  await adapter.readIssue('SKI-1')
  assert.deepEqual(waits, [7000], 'seconds, converted to ms')
})

test('a run that never recovers fails loudly rather than retrying forever', async () => {
  const adapter = makeApiAdapter({
    apiKey: KEY,
    fetch: rateLimited(Infinity),
    sleep: async () => {},
    maxRetries: 3,
  })
  await assert.rejects(() => adapter.readIssue('SKI-1'), /rate-limited.*did not recover after 3 retries/)
})

test('backoff is capped, so a silly Retry-After cannot stall the run for hours', async () => {
  const waits = []
  const adapter = makeApiAdapter({
    apiKey: KEY,
    fetch: rateLimited(1, { retryAfter: '99999' }),
    sleep: async (ms) => waits.push(ms),
  })
  await adapter.readIssue('SKI-1')
  assert.strictEqual(waits[0], 60_000)
})

// --- readTeam: what `doctor` compares stamped identifiers against ------------

test('readTeam returns the team key, which is what a rename changes', async () => {
  const f = fakeFetch({ team: { id: 'T1', key: 'ERQ', name: 'eReqs' } })
  const got = await adapterWith(f).readTeam('T1')
  assert.deepEqual(got, { id: 'T1', key: 'ERQ', name: 'eReqs' })
  assert.match(f.calls[0].body.query, /team\(id: \$id\)/)
  assert.deepEqual(f.calls[0].body.variables, { id: 'T1' })
})

test('readTeam is null for a team that is not there, rather than throwing', async () => {
  assert.strictEqual(await adapterWith(fakeFetch({ team: null })).readTeam('nope'), null)
})
