'use strict'

/**
 * The one write path into the review server.
 *
 * Before this, `createReviewServer` never looked at `req.method`: every request
 * rendered HTML and returned it, which is why the clipboard was the only way a
 * review pass could come back. A POST now lands in the HOLDING AREA and nothing
 * else — the review itself is still only written by a claim, which needs a
 * person to read six digits off the page.
 *
 * That containment is what these assert. A stranger on the network can queue a
 * pass nobody will claim; they cannot touch the review, cannot enumerate what
 * exists, and cannot hand the process a body it will buffer.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')

const { createReviewServer, startReviewServer, MAX_PASS_BYTES } = require('../src/env/serve.js')

// A server with injected callbacks — the same seam `render` already uses, so a
// test drives the real request handling without a repo behind it.
async function serving({ receive = null, render = () => ({ html: '<p>ok</p>' }), token = null } = {}) {
  const calls = []
  const server = createReviewServer({
    resolveEntries: () => [],
    render,
    receive: receive
      ? (spec, blob) => {
          calls.push({ spec, blob })
          return receive(spec, blob)
        }
      : null,
    token,
  })
  const addr = await startReviewServer(server, { port: 0, host: '127.0.0.1' })
  return {
    calls,
    url: (p) => `http://127.0.0.1:${addr.port}${p}`,
    close: () => new Promise((r) => server.close(r)),
  }
}

function request(url, { method = 'GET', body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let out = ''
      res.on('data', (c) => (out += c))
      res.on('end', () => resolve({ status: res.statusCode, body: out, type: res.headers['content-type'] }))
    })
    req.on('error', reject)
    if (body !== null) req.write(body)
    req.end()
  })
}

const blob = (over = {}) => JSON.stringify({ version: 1, spec: 'feat-alpha', accepted: [], unaccepted: [], comments: [], ...over })

test('a POST to a spec stores the pass and answers with its code', async () => {
  const s = await serving({ receive: () => ({ code: '418207' }) })
  try {
    const res = await request(s.url('/feat-alpha'), { method: 'POST', body: blob() })
    assert.strictEqual(res.status, 200)
    assert.match(res.type, /application\/json/)
    assert.deepStrictEqual(JSON.parse(res.body), { code: '418207' })
    assert.strictEqual(s.calls.length, 1)
    assert.strictEqual(s.calls[0].spec, 'feat-alpha')
  } finally {
    await s.close()
  }
})

test('a refused blob comes back with the engine\'s own message, and stores nothing', async () => {
  const s = await serving({ receive: () => ({ error: 'verdict "aprove" is not one of approve, changes, discuss' }) })
  try {
    const res = await request(s.url('/feat-alpha'), { method: 'POST', body: blob({ verdict: 'aprove' }) })
    assert.strictEqual(res.status, 422)
    // Relayed, not paraphrased: the message names the entry that was wrong.
    assert.match(res.body, /verdict "aprove" is not one of/)
  } finally {
    await s.close()
  }
})

test('a body that is not JSON is refused before anything else looks at it', async () => {
  const s = await serving({ receive: () => ({ code: '000001' }) })
  try {
    const res = await request(s.url('/feat-alpha'), { method: 'POST', body: '{ not json' })
    assert.strictEqual(res.status, 400)
    assert.strictEqual(s.calls.length, 0, 'receive was never reached')
  } finally {
    await s.close()
  }
})

test('an oversized body is refused, and never buffered whole', async () => {
  const s = await serving({ receive: () => ({ code: '000001' }) })
  try {
    const huge = 'x'.repeat(MAX_PASS_BYTES + 1024)
    const res = await request(s.url('/feat-alpha'), { method: 'POST', body: huge }).catch((e) => ({
      // A destroyed request can surface as a socket error rather than a reply;
      // either is the refusal working. What must NOT happen is `receive` running.
      status: 'aborted',
      err: e.code,
    }))
    assert.ok(res.status === 413 || res.status === 'aborted', `refused, got ${res.status}`)
    assert.strictEqual(s.calls.length, 0, 'nothing was handed on')
  } finally {
    await s.close()
  }
})

// A write path must not become a way to find out what exists. Both of these
// answer exactly as the GET does, so a POST tells a prober nothing a GET did
// not already tell them.
test('a POST to an unknown spec is the same 404 a GET gives', async () => {
  const s = await serving({ receive: () => null })
  try {
    const res = await request(s.url('/feat-nope'), { method: 'POST', body: blob() })
    assert.strictEqual(res.status, 404)
    assert.strictEqual(res.body, 'not found')
  } finally {
    await s.close()
  }
})

test('a POST to the index is a 404, not an index', async () => {
  const s = await serving({ receive: () => ({ code: '000001' }) })
  try {
    const res = await request(s.url('/'), { method: 'POST', body: blob() })
    assert.strictEqual(res.status, 404)
    assert.strictEqual(s.calls.length, 0)
  } finally {
    await s.close()
  }
})

test('the token guards the write path exactly as it guards reading', async () => {
  const s = await serving({ receive: () => ({ code: '000001' }), token: 'abc123' })
  try {
    const wrong = await request(s.url('/nope/feat-alpha'), { method: 'POST', body: blob() })
    assert.strictEqual(wrong.status, 404)
    assert.strictEqual(s.calls.length, 0, 'the route never resolved')

    const right = await request(s.url('/abc123/feat-alpha'), { method: 'POST', body: blob() })
    assert.strictEqual(right.status, 200)
  } finally {
    await s.close()
  }
})

// STAYS SILENT (`negative-checks.md` rule 3). A server that grew a write path
// must not have changed what READING does — and a server given no `receive` at
// all behaves exactly as it did before any of this existed.
test('stays silent: GET still renders, and a server with no receive refuses POSTs', async () => {
  const s = await serving({ receive: null })
  try {
    const get = await request(s.url('/feat-alpha'))
    assert.strictEqual(get.status, 200)
    assert.match(get.body, /<p>ok<\/p>/)
    assert.match(get.type, /text\/html/)

    const post = await request(s.url('/feat-alpha'), { method: 'POST', body: blob() })
    assert.strictEqual(post.status, 404, 'no write path where none was wired')
  } finally {
    await s.close()
  }
})

// --- end to end: a real POST, a real store, a real claim --------------------

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { receivePass, readPending } = (() => {
  const s = require('../src/env/serve.js')
  const r = require('../src/env/review.js')
  return { receivePass: s.receivePass, readPending: r.readPending }
})()
const { loadEnvConfig } = require('../src/env/config.js')
const { claimPending, reviewOutPath } = require('../src/env/review.js')

function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-post-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  const sd = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(sd, { recursive: true })
  fs.writeFileSync(path.join(sd, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'init')
  g('branch', '-M', 'main')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  g('worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  return { dir, spec: { folder: 'feat-alpha', branch: 'feat/alpha', worktreePath: wt } }
}

function drop(dir) {
  try {
    execFileSync('git', ['-C', dir, 'worktree', 'prune'], { stdio: 'ignore' })
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

test('a received pass lands in the holding area and claims back out', async () => {
  const { dir, spec } = repo()
  try {
    const { config } = loadEnvConfig(dir)
    const got = receivePass(dir, config, spec, {
      version: 1,
      spec: 'feat-alpha',
      generatedAt: 'R1',
      accepted: [{ path: 'app.js', hash: 'h1' }],
      unaccepted: [],
      comments: [],
      verdict: 'commit',
    })
    assert.match(got.code, /^\d{6}$/)

    const out = reviewOutPath(dir, 'feat-alpha', null)
    const held = readPending(out, 'feat-alpha').pending
    assert.strictEqual(held.passes.length, 1)
    // The REVIEW is untouched — a POST reaches the holding area and nothing else.
    assert.ok(!fs.existsSync(out.replace(/\.html$/, '') + '.notes.json'), 'no sidecar was written')

    const claimed = claimPending(held, got.code)
    assert.strictEqual(claimed.pass.blob.verdict, 'commit')
  } finally {
    drop(dir)
  }
})

test('two POSTs from one render leave one pass; from two renders, two', () => {
  const { dir, spec } = repo()
  try {
    const { config } = loadEnvConfig(dir)
    const send = (generatedAt, verdict) =>
      receivePass(dir, config, spec, {
        version: 1, spec: 'feat-alpha', generatedAt, accepted: [], unaccepted: [], comments: [], verdict,
      })
    const out = reviewOutPath(dir, 'feat-alpha', null)

    send('R1', 'approve')
    const second = send('R1', 'changes')
    let held = readPending(out, 'feat-alpha').pending
    assert.strictEqual(held.passes.length, 1, 'the same render supersedes')
    assert.strictEqual(held.passes[0].code, second.code)
    assert.strictEqual(held.passes[0].blob.verdict, 'changes', 'the one on the screen')

    send('R2', 'discuss')
    held = readPending(out, 'feat-alpha').pending
    assert.strictEqual(held.passes.length, 2, 'a different render stands alongside')
  } finally {
    drop(dir)
  }
})

test('a spec whose worktree is gone still receives, because its page still serves', () => {
  // THE PREMISE MOVED, deliberately. This asserted that losing the worktree
  // meant receiving nothing — and that is what made a verdict button on a
  // committed docs page appear to do nothing, which is the failure this area
  // keeps producing. The page falls back to the spec's committed documents, so
  // the POST follows the page: whether the verdict is worth acting on is the
  // routing's call, not the endpoint's.
  const { dir, spec } = repo()
  try {
    const { config } = loadEnvConfig(dir)
    fs.rmSync(spec.worktreePath, { recursive: true, force: true })
    const got = receivePass(dir, config, spec, { version: 1, spec: 'feat-alpha' })
    assert.ok(got && /^\d{6}$/.test(String(got.code)), 'a page that offers buttons must accept one')
  } finally {
    drop(dir)
  }
})

test('a spec with neither a worktree nor committed documents receives nothing', () => {
  // The case that must still be refused, and the reason the check is not simply
  // deleted: a name that is no spec at all has no page, so a POST to it is not
  // a reader pressing anything.
  const { dir, spec } = repo()
  try {
    const { config } = loadEnvConfig(dir)
    fs.rmSync(spec.worktreePath, { recursive: true, force: true })
    const ghost = { ...spec, folder: 'feat-nonexistent', slug: 'nonexistent' }
    assert.strictEqual(receivePass(dir, config, ghost, { version: 1, spec: 'feat-nonexistent' }), null)
  } finally {
    drop(dir)
  }
})

// --- an action arrives the same way a verdict does -------------------------

// ONE WRITE PATH, and it does not learn a second shape for an action. The POST
// route hands whatever arrived to the engine's own validator and relays its
// answer — so an action pass is exactly as untrusted, and exactly as contained,
// as a verdict pass. What it does when claimed is the routing's business.
test('an action pass POSTs like any other, and gets a code', async () => {
  const s = await serving({ receive: () => ({ code: '552311' }) })
  try {
    const res = await request(s.url('/feat-alpha'), {
      method: 'POST',
      body: blob({ action: 'live-on' }),
    })
    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(JSON.parse(res.body), { code: '552311' })
    assert.strictEqual(s.calls[0].blob.action, 'live-on')
    // It carries no marks: an action is an instruction, and the reader's
    // accepts travel with the verdict they eventually choose.
    assert.deepStrictEqual(s.calls[0].blob.accepted, [])
    assert.deepStrictEqual(s.calls[0].blob.comments, [])
  } finally {
    await s.close()
  }
})

test("a refused action comes back with the engine's own message", async () => {
  const s = await serving({
    receive: () => ({ error: 'notes blob: action "live-onn" is not one of live-on, live-off' }),
  })
  try {
    const res = await request(s.url('/feat-alpha'), {
      method: 'POST',
      body: blob({ action: 'live-onn' }),
    })
    assert.strictEqual(res.status, 422)
    assert.match(res.body, /is not one of/)
  } finally {
    await s.close()
  }
})
