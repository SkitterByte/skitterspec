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
  receivePass,
  startReviewServer,
} = require('../src/env/serve.js')
const { loadEnvConfig } = require('../src/env/config.js')
const {
  reviewOutPath,
  writeNotes,
  emptyNotes,
  writeGate,
  armGate,
  emptyGate,
} = require('../src/env/review.js')
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
    JSON.stringify(
      {
        baseBranch: 'main',
        docker: { enabled: false },
        // THE `{identifier}` TOKEN, deliberately — it is what this repo really
        // configures, and it is the only companion shape that reads a spec's
        // frontmatter. A scaffold with no companion patterns never calls that
        // code at all, which is why the index threw on every spec while this
        // suite stayed green.
        spec: { companionPaths: ['specs/.core/linear-base/{identifier}.base.json'] },
        // AND the field it reads. The throw needs BOTH — an `{identifier}`
        // pattern and a configured field to look up — because
        // `readFrontmatterField` short-circuits on a missing field name before
        // it ever touches the path. A scaffold with one and not the other looks
        // like coverage and is not: this test passed against the unguarded code
        // until this line was added.
        branch: { pattern: '{type}/{slug}', identifierField: 'linear_identifier' },
      },
      null,
      2,
    ),
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
        return { folder: s.folder, branch: one ? one.branch : '', totals: specSummary(one, dir, config) }
      }),
    render: (folder, opts) => renderSpecPage(dir, config, resolveOne(folder), opts),
    receive: (folder, blob) => receivePass(dir, config, resolveOne(folder), blob),
    token,
  })
  const addr = await startReviewServer(server, { port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${addr.port}/${token ? token + '/' : ''}`
  return {
    base,
    get: (p = '') => fetch(base + p),
    post: (p, body) =>
      fetch(base + p, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
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

// --- the served page carries the REVIEW'S state, not just the diff ----------
//
// It once rendered without the notes sidecar, on the reasoning that this path
// writes no file. But the reader on a phone is reading THIS page: without the
// sidecar their own accepts vanished on every refresh and the history line
// never appeared at all, so the two surfaces answered differently about one
// review. Read-only — nothing on this path writes the sidecar.

test('a served page shows the accepts the sidecar holds', async () => {
  const { dir, wt } = scaffold()
  const { config } = loadEnvConfig(dir)
  const g = gitReader(dir)
  const spec = resolveSpec('feat-alpha', dir, config, { searchDirs: [...liveWorktreePaths(g)] })
  try {
    const out = reviewOutPath(dir, 'feat-alpha')
    const hash = execFileSync('git', ['-C', wt, 'hash-object', '--', 'added.js']).toString().trim()
    writeNotes(out, {
      ...emptyNotes('feat-alpha'),
      files: { 'added.js': { acceptedHash: hash, acceptedAt: '2026-01-01T00:00:00.000Z' } },
    })
    const page = renderSpecPage(dir, config, spec, {})
    const data = JSON.parse(/__REVIEW_DATA__|<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/.exec(page.html)[1])
    const added = data.files.find((f) => f.path === 'added.js')
    assert.strictEqual(added.accepted, true, 'the accept reached the served page')
  } finally {
    cleanup(dir)
  }
})

test('a served page shows the gate, and says nothing when there is none', async () => {
  const { dir } = scaffold()
  const { config } = loadEnvConfig(dir)
  const g = gitReader(dir)
  const spec = resolveSpec('feat-alpha', dir, config, { searchDirs: [...liveWorktreePaths(g)] })
  try {
    const out = reviewOutPath(dir, 'feat-alpha')
    const read = (html) =>
      JSON.parse(/<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/.exec(html)[1])

    // Absent stays absent: a project that never armed one renders as it always
    // did, with no key at all.
    assert.strictEqual(read(renderSpecPage(dir, config, spec, {}).html).gate, undefined)

    writeGate(out, armGate(emptyGate('feat-alpha'), { at: '2026-01-01T00:00:00.000Z', phase: '2' }))
    const armed = read(renderSpecPage(dir, config, spec, {}).html)
    assert.strictEqual(armed.gate.armed, true)
    assert.strictEqual(armed.gate.phase, '2')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: an unreadable gate does not break the served page', async () => {
  const { dir } = scaffold()
  const { config } = loadEnvConfig(dir)
  const g = gitReader(dir)
  const spec = resolveSpec('feat-alpha', dir, config, { searchDirs: [...liveWorktreePaths(g)] })
  try {
    const out = reviewOutPath(dir, 'feat-alpha')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out.replace(/\.html$/, '') + '.gate.json', '{ not json')
    const page = renderSpecPage(dir, config, spec, {})
    assert.ok(page.html.length > 0, 'the page still renders')
    assert.ok(page.totals.files > 0, 'and still has the diff, which is what it is for')
  } finally {
    cleanup(dir)
  }
})


// --- a spec with no worktree: the authoring page, served --------------------
//
// This is the case that broke. `feat-a-new-spec-gets-a-page` made
// `spec-env review --docs` render a spec with no worktree, and left the
// identical worktree gate in this file — so the page was written and then 404'd
// by the only transport that can POST a verdict. Every test below fails against
// that version.

// `feat-unstarted` is committed by the scaffold, so give it something
// uncommitted: that is what an authoring page IS — a spec just written.
function authorIt(dir, folder = 'feat-unstarted') {
  const sd = path.join(dir, 'specs', 'backlog', folder)
  fs.mkdirSync(sd, { recursive: true })
  fs.writeFileSync(path.join(sd, '01-first.md'), `# Phase 1 — first ⬜\n\nGoal.\n`)
  return sd
}

test('a backlog spec with uncommitted documents is served, not 404ed', async () => {
  const { dir } = scaffold()
  authorIt(dir)
  const s = await serve(dir)
  try {
    const res = await s.get('feat-unstarted')
    assert.strictEqual(res.status, 200, 'the authoring page is the one page that must be servable')
    const html = await res.text()
    assert.match(html, /01-first\.md/, 'and it shows the document that is uncommitted')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('it appears in the index too, since a page nobody finds is no page', async () => {
  const { dir } = scaffold()
  authorIt(dir)
  const s = await serve(dir)
  try {
    const html = await (await s.get()).text()
    assert.match(html, /feat-unstarted/)
    assert.doesNotMatch(html, /error|failed/i)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('the served docs page shows this spec and not another spec written beside it', async () => {
  const { dir } = scaffold()
  authorIt(dir)
  // A second spec authored in the same checkout — the ordinary state of this
  // workflow, and what a render-the-whole-tree version would leak.
  authorIt(dir, 'feat-theirs')
  const s = await serve(dir)
  try {
    const res = await s.get('feat-unstarted')
    // ASSERT 200 FIRST. A 404 body names no spec either, so without this the
    // test passed against the gate it exists to catch — a false pass found by
    // mutating the gate back rather than by reading it.
    assert.strictEqual(res.status, 200)
    const html = await res.text()
    assert.doesNotMatch(html, /feat-theirs/, "a colleague's spec must never appear")
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('the served docs page carries the authoring buttons, not the phase ones', async () => {
  const { dir } = scaffold()
  authorIt(dir)
  const s = await serve(dir)
  try {
    const html = await (await s.get('feat-unstarted')).text()
    // A spec with no worktree has no phase in flight, so "commit and build the
    // next phase" is the wrong offer.
    assert.match(html, /"buttons":\s*"authoring"/)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('a verdict POSTed from a docs page is accepted, which is the whole point', async () => {
  const { dir } = scaffold()
  authorIt(dir)
  const s = await serve(dir)
  try {
    const res = await s.post('feat-unstarted', {
      version: 1,
      spec: 'feat-unstarted',
      accepted: [],
      unaccepted: [],
      comments: [],
      verdict: 'commit-start',
    })
    assert.strictEqual(res.status, 200, 'rejecting this left the buttons with nowhere to go')
    const body = await res.json()
    assert.match(String(body.code), /^\d{6}$/, 'and it hands back a claim code')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

// --- stays silent (rule 3) --------------------------------------------------

test('STAYS SILENT: a spec with a worktree still serves its branch view', async () => {
  const { dir } = scaffold()
  authorIt(dir)
  const s = await serve(dir)
  try {
    const html = await (await s.get('feat-alpha')).text()
    assert.match(html, /added\.js/, 'the worktree view is unchanged')
    assert.doesNotMatch(html, /"buttons":\s*"authoring"/, 'and it keeps the committing set')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('STAYS SILENT: a committed backlog spec is still omitted and still 404s', async () => {
  const { dir } = scaffold()
  // Nothing uncommitted of its own — the ordinary state of most of specs/.
  const s = await serve(dir)
  try {
    const html = await (await s.get()).text()
    assert.doesNotMatch(html, /feat-unstarted/)
    assert.strictEqual((await s.get('feat-unstarted')).status, 404)
  } finally {
    await s.close()
    cleanup(dir)
  }
})


// --- the index survives a spec shape that carries no path -------------------

test('the index lists specs rather than failing on one with no frontmatter path', async () => {
  const { dir } = scaffold()
  authorIt(dir)
  const s = await serve(dir)
  try {
    const res = await s.get()
    assert.strictEqual(res.status, 200)
    const html = await res.text()
    // The regression: `allSpecs` hands back `{folder, slug, worktreePath}` with
    // no `path`, and expanding an `{identifier}` companion read the frontmatter
    // of `undefined` — so the whole index answered
    // `render failed: The "path" argument must be of type string`.
    assert.doesNotMatch(html, /render failed/, 'one unresolvable companion must not cost the page')
    assert.doesNotMatch(html, /must be of type string/)
    assert.match(html, /feat-alpha/, 'and the specs are actually listed')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('an unresolvable companion is simply not owned, and nothing throws', () => {
  // The unit-level half, so the fix is pinned where it lives rather than only
  // through the page that exposed it.
  const { classifyDirtyTree } = require('../src/env/classify.js')
  const bare = { folder: 'feat-alpha', slug: 'alpha' } // no `path`, as allSpecs returns
  const config = {
    spec: { companionPaths: ['specs/.core/linear-base/{identifier}.base.json'] },
    branch: { identifierField: 'linear_identifier' },
  }
  const out = classifyDirtyTree(bare, ['specs/backlog/feat-alpha/00-overview.md', 'app.js'], config)
  assert.deepStrictEqual(out.owned, ['specs/backlog/feat-alpha/00-overview.md'])
  assert.deepStrictEqual(out.foreign, ['app.js'])
})
