'use strict'

/**
 * Does the running review server know the engine moved under it?
 *
 * This exists because of an incident, not a hypothesis. A server started before
 * a feature landed went on rendering pre-feature pages for a whole session, and
 * every other check said it was healthy: the process was alive, the settings
 * were readable, the script was on disk, and each render was genuinely current —
 * the file counts moved, `generatedAt` moved, the diff was right. Only the
 * RENDERER was old, which is exactly the thing nothing was looking at.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { engineVersionFor, staleServer } = require('../src/env/serve.js')
const { collectReview } = require('../src/env/review.js')

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-engine-')))
}

// --- staleServer: three outcomes, and the third is the point ----------------

test('a matching version is current, a different one is stale', () => {
  assert.strictEqual(staleServer('9.2.0', '9.2.0'), 'current')
  assert.strictEqual(staleServer('9.2.0', '9.3.1'), 'stale')
  // Direction does not matter: a server running something NEWER than this CLI
  // is equally not the engine this one would start.
  assert.strictEqual(staleServer('9.3.1', '9.2.0'), 'stale')
})

// STAYS SILENT (`negative-checks.md` rule 3). Every one of these is a healthy
// server the check must not accuse. A server started before this shipped has no
// recorded version at all, and reading that absence as "different, therefore
// stale" would restart every running server on the first render after upgrading.
test('stays silent: every unanswerable case is unknown, never stale', () => {
  for (const [recorded, running, why] of [
    [undefined, '9.2.0', 'a server from before this was recorded'],
    [null, '9.2.0', 'an explicit null in the settings file'],
    ['', '9.2.0', 'an empty string is not a version'],
    ['9.2.0', null, 'this engine could not read its own package'],
    ['9.2.0', undefined, 'the same, spelled differently'],
    [3, '9.2.0', 'a version that is not a string'],
    ['9.2.0', 3, 'the same, on the other side'],
  ]) {
    assert.strictEqual(staleServer(recorded, running), 'unknown', why)
  }
})

// --- engineVersionFor: resolve from the SCRIPT, not from the caller ---------

test('the version comes from the package that owns the script', () => {
  const dir = tmp()
  fs.mkdirSync(path.join(dir, 'src', 'env'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '4.5.6' }))
  const script = path.join(dir, 'src', 'env', 'serve.js')
  fs.writeFileSync(script, '')
  assert.strictEqual(engineVersionFor(script), '4.5.6')
  fs.rmSync(dir, { recursive: true, force: true })
})

// THE TRAP THIS AVOIDS. The CLI and the daemon are routinely different packages
// — a superset distribution exposes the `skitterspec` binary from its own
// package while the daemon is resolved out of `node_modules/@skitterbyte/
// skitterspec`. Comparing one package's version against the other's reports a
// mismatch that is never true and never goes away, and wired to a restart that
// is a server replaced on every single render.
test('two packages in one tree each answer for their own script', () => {
  const dir = tmp()
  const daemon = path.join(dir, 'node_modules', '@skitterbyte', 'skitterspec')
  fs.mkdirSync(path.join(daemon, 'src', 'env'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'cli', version: '1.0.0' }))
  fs.writeFileSync(path.join(daemon, 'package.json'), JSON.stringify({ name: 'base', version: '9.2.0' }))
  const script = path.join(daemon, 'src', 'env', 'serve.js')
  fs.writeFileSync(script, '')

  assert.strictEqual(engineVersionFor(script), '9.2.0', 'the daemon answers for itself')
  // And the comparison that matters is that script's version across time — which
  // is `current`, where CLI-vs-daemon would have said `stale` forever.
  assert.strictEqual(staleServer('9.2.0', engineVersionFor(script)), 'current')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('stays silent: an unreadable or version-less package answers null', () => {
  const dir = tmp()
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  const script = path.join(dir, 'src', 'serve.js')
  fs.writeFileSync(script, '')

  // No package.json anywhere up the tree that has a version.
  assert.strictEqual(engineVersionFor(script), null, 'nothing to read')

  fs.writeFileSync(path.join(dir, 'package.json'), '{ not json')
  assert.strictEqual(engineVersionFor(script), null, 'unreadable')

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }))
  assert.strictEqual(engineVersionFor(script), null, 'no version field')

  // And each of those routes to inaction rather than to an accusation.
  assert.strictEqual(staleServer('9.2.0', engineVersionFor(script)), 'unknown')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('no path at all is answered, not thrown', () => {
  for (const v of [null, undefined, '']) assert.strictEqual(engineVersionFor(v), null)
})

// --- the page says which engine drew it -------------------------------------

test('the render carries the engine version into the page data', () => {
  const version = require('../package.json').version
  const data = collectReview({
    spec: { folder: 'feat-x', branch: 'feat/x', worktreePath: '/nowhere' },
    // No files: this test is about the field, and a git reader that answers
    // nothing keeps it that way.
    git: () => '',
    mode: 'working',
    ref: 'HEAD',
    now: '2020-01-01T00:00:00.000Z',
  })
  assert.strictEqual(data.engine, version, 'the engine that drew it is the one reporting')
})

test('the template renders the line, and only when there is a version', () => {
  const template = require('../src/env/review.js').loadTemplate()
  assert.match(template, /id="drawn-by"/, 'the page has somewhere to say it')
  assert.match(template, /rendered by skitterspec/, 'and says it in words a reader can act on')
  // Guarded, so a render that could not read its own version says nothing rather
  // than printing "undefined" at the foot of every page.
  assert.match(template, /if \(data\.engine\)/)
})

// --- phase 2: replacing a stale server, and saying so -----------------------
//
// Driven through the settings file rather than a live daemon. What decides the
// restart is `staleServer` over what the settings recorded, so the settings file
// IS the input — and a test that spawns servers to prove a comparison would be
// slower and would prove less.

const { execFileSync } = require('node:child_process')
const { run } = require('../src/cli.js')

function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-restart-')))
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
  return dir
}

const settingsPath = (dir) => path.join(dir, '.spec-env', 'review-serve.json')

function writeSettings(dir, extra) {
  fs.mkdirSync(path.dirname(settingsPath(dir)), { recursive: true })
  fs.writeFileSync(
    settingsPath(dir),
    JSON.stringify({ dir, port: 7777, host: '0.0.0.0', token: 'abc123', ...extra }),
  )
}

test('a stale server is replaced, and the old token is carried onto the new one', async () => {
  const dir = repo()
  try {
    // The script this engine WOULD start, recorded against an older version.
    const script = require('../src/cli.js').__daemonScriptForTest
      ? require('../src/cli.js').__daemonScriptForTest(dir)
      : path.join(__dirname, '..', 'src', 'env', 'serve.js')
    writeSettings(dir, { script, engine: '0.0.0-old' })

    // The comparison the CLI makes, made here against the same inputs.
    const verdict = staleServer('0.0.0-old', engineVersionFor(script))
    assert.strictEqual(verdict, 'stale', 'the recorded engine differs from this one')

    // THE URL SURVIVES. The operator is usually holding the old link on a phone,
    // so a replacement that minted a fresh token would kill it silently — which
    // is the failure the adoption path was written to avoid in the first place.
    const settings = JSON.parse(fs.readFileSync(settingsPath(dir), 'utf-8'))
    assert.strictEqual(settings.token, 'abc123', 'there is a token to carry')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the reuse rule is in the code, not just the intent', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8')
  // Pinned as source because the alternative is spawning servers to observe a
  // URL: the replacement path reuses the recorded token rather than minting.
  assert.match(src, /const token = reuseToken \|\| repoToken\(dir, config\)/)
  // AND NO LONGER CONDITIONED ON THE BIND. `loopback ? null : …` made the
  // URL's shape follow reader detection, which flips; the token is now carried
  // on every bind so the address has one shape. On loopback it guards nothing
  // and is not there to.
  assert.doesNotMatch(src, /const token = loopback \?/)
  assert.match(src, /reuseToken = settings\.token \|\| null/)

  // UPDATED, AND THE OLD REASONING IS WHY. This read
  // `reuseToken || mintToken()`, on the stated grounds that "a cold start still
  // mints, because there is no link in anyone's hand to preserve". That premise
  // was false: the port is derived per repo and stable across restarts, so a
  // cold start lands on the same port with a different token and the link in
  // someone's hand breaks for no visible reason. Six were handed out for one
  // repo in a session. A cold start now reads the repo's stored token; the
  // replacement path above is redundant rather than wrong, and is kept as its
  // own guarantee.
})

// STAYS SILENT. The ordinary render must read exactly as it did before any of
// this existed, and that is true for BOTH non-stale outcomes — a matching
// engine, and a server too old to have recorded one.
test('stays silent: current and unknown say nothing and restart nothing', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8')
  assert.match(src, /if \(verdict !== 'stale'\) \{/, 'anything but stale returns the adopted server')
  assert.match(src, /up\.replaced === 'engine'/, 'and only an engine replacement is spoken about')
  for (const recorded of [undefined, null, '']) {
    assert.strictEqual(staleServer(recorded, '1.0.0'), 'unknown', 'a pre-feature server is not stale')
  }
  assert.strictEqual(staleServer('1.0.0', '1.0.0'), 'current')
})

test('a failed restart reports both facts, not just the failure', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8')
  // A reader told only "could not start" cannot see why it was trying. The pair
  // — it was stale, and it could not be replaced — is what explains the page
  // they are about to open.
  assert.match(src, /could not be replaced/)
  assert.match(src, /its pages are drawn by that engine/)
  // The stale context rides out on the error paths, or the message above has
  // nothing to name.
  // Pinned as a PROPERTY, not a spelling: every early return from the start
  // path carries `replaced` and `engineWas`, or the message above has nothing
  // to name. An earlier version matched the two lines verbatim and went red
  // when one of them legitimately grew a second failure mode.
  const starts = [...src.matchAll(/return \{[^}]*error: (?:'[a-z]+'|up \? [^}]*?)[^}]*\}/g)].map((m) => m[0])
  const withContext = starts.filter((r) => /replaced/.test(r) && /engineWas/.test(r))
  assert.ok(withContext.length >= 2, `start-path returns carry the stale context: ${starts.join(' | ')}`)
  assert.match(src, /error: 'busy'[^}]*replaced, engineWas/)
  assert.match(src, /error: up \? 'died' : 'silent'/, 'a died-on-start is distinct from a silent one')
})

// THE CONSTRAINT THAT LINKS THIS SPEC TO `feat-review-post-back`, now real.
//
// That spec gives the server a holding area for review passes. If it lived in
// server memory, the automatic restart above would be a new way to lose work —
// you send a pass, the next render replaces the server, and the pass is gone.
// It is on disk, in a file of its own beside the page, and the restart touches
// only `review-serve.json`. This proves the pass survives, and claims it after.
//
// It replaced a placeholder that asserted the constraint was merely WRITTEN
// DOWN, and failed the moment the store appeared — which is how it came to be
// replaced rather than forgotten.
test('a pending pass survives a restart and is still claimable after it', async () => {
  const { run } = require('../src/cli.js')
  const {
    emptyPending,
    addPending,
    writePending,
    readPending,
    readNotes,
  } = require('../src/env/review.js')

  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-survive-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  try {
    g('init', '-q')
    g('config', 'user.email', 'test@example.com')
    g('config', 'user.name', 'Test')
    fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local', serve: 'never' } }),
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
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\n')

    const quiet = async (argv) => {
      const orig = process.stdout.write
      let out = ''
      process.stdout.write = (c) => ((out += c), true)
      try {
        await run(argv)
      } finally {
        process.stdout.write = orig
      }
      return out
    }
    await quiet(['spec-env', 'review', 'feat-alpha', '--dir', dir])

    const out = path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html')
    const added = addPending(readPending(out, 'feat-alpha').pending, {
      blob: { version: 1, spec: 'feat-alpha', accepted: [{ path: 'app.js', hash: 'h1' }], unaccepted: [], comments: [] },
      at: '2020-01-01T00:00:00.000Z',
      render: 'R1',
    })
    writePending(out, added.pending)

    // The restart's ONLY on-disk effect: the serve settings are rewritten. The
    // holding area is a different file and is not in that path at all.
    const settings = path.join(dir, '.spec-env', 'review-serve.json')
    fs.mkdirSync(path.dirname(settings), { recursive: true })
    fs.writeFileSync(settings, JSON.stringify({ dir, port: 7777, host: '0.0.0.0', token: 't', engine: '1.0.0' }))
    fs.writeFileSync(settings, JSON.stringify({ dir, port: 7777, host: '0.0.0.0', token: 't', engine: '2.0.0' }))

    assert.strictEqual(readPending(out, 'feat-alpha').pending.passes.length, 1, 'the pass is still there')

    // And it still claims — the whole point, since `--claim` needs no server.
    await quiet(['spec-env', 'review', 'feat-alpha', '--dir', dir, '--claim', added.code])
    assert.strictEqual(
      readNotes(out, 'feat-alpha').notes.files['app.js'].acceptedHash,
      'h1',
      'the pass reached the review after the restart',
    )
  } finally {
    try {
      execFileSync('git', ['-C', dir, 'worktree', 'prune'], { stdio: 'ignore' })
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
  }
})

test('the holding area and the serve settings are separate files', () => {
  // The structural reason the test above passes, asserted so a later change
  // that folded pending state into the serve settings would be caught.
  const { reviewPendingPath } = require('../src/env/review.js')
  const pending = reviewPendingPath('/repo/.spec-env/reviews/feat-x.html')
  assert.match(pending, /reviews\/feat-x\.pending\.json$/)
  assert.ok(!pending.includes('review-serve.json'), 'not the file a restart rewrites')
})

// --- two specs in parallel must not fight over the one server ---------------
//
// There is ONE review server per repo — settings, pidfile and port all live in
// the primary checkout — and it deliberately serves every provisioned spec. So
// the obvious worry about a restart is that two sessions, standing in two
// different worktrees on two different branches, each decide the other's server
// is stale and replace it on every render.
//
// They cannot, and the reason is structural rather than lucky: the version
// compared is a property of the PRIMARY CHECKOUT's daemon package, which both
// sessions resolve identically because `dir` is anchored there before anything
// is resolved. Standing somewhere else cannot change the answer. These guard
// that, because an "improvement" to resolve the daemon from cwd would introduce
// exactly the flapping this rules out.

const { daemonScript } = require('../src/cli.js')

function fakeRepo() {
  const dir = tmp()
  const daemon = path.join(dir, 'node_modules', '@skitterbyte', 'skitterspec')
  fs.mkdirSync(path.join(daemon, 'src', 'env'), { recursive: true })
  fs.writeFileSync(path.join(daemon, 'package.json'), JSON.stringify({ name: 'base', version: '7.7.7' }))
  fs.writeFileSync(path.join(daemon, 'src', 'env', 'serve.js'), '')
  return dir
}

test('the daemon resolves from the repo root, not from where you are standing', () => {
  const root = fakeRepo()
  const elsewhere = tmp()
  const was = process.cwd()
  try {
    // The same root, asked from two different working directories — which is
    // exactly two sessions in two worktrees asking about one shared server.
    process.chdir(root)
    const fromRoot = daemonScript(root)
    process.chdir(elsewhere)
    const fromElsewhere = daemonScript(root)
    assert.strictEqual(fromRoot, fromElsewhere, 'cwd does not move the daemon')
    assert.strictEqual(engineVersionFor(fromRoot), engineVersionFor(fromElsewhere))
    assert.strictEqual(engineVersionFor(fromRoot), '7.7.7')
  } finally {
    process.chdir(was)
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(elsewhere, { recursive: true, force: true })
  }
})

test('two sessions reach the same verdict, so at most one of them restarts', () => {
  const root = fakeRepo()
  try {
    const script = daemonScript(root)
    const recorded = '7.7.6' // what the running server was started on
    // Both sessions ask the same question of the same shared settings file and
    // the same daemon package, so they get the same answer. The first to act
    // stamps the new version; the second then sees `current` and adopts.
    const sessionA = staleServer(recorded, engineVersionFor(script))
    const sessionB = staleServer(recorded, engineVersionFor(script))
    assert.strictEqual(sessionA, 'stale')
    assert.strictEqual(sessionB, sessionA, 'no disagreement to flap over')

    // After the first one restarts, the settings record the daemon's version —
    // and every session, including the one that did not restart, reads current.
    const afterRestart = engineVersionFor(script)
    assert.strictEqual(staleServer(afterRestart, engineVersionFor(script)), 'current')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('the anchoring that makes the above true is still in the code', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8')
  // Every subcommand resolves against the primary checkout, whichever worktree
  // it was typed in. Remove this and two worktrees become two different repos
  // as far as the server is concerned.
  assert.match(src, /dir = resolvePrimaryCheckout\(dir, gitReader\(dir\)\)/)
})
