'use strict'

/**
 * `spec-env review serve` — the diff served, not snapshotted.
 *
 * Two halves, like the other review tests. `routeFor` and `renderIndex` are pure
 * and unit-tested, because routing is where the token guard lives and a guard
 * asserted through a socket is a guard tested once. Everything else stands a
 * REAL server up on an ephemeral port against a REAL git fixture, because the
 * claim being made is that a request produces a current page — and only a real
 * request against real git objects can show that.
 *
 * Half of these are stays-silent tests (`.claude/rules/negative-checks.md`
 * rule 3): a spec with no worktree, a server that is not running, and a
 * loopback bind all have to produce silence rather than an error or a token.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const {
  routeFor,
  renderIndex,
  mintToken,
  servableSpecs,
  specSummary,
  renderSpecPage,
  createReviewServer,
  startReviewServer,
} = require('../src/env/serve.js')
const { loadEnvConfig } = require('../src/env/config.js')
const { resolveSpec, liveWorktreePaths } = require('../src/env/resolve.js')
const { run } = require('../src/cli.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

const gitReader = (cwd) => (argv) => {
  try {
    return execFileSync('git', ['-C', cwd, ...argv], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

// Two specs: one provisioned with a worktree and real changes, one left in
// backlog with no worktree at all — the second is the stays-silent case.
function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-serve-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\n')
  for (const name of ['feat-alpha', 'feat-unstarted']) {
    const sd = path.join(dir, 'specs', name === 'feat-alpha' ? 'in-progress' : 'backlog', name)
    fs.mkdirSync(sd, { recursive: true })
    fs.writeFileSync(path.join(sd, '00-overview.md'), `# ${name}\n\n> **Stack:** worktree\n`)
  }
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\nthree\n')
  fs.writeFileSync(path.join(wt, 'added.js'), 'brand new\n')
  return { dir, wt }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

// Stand the real server up on an ephemeral port, wired exactly as the CLI wires
// it, and hand back a fetch bound to it.
async function serve(dir, { token = null } = {}) {
  const { config } = loadEnvConfig(dir)
  const g = gitReader(dir)
  const resolveOne = (folder) => {
    try {
      return resolveSpec(folder, dir, config, { searchDirs: [...liveWorktreePaths(g)] })
    } catch {
      return null
    }
  }
  const server = createReviewServer({
    resolveEntries: () =>
      servableSpecs(dir, config, g).map((s) => {
        const one = resolveOne(s.folder)
        return { folder: s.folder, branch: one ? one.branch : '', totals: specSummary(one) }
      }),
    render: (folder, opts) => renderSpecPage(dir, config, resolveOne(folder), opts),
    token,
  })
  const addr = await startReviewServer(server, { port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${addr.port}/${token ? token + '/' : ''}`
  return {
    base,
    get: (p = '') => fetch(base + p),
    root: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise((r) => server.close(r)),
  }
}

// --- routing is pure, and the token guard lives here -----------------------

test('routes resolve to the index, a spec, or nothing', () => {
  assert.deepStrictEqual(routeFor('/'), { kind: 'index' })
  assert.deepStrictEqual(routeFor('/feat-alpha'), {
    kind: 'spec',
    spec: 'feat-alpha',
    branch: false,
  })
  assert.strictEqual(routeFor('/feat-alpha?branch=1').branch, true)
  assert.strictEqual(routeFor('/feat-alpha?branch').branch, true)
  assert.strictEqual(routeFor('/a/b').kind, 'notfound')
})

// `?branch=0` has to mean what it says, or a link can turn the whole-spec view
// on and never off again.
test('branch=0 and branch=false switch it back off', () => {
  assert.strictEqual(routeFor('/feat-alpha?branch=0').branch, false)
  assert.strictEqual(routeFor('/feat-alpha?branch=false').branch, false)
})

test('a token is required on every path, and a wrong one is not found', () => {
  const token = 'abc123'
  assert.deepStrictEqual(routeFor('/abc123/', { token }), { kind: 'index' })
  assert.strictEqual(routeFor('/abc123/feat-alpha', { token }).spec, 'feat-alpha')
  assert.strictEqual(routeFor('/', { token }).kind, 'notfound')
  assert.strictEqual(routeFor('/wrong/', { token }).kind, 'notfound')
  assert.strictEqual(routeFor('/feat-alpha', { token }).kind, 'notfound')
})

test('a minted token is long enough not to be guessed', () => {
  const a = mintToken()
  assert.match(a, /^[0-9a-f]{12}$/)
  assert.notStrictEqual(a, mintToken(), 'two mints must not collide')
})

test('the index escapes what it interpolates', () => {
  const html = renderIndex([
    { folder: 'feat-<script>', branch: 'feat/"x', totals: { files: 1, additions: 2, deletions: 3 } },
  ])
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /feat-&lt;script&gt;/)
})

// --- the server, against real git -----------------------------------------

test('the index lists a provisioned spec with counts that match the page', async () => {
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    const html = await (await s.get()).text()
    assert.match(html, /feat-alpha/)
    // Two changed files: app.js modified, added.js untracked. The untracked one
    // is the reason the index cannot just read `git diff`.
    assert.match(html, /2 files/)
    assert.match(html, /\+2/, 'one line added to app.js, one whole new file')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('a spec page is served whole, with its data island', async () => {
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    const res = await s.get('feat-alpha')
    assert.strictEqual(res.status, 200)
    const html = await res.text()
    assert.match(html, /^<!doctype html>/i, 'the server owns the wrapper — no unwrap anywhere')
    assert.match(html, /"mode":"working"/)
    assert.match(html, /added\.js/, 'an untracked file is in the served diff')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('?branch=1 serves the whole-spec view from the same URL', async () => {
  const { dir, wt } = scaffold()
  git(wt, 'add', '-A')
  git(wt, 'commit', '-q', '-m', 'phase 1')
  const s = await serve(dir)
  try {
    const html = await (await s.get('feat-alpha?branch=1')).text()
    assert.match(html, /"mode":"branch"/)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

// The whole reason to serve rather than write a file: no snapshot to go stale.
test('a change made after the server started is in the next response', async () => {
  const { dir, wt } = scaffold()
  const s = await serve(dir)
  try {
    const before = await (await s.get('feat-alpha')).text()
    assert.doesNotMatch(before, /later-edit/)
    fs.writeFileSync(path.join(wt, 'later.js'), 'later-edit\n')
    const after = await (await s.get('feat-alpha')).text()
    assert.match(after, /later-edit/, 'rendered per request, so there is nothing to invalidate')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

// --- stays silent ----------------------------------------------------------

test('a spec with no worktree is omitted from the index, not listed as an error', async () => {
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    const html = await (await s.get()).text()
    assert.doesNotMatch(html, /feat-unstarted/, 'an unstarted spec has nothing to diff')
    assert.doesNotMatch(html, /error|failed/i)
    assert.strictEqual((await s.get('feat-unstarted')).status, 404)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('an empty index says so rather than rendering a page that reads as broken', () => {
  const html = renderIndex([])
  assert.match(html, /No spec has a worktree/)
  assert.doesNotMatch(html, /error|failed/i)
})

test('a tokened server 404s the untokened path, and never redirects to it', async () => {
  const { dir } = scaffold()
  const s = await serve(dir, { token: 'tok123456789' })
  try {
    const res = await fetch(s.root + '/', { redirect: 'manual' })
    assert.strictEqual(res.status, 404)
    assert.strictEqual(res.headers.get('location'), null, 'a redirect would confirm we are here')
    assert.strictEqual((await s.get()).status, 200, 'the tokened path still works')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('--status with nothing running says so and exits 0', async () => {
  const { dir } = scaffold()
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (c) => {
    out += c
    return true
  }
  try {
    await run(['spec-env', 'review', 'serve', '--status', '--dir', dir])
  } finally {
    process.stdout.write = orig
    cleanup(dir)
  }
  assert.match(out, /not running/)
  assert.doesNotMatch(out, /error/i)
})

test('--stop with nothing running is a no-op, not a failure', async () => {
  const { dir } = scaffold()
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (c) => {
    out += c
    return true
  }
  try {
    await run(['spec-env', 'review', 'serve', '--stop', '--dir', dir])
  } finally {
    process.stdout.write = orig
    cleanup(dir)
  }
  assert.match(out, /nothing to stop/)
})
