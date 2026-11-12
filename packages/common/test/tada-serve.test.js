'use strict'

/**
 * The served ta-da page (feat-tada-scope-and-serve, phase 3): readable dates,
 * the `_tada` route, the recap sidecar, and the page drawn per request. The
 * digest is stubbed — `tada-digest.test.js` and friends own how it is built.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')

const { windowFor, humanLabel } = require('../src/tada/window.js')
const { tadaQuery, readTadaQuery, recapKey, recapPath, renderServedTada } = require('../src/tada/serve.js')
const { routeFor, createReviewServer } = require('../src/env/serve.js')

const THURSDAY = new Date(2026, 10, 12, 15, 0)

// --- dates ---------------------------------------------------------------------

test('one day reads as a date a person would write', () => {
  assert.strictEqual(humanLabel(windowFor({}, THURSDAY)), 'Thursday 12 November 2026')
  assert.strictEqual(humanLabel(windowFor({ on: 'yesterday' }, THURSDAY)), 'Wednesday 11 November 2026')
})

test('a span says its month and year once when the ends share them', () => {
  assert.strictEqual(humanLabel(windowFor({ since: 'friday' }, THURSDAY)), 'Fri 6 – Thu 12 Nov 2026')
  assert.strictEqual(humanLabel(windowFor({ since: '2026-10-30' }, THURSDAY)), 'Fri 30 Oct – Thu 12 Nov 2026')
  assert.strictEqual(humanLabel(windowFor({ since: '2025-12-30' }, THURSDAY)), 'Tue 30 Dec 2025 – Thu 12 Nov 2026')
})

// --- the address -----------------------------------------------------------------

test('the route is _tada, behind the token, with the window in its query', () => {
  assert.deepStrictEqual(routeFor('/tok/_tada?on=2026-11-12&all=1', { token: 'tok' }), { kind: 'tada', search: 'on=2026-11-12&all=1' })
  assert.deepStrictEqual(routeFor('/_tada?on=2026-11-12', { token: 'tok' }), { kind: 'notfound' })
  assert.deepStrictEqual(routeFor('/tok/_tada/x', { token: 'tok' }), { kind: 'notfound' })
  assert.strictEqual(routeFor('/tok/tada', { token: 'tok' }).kind, 'spec', 'a spec may still be called tada')
})

test('the query round-trips the window and the scope flags', () => {
  const q = tadaQuery({ since: '2026-11-06', all: true, chat: true, here: true })
  assert.strictEqual(q, '?since=2026-11-06&all=1&chat=1&here=1')
  const ask = readTadaQuery(q.slice(1), THURSDAY)
  assert.deepStrictEqual([ask.since, ask.all, ask.chat, ask.here], ['2026-11-06', true, true, true])
  assert.deepStrictEqual(ask.window.since, new Date(2026, 10, 6))
  assert.strictEqual(tadaQuery({}), '')
})

test('a window the query cannot name is refused, never guessed', () => {
  assert.throws(() => readTadaQuery('on=11/12', THURSDAY), /reads two ways/)
})

test('a since-recap keeps its name as the window grows', () => {
  const today = readTadaQuery('since=2026-11-06', THURSDAY)
  const tomorrow = readTadaQuery('since=2026-11-06', new Date(2026, 10, 13, 9))
  assert.strictEqual(recapKey(today), 'since-2026-11-06')
  assert.strictEqual(recapKey(today), recapKey(tomorrow))
  assert.strictEqual(recapKey(readTadaQuery('on=2026-11-12&all=1&chat=1', THURSDAY)), 'on-2026-11-12-all-chat')
})

// --- the render ------------------------------------------------------------------

const DIGEST = {
  window: { since: '2026-11-12T00:00:00.000Z', until: '2026-11-12T15:00:00.000Z' },
  category: 'work',
  projects: [{ repo: '/code/app', name: 'Acme Portal', git: true, skitterspec: true, groups: [] }],
  notes: [],
}
const stub = (out) => async () => out

function stateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tada-state-'))
}

test('the page is drawn from the digest with the saved recap and when it was written', async () => {
  const state = stateDir()
  const file = recapPath(state, 'on-2026-11-12')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '## Standup\n\n- **Done:** shipped it')
  const out = await renderServedTada({ dir: '/x', stateDir: state, search: 'on=2026-11-12', project: 'skitterspec', now: THURSDAY, run: stub({ digest: DIGEST }) })
  assert.match(out.html, /<title>skitterspec · Ta-da · Thursday 12 November 2026<\/title>/)
  assert.match(out.html, /<p class="eyebrow">skitterspec · work<\/p>/)
  assert.match(out.html, /<strong>Done:<\/strong> shipped it/)
  assert.match(out.html, /Recap written \d\d:\d\d on /)
  assert.doesNotMatch(out.html, /2026-11-12T00:00/, 'no ISO timestamp in the header')
})

// Stays silent: no recap saved for a window is the ordinary state.
test('with no recap saved, the page is the digest alone and says nothing about it', async () => {
  const out = await renderServedTada({ dir: '/x', stateDir: stateDir(), search: 'on=2026-11-12', now: THURSDAY, run: stub({ digest: DIGEST }) })
  assert.doesNotMatch(out.html, /class="recap"|Recap written/)
  assert.match(out.html, /Acme Portal/)
})

test('a bad window is a 400 naming the fix; a digest that failed is a 500 that says cannot tell', async () => {
  const bad = await renderServedTada({ dir: '/x', stateDir: stateDir(), search: 'since=next friday', now: THURSDAY, run: stub({ digest: DIGEST }) })
  assert.strictEqual(bad.status, 400)
  assert.match(bad.error, /expected today/)
  const failed = await renderServedTada({ dir: '/x', stateDir: stateDir(), search: '', now: THURSDAY, run: stub({ error: 'cannot tell — x' }) })
  assert.deepStrictEqual(failed, { status: 500, error: 'cannot tell — x' })
})

// --- the server ------------------------------------------------------------------

function get(server, url) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      http
        .get(`http://127.0.0.1:${port}${url}`, (res) => {
          let body = ''
          res.on('data', (c) => (body += c))
          res.on('end', () => server.close(() => resolve({ status: res.statusCode, body })))
        })
        .on('error', reject)
    })
  })
}

const base = { resolveEntries: () => [], render: () => null, token: 'tok' }

test('the server answers _tada through its hook, and a server without one says not found', async () => {
  let asked = null
  const tada = async (search) => {
    asked = search
    return { html: '<p>ta-da</p>' }
  }
  const ok = await get(createReviewServer({ ...base, tada }), '/tok/_tada?on=2026-11-12')
  assert.deepStrictEqual([ok.status, ok.body, asked], [200, '<p>ta-da</p>', 'on=2026-11-12'])
  const old = await get(createReviewServer(base), '/tok/_tada?on=2026-11-12')
  assert.strictEqual(old.status, 404)
})

test('a refused window reaches the reader as its status and message', async () => {
  const tada = async () => ({ status: 400, error: 'expected today, …' })
  const res = await get(createReviewServer({ ...base, tada }), '/tok/_tada?on=11/12')
  assert.deepStrictEqual([res.status, res.body], [400, 'expected today, …'])
})
