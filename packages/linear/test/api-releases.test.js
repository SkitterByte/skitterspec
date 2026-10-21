'use strict'

// The release ops on the Linear API adapter (feat-tracker-releases phase 2),
// driven by the response shapes observed live in phase 1
// (fixtures/releases.json). Offline: every test injects `fetch`.

const { test } = require('node:test')
const assert = require('node:assert')

const { makeApiAdapter, makeClient, releaseRefusalKind } = require('../src/api.js')
const { releaseSupport, unattachedRefs } = require('@skitterbyte/skitterspec-provider-kit/src/releases.js')
const { makeAdapter } = require('../src/mcp.js')
const fx = require('./fixtures/releases.json')

// The fixtures carry `issues` as a connection, which is what Linear returns;
// `releaseFrom` flattens it, and these tests check that flattening too.
function fakeFetch(responses, { status = 200 } = {}) {
  const calls = []
  const queue = [].concat(responses)
  const fn = async (url, init) => {
    calls.push(JSON.parse(init.body))
    const next = queue.length > 1 ? queue.shift() : queue[0]
    return { ok: status >= 200 && status < 300, status, async json() { return next } }
  }
  fn.calls = calls
  return fn
}

const adapterWith = (fetchImpl) => makeApiAdapter({ apiKey: 'lin_api_x', fetch: fetchImpl })

test('the API adapter supports releases; the MCP adapter does not, and says which ops', () => {
  assert.strictEqual(releaseSupport(adapterWith(fakeFetch({ data: {} }))).supported, true)
  const mcp = releaseSupport(makeAdapter(async () => null, {}))
  assert.strictEqual(mcp.supported, false)
  assert.ok(mcp.missing.includes('releaseSync'))
})

test('releaseSync sends version, commit and refs, and reads back what attached', async () => {
  const fetch = fakeFetch({ data: fx.syncResolvableRef })
  const release = await adapterWith(fetch).releaseSync({
    pipelineId: 'p',
    version: '0.0.2-spike',
    name: 'spike@0.0.2-spike',
    commitSha: 'abc',
    refs: [{ identifier: 'SKS-401', commitSha: 'abc' }],
    links: [{ url: 'https://ci.example/run/1', label: 'CI run' }],
    notes: 'notes',
  })
  const sent = fetch.calls[0].variables.i
  assert.deepStrictEqual(sent, {
    pipelineId: 'p',
    version: '0.0.2-spike',
    commitSha: 'abc',
    issueReferences: [{ identifier: 'SKS-401', commitSha: 'abc' }],
    name: 'spike@0.0.2-spike',
    links: [{ url: 'https://ci.example/run/1', label: 'CI run' }],
    releaseNotes: { content: 'notes' },
  })
  assert.match(fetch.calls[0].query, /releaseSync\(input: \$i\)/)
  assert.deepStrictEqual(release.issues, ['SKS-401'])
})

test('releaseSync omits empty links and notes rather than sending empties', async () => {
  const fetch = fakeFetch({ data: fx.syncFirstVersion })
  await adapterWith(fetch).releaseSync({ pipelineId: 'p', version: '1', commitSha: 'abc' })
  assert.deepStrictEqual(Object.keys(fetch.calls[0].variables.i).sort(), [
    'commitSha',
    'issueReferences',
    'pipelineId',
    'version',
  ])
})

test('a ref Linear silently dropped is visible through the read-back', async () => {
  const release = await adapterWith(fakeFetch({ data: fx.syncUnresolvableRef })).releaseSync({
    pipelineId: 'p',
    version: '0.0.1-spike',
    commitSha: 'abc',
    refs: [{ identifier: 'SKS-41', commitSha: 'abc' }],
  })
  assert.deepStrictEqual(release.issues, [])
  assert.deepStrictEqual(unattachedRefs(['SKS-41'], release), ['SKS-41'])
})

test('releaseFind filters by version and pipeline, and a miss is null', async () => {
  const hit = fakeFetch({ data: fx.findByVersion })
  const found = await adapterWith(hit).releaseFind({ pipelineId: 'p', version: '0.0.1-spike' })
  assert.deepStrictEqual(hit.calls[0].variables, { v: '0.0.1-spike', p: 'p' })
  assert.strictEqual(found.id, 'd13b5bcd-3759-4d18-9e99-4d0d0815c1bc')
  assert.strictEqual(found.stage.name, 'Released')

  const miss = await adapterWith(fakeFetch({ data: fx.findByVersionMissing })).releaseFind({ pipelineId: 'p', version: 'x' })
  assert.strictEqual(miss, null)
})

test('releaseStage moves by stage name, and releaseComplete passes links and notes', async () => {
  const stage = fakeFetch({ data: fx.updateByPipelineStage })
  const moved = await adapterWith(stage).releaseStage({ pipelineId: 'p', version: '0.0.1-spike', stage: 'staged' })
  assert.deepStrictEqual(stage.calls[0].variables.i, { pipelineId: 'p', version: '0.0.1-spike', stage: 'staged' })
  assert.deepStrictEqual(moved.stage, { name: 'Staged', type: 'started' })

  const done = fakeFetch({ data: fx.complete })
  const completed = await adapterWith(done).releaseComplete({
    pipelineId: 'p',
    version: '0.0.1-spike',
    links: [{ url: 'https://www.npmjs.com/package/x' }],
    notes: 'n',
  })
  assert.deepStrictEqual(done.calls[0].variables.i, {
    pipelineId: 'p',
    version: '0.0.1-spike',
    links: [{ url: 'https://www.npmjs.com/package/x' }],
    releaseNotes: { content: 'n' },
  })
  assert.strictEqual(completed.completedAt, '2026-10-21T15:36:09.277Z')
})

// --- HTTP 400 carries the reason ---------------------------------------------

test('an HTTP 400 with a GraphQL errors body says what Linear objected to', async () => {
  const call = makeClient({
    apiKey: 'k',
    fetch: fakeFetch({ errors: [{ message: 'Cannot query field "nope" on type "Release".' }] }, { status: 400 }),
  })
  await assert.rejects(call('{ nope }'), /HTTP 400: Cannot query field "nope" on type "Release"\./)
})

// CANNOT TELL: a 400 whose body is unreadable keeps the old message rather than
// inventing a reason.
test('an HTTP 400 with no readable body keeps the plain message', async () => {
  const fetch = async () => ({ ok: false, status: 400, async json() { throw new SyntaxError('bad json') } })
  await assert.rejects(makeClient({ apiKey: 'k', fetch })('{ x }'), /^Error: Linear API returned HTTP 400$/)
})

// --- what a release refusal means ---------------------------------------------

test('a refusal is classified as unavailable, scope, or nothing at all', () => {
  assert.strictEqual(releaseRefusalKind(new Error(`Linear API error: ${fx.errors.featureOff}`)), 'unavailable')
  assert.strictEqual(releaseRefusalKind({ message: 'x', code: 'FEATURE_NOT_ACCESSIBLE' }), 'unavailable')
  assert.strictEqual(releaseRefusalKind(new Error(`Linear API error: ${fx.errors.noAdminScope}`)), 'scope')
  // Not a verdict on anything else — the caller relays the message.
  assert.strictEqual(releaseRefusalKind(new Error(`Linear API error: ${fx.errors.unknownStage}`)), null)
  assert.strictEqual(releaseRefusalKind(null), null)
})
