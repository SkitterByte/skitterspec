'use strict'

/**
 * A `/no-spec` branch is servable, or `/no-spec` is a lie.
 *
 * That skill provisions a branch, renders a page, ARMS THE GATE and then emits
 * the banner saying it is holding for a verdict — over a URL that returned 404
 * for every specless branch there has ever been. The work was reviewable on
 * disk and unreachable over http, which on a phone means unreachable.
 *
 * WHAT THE BUG ACTUALLY WAS: both resolvers already handle specless branches —
 * `resolveSpec` takes `opts.specless` and `allSpecs` takes a specless map — and
 * the server passed neither. `cli.js` gets this right (`allSpecs(dir, config,
 * worktreePaths, speclessMap(dir, config))`), so the capability was there and
 * one call site was simply written without it.
 *
 * AND THE WIRING WAS COPIED, which is the part worth guarding. `serve.js`'s
 * entry point built `resolveOne`/`resolveEntries` inline, and this suite's own
 * helper built them again the same way — so a fix applied to one would leave
 * the other broken, and a test standing up the second would prove nothing about
 * the first. The fix is one exported `serverHooks`, used by both; the last test
 * here is what stops a third copy appearing.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { serverHooks, createReviewServer, startReviewServer } = require('../src/env/serve.js')
const { loadEnvConfig } = require('../src/env/config.js')
const { readRegistry, writeRegistry } = require('../src/env/registry.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

/**
 * A repo with one ordinary spec and one SPECLESS branch, both provisioned.
 *
 * Two, deliberately: the specless one is the subject, and the ordinary one is
 * what proves a fix did not reach it by breaking everything else into the same
 * shape.
 */
