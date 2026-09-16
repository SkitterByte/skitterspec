'use strict'

/**
 * `?pass=<code>` — the read-only answer to "what became of my pass?".
 *
 * The page POSTs, gets six digits, and then has to say one of two things: that
 * Claude picked it up, or that it is still sitting there and here is the
 * command. It cannot know which at send time, so it asks — and this route is
 * what answers.
 *
 * READ-ONLY AND ONE ANSWER WIDE, deliberately. It reports the state of the ONE
 * code handed to it and never lists, so it cannot become the enumeration oracle
 * the POST route was carefully kept from being: a prober who does not already
 * hold a code learns nothing, and one who does holds it because the page they
 * were served printed it.
 *
 * WHAT WOULD FOOL A CALLER READING THIS: taking `claimed` from the code merely
 * being ABSENT. A store that moved, a folder typo, a sidecar too corrupt to
 * parse — every one of those is an absence, and every one would report a pass
 * as picked up when nobody has it. So `claimed` is a POSITIVE signal (the
 * decision log names the code), and everything the engine cannot establish
 * answers `unknown`, which callers must treat as "still hand over the command".
 */

const { test } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')

const { createReviewServer, startReviewServer } = require('../src/env/serve.js')

async function serving({ passState = null, token = null } = {}) {
  const asked = []
  const server = createReviewServer({
    resolveEntries: () => [],
    render: () => ({ html: '<p>ok</p>' }),
    receive: () => ({ code: '418207' }),
    passState: passState
      ? (spec, code) => {
          asked.push({ spec, code })
          return passState(spec, code)
        }
      : null,
    token,
  })
  const addr = await startReviewServer(server, { port: 0, host: '127.0.0.1' })
  return {
    asked,
    url: (p) => `http://127.0.0.1:${addr.port}${p}`,
    close: () => new Promise((r) => server.close(r)),
  }
}

function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET' }, (res) => {
      let out = ''
      res.on('data', (c) => (out += c))
      res.on('end', () => resolve({ status: res.statusCode, body: out, type: res.headers['content-type'] }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('a pass still in the holding area reads as waiting', async () => {
  const s = await serving({ passState: () => ({ state: 'waiting' }) })
  try {
    const res = await request(s.url('/feat-alpha?pass=418207'))
    assert.strictEqual(res.status, 200)
    assert.match(res.type, /application\/json/)
    assert.deepStrictEqual(JSON.parse(res.body), { state: 'waiting' })
    assert.deepStrictEqual(s.asked, [{ spec: 'feat-alpha', code: '418207' }])
  } finally {
    await s.close()
  }
})

test('a pass that was claimed reads as claimed', async () => {
  const s = await serving({ passState: () => ({ state: 'claimed' }) })
  try {
    const res = await request(s.url('/feat-alpha?pass=418207'))
    assert.deepStrictEqual(JSON.parse(res.body), { state: 'claimed' })
  } finally {
    await s.close()
  }
})

// The stays-silent case: a lookup that could not see must not read as either
// answer. `unknown` is what the page turns back into "here is the command".
test('a state the engine cannot establish answers unknown, not claimed', async () => {
  const s = await serving({ passState: () => ({ state: 'unknown' }) })
  try {
    const res = await request(s.url('/feat-alpha?pass=418207'))
    assert.deepStrictEqual(JSON.parse(res.body), { state: 'unknown' })
  } finally {
    await s.close()
  }
})

test('the page still renders when no pass is named', async () => {
  const s = await serving({ passState: () => ({ state: 'waiting' }) })
  try {
    const res = await request(s.url('/feat-alpha'))
    assert.strictEqual(res.status, 200)
    assert.match(res.type, /text\/html/)
    assert.deepStrictEqual(s.asked, [], 'the diff page is not a pass lookup')
  } finally {
    await s.close()
  }
})

// It must tell a prober exactly what every other route tells them.
test('a wrong token is the same 404, pass or no pass', async () => {
  const s = await serving({ passState: () => ({ state: 'waiting' }), token: 'abc123' })
  try {
    const res = await request(s.url('/nope/feat-alpha?pass=418207'))
    assert.strictEqual(res.status, 404)
    assert.strictEqual(res.body, 'not found')
    assert.deepStrictEqual(s.asked, [], 'nothing was looked up')
  } finally {
    await s.close()
  }
})

// A pass belongs to a spec, so there is nothing for this to look up without
// one. The index goes on being the index — it has always ignored its query
// string, and inventing a refusal for one unknown parameter would be a new way
// for a link to break rather than a guard on anything.
test('a pass lookup with no spec looks nothing up', async () => {
  const s = await serving({ passState: () => ({ state: 'waiting' }) })
  try {
    const res = await request(s.url('/?pass=418207'))
    assert.strictEqual(res.status, 200)
    assert.match(res.type, /text\/html/, 'still the index')
    assert.deepStrictEqual(s.asked, [], 'and nothing was resolved')
  } finally {
    await s.close()
  }
})

// A server built without the lookup (an older daemon) must not 500 or render a
// whole diff page at a poller — it says it cannot tell, which is the answer
// that keeps the command on screen.
test('a server with no lookup answers unknown rather than failing', async () => {
  const s = await serving({ passState: null })
  try {
    const res = await request(s.url('/feat-alpha?pass=418207'))
    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(JSON.parse(res.body), { state: 'unknown' })
  } finally {
    await s.close()
  }
})