function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-specless-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({
      baseBranch: 'main',
      docker: { enabled: false },
      branch: { pattern: '{type}/{slug}' },
      review: { reader: 'local', serve: 'never' },
    }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\n')
  const sd = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(sd, { recursive: true })
  fs.writeFileSync(path.join(sd, '00-overview.md'), '# feat-alpha\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  const root = path.resolve(dir, `../${path.basename(dir)}-wt`)
  const specWt = path.join(root, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', specWt)
  fs.writeFileSync(path.join(specWt, 'app.js'), 'one\ntwo\nthree\n')

  // The specless branch, recorded exactly as `spec-env nospec` records one:
  // a registry entry and a worktree, and nothing at all under `specs/**`.
  const choreWt = path.join(root, 'tidy-up')
  git(dir, 'worktree', 'add', '-q', '-b', 'chore/tidy-up', choreWt)
  fs.writeFileSync(path.join(choreWt, 'app.js'), 'one\nTWO\n')
  const { config } = loadEnvConfig(dir)
  const reg = readRegistry(dir, config)
  reg.specless = { ...(reg.specless || {}), 'tidy-up': { type: 'chore', slug: 'tidy-up' } }
  writeRegistry(dir, config, reg)

  return { dir, specWt, choreWt }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

/**
 * Stand the real server up THROUGH THE PRODUCTION WIRING.
 *
 * `serverHooks` is what the daemon's entry point uses, so a test that passes
 * here is a statement about what actually runs. The previous helper rebuilt the
 * hooks itself, which made it possible for the suite to be green about a server
 * nobody was shipping.
 */
async function serve(dir) {
  const { config } = loadEnvConfig(dir)
  const server = createReviewServer({ ...serverHooks(dir, config), token: null })
  const addr = await startReviewServer(server, { port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${addr.port}/`
  return {
    base,
    get: (p = '') => fetch(base + p),
    close: () => new Promise((r) => server.close(r)),
  }
}

/* ==========================================================================
 * The bug
 * ========================================================================== */

test('a specless branch serves its page', async () => {
  // RED BEFORE THE FIX: 404, "not found". The page was on disk the whole time.
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    const res = await s.get('tidy-up')
    assert.strictEqual(res.status, 200, 'a /no-spec page must be reachable')
    const html = await res.text()
    assert.match(html, /app\.js/, 'and it is that branch\'s diff')
    assert.match(html, /TWO/, 'showing the change made in its worktree')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('a specless branch is listed on the index', async () => {
  // The other half, and a separate call site: the index comes from
  // `servableSpecs` → `allSpecs`, which took its own specless map and was
  // handed none. A page you can reach only by typing its URL is not listed.
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    const html = await (await s.get('')).text()
    assert.match(html, /tidy-up/, 'the specless branch is on the index')
    assert.match(html, /feat-alpha/, 'and so is the ordinary spec')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('an ordinary spec is unaffected', async () => {
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    const res = await s.get('feat-alpha')
    assert.strictEqual(res.status, 200)
    assert.match(await res.text(), /three/, 'its own diff, not the other branch\'s')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

/* ==========================================================================
 * Stays silent (`.claude/rules/negative-checks.md` rule 3)
 * ========================================================================== */

test('stays silent: a name in neither specs/** nor the registry is still a 404', async () => {
  // The fix widens what resolves, and it must not widen it to everything: a
  // typo has to stay a 404, or the registry's word stops being the positive
  // signal `resolveSpec` documents it as.
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    assert.strictEqual((await s.get('tidy-upp')).status, 404)
    assert.strictEqual((await s.get('feat-nonesuch')).status, 404)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('stays silent: a repo that has never used /no-spec serves exactly as before', async () => {
  // Every repo is in this state until someone runs `/no-spec`, so the first
  // obligation of the fix is to change nothing for them. An absent `specless`
  // key must read as an empty map, never as a reason to throw.
  const { dir } = scaffold()
  const { config } = loadEnvConfig(dir)
  const reg = readRegistry(dir, config)
  delete reg.specless
  writeRegistry(dir, config, reg)

  const s = await serve(dir)
  try {
    assert.strictEqual((await s.get('feat-alpha')).status, 200)
    assert.strictEqual((await s.get('tidy-up')).status, 404, 'no record, so no resolution')
    const html = await (await s.get('')).text()
    assert.doesNotMatch(html, /tidy-up/)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('stays silent: an unreadable registry serves the specs it can still see', async () => {
  // Cannot-tell routed to the harmless branch. A corrupt registry costs the
  // specless branches their pages; it must not take the ordinary specs down
  // with them, and it must not throw out of a request handler.
  const { dir } = scaffold()
  const { config } = loadEnvConfig(dir)
  fs.writeFileSync(path.join(dir, config.registry), '{ not json')

  const s = await serve(dir)
  try {
    assert.strictEqual((await s.get('feat-alpha')).status, 200)
    assert.strictEqual((await s.get('tidy-up')).status, 404)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

/* ==========================================================================
 * One wiring, not three
 * ========================================================================== */

test('the daemon builds its hooks with serverHooks, and nowhere else', () => {
  // THE GUARD THE BUG ARGUES FOR. The entry point and this suite's own helper
  // each built `resolveOne` inline, so the missing argument had to be fixed —
  // and could be missed — in two places independently. A third copy is how it
  // comes back.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'env', 'serve.js'), 'utf8')
  const entry = src.slice(src.indexOf('if (require.main === module)'))
  assert.ok(entry, 'the entry point is there to check')
  assert.match(entry, /serverHooks\(dir, config\)/, 'the daemon uses the shared wiring')
  assert.doesNotMatch(entry, /resolveSpec\(/, 'and does not rebuild a resolver of its own')

  // And the hooks the server needs all come from one place.
  assert.deepStrictEqual(
    Object.keys(serverHooks('/nowhere', { registry: '.spec-env/registry.json', spec: {} })).sort(),
    ['passState', 'receive', 'render', 'resolveEntries'],
  )
})

test('no test resolves specs with wiring of its own', () => {
  // The other copy was in the suite, not the source — which is why the suite
  // could not catch this. A test that RESOLVES REAL SPECS to build its hooks
  // must get them from `serverHooks`, or it is testing a server nobody ships.
  //
  // WHAT WOULD FOOL A BROADER VERSION OF THIS, and did: "calls
  // `createReviewServer` without `serverHooks`" accused
  // `env-serve-pass-state` and `env-serve-post`, which are entirely correct.
  // Those inject STUB callbacks on purpose — they drive the real request
  // handling with no repo behind them at all, which is the seam
  // `createReviewServer` exists to offer. A stub server is not a second copy of
  // the wiring; it is the absence of wiring, deliberately.
  //
  // So the signal is positive and narrow: reaching for a RESOLVER. Nothing that
  // stubs its hooks touches one.
  const RESOLVERS = /\b(resolveSpec|servableSpecs|allSpecs)\(/
  const dir = __dirname
  const offenders = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.test.js'))
    .filter((f) => {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      return src.includes('createReviewServer(') && RESOLVERS.test(src) && !src.includes('serverHooks(')
    })
  assert.deepStrictEqual(offenders, [], 'these build their own server wiring')
})

test('and the guard can fire', () => {
  // A guard that matched nothing would pass for the wrong reason — the check
  // above is only worth having if the shape it looks for is really there.
  const RESOLVERS = /\b(resolveSpec|servableSpecs|allSpecs)\(/
  const fake = "createReviewServer({ render: () => resolveSpec('x') })"
  assert.ok(fake.includes('createReviewServer(') && RESOLVERS.test(fake) && !fake.includes('serverHooks('))
})
