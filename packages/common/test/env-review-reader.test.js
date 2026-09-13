'use strict'

/**
 * Reader detection — where the person reading this actually is.
 *
 * `detectReader` takes its environment as an argument rather than reading
 * `process.env`, so every test STATES the world it is testing. A test that
 * inherited the ambient environment would pass or fail depending on whether the
 * suite was run over ssh, from a bridged session, or on CI — which is precisely
 * the variation being detected.
 *
 * Most of these are stays-silent tests (`.claude/rules/negative-checks.md`
 * rule 3), because the expensive mistake here is CONFIDENCE: a wrong `local`
 * prints a dead link, and a wrong `remote` would warn at someone whose link
 * works fine. `unknown` is the answer that claims least, and it has to be the
 * default.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { detectReader, resolveReader } = require('../src/env/review.js')
const { loadEnvConfig } = require('../src/env/config.js')
const { run } = require('../src/cli.js')

// --- the signals -----------------------------------------------------------

test('ssh means the page is on a machine the reader is not looking at', () => {
  assert.deepStrictEqual(detectReader({ SSH_CONNECTION: '10.0.0.1 1 10.0.0.2 22' }), {
    reader: 'remote',
    why: 'ssh',
  })
  assert.deepStrictEqual(detectReader({ SSH_TTY: '/dev/pts/0' }), {
    reader: 'remote',
    why: 'ssh',
  })
})

test('a bridged session means the operator is driving from elsewhere', () => {
  assert.deepStrictEqual(detectReader({ CLAUDE_CODE_BRIDGE_SESSION_ID: 'abc' }), {
    reader: 'remote',
    why: 'bridge session',
  })
})

test('ssh outranks the bridge marker, being the stabler signal', () => {
  const both = detectReader({ SSH_CONNECTION: 'x', CLAUDE_CODE_BRIDGE_SESSION_ID: 'y' })
  assert.strictEqual(both.why, 'ssh')
})

// --- stays silent ----------------------------------------------------------

// The exact environment this feature was written from: a local Warp CLI on the
// dev machine, with the operator reading on a phone. `ENTRYPOINT` says `cli`,
// which is true of the process and wrong about the reader — so consulting it
// would produce a confident, wrong `local`.
test('the entrypoint is not consulted, because it describes the process', () => {
  const env = { CLAUDE_CODE_ENTRYPOINT: 'cli', TERM_PROGRAM: 'WarpTerminal', TERM: 'xterm-256color' }
  assert.deepStrictEqual(detectReader(env), { reader: 'unknown', why: null })
})

test('no signal at all is unknown, never local', () => {
  assert.deepStrictEqual(detectReader({}), { reader: 'unknown', why: null })
  assert.deepStrictEqual(detectReader(), { reader: 'unknown', why: null })
})

test('an empty-string signal is not a signal', () => {
  assert.strictEqual(detectReader({ SSH_CONNECTION: '', SSH_TTY: '' }).reader, 'unknown')
  assert.strictEqual(detectReader({ CLAUDE_CODE_BRIDGE_SESSION_ID: '' }).reader, 'unknown')
})

// --- config outranks every signal, in both directions ----------------------

test('an explicit reader is believed without sniffing', () => {
  assert.deepStrictEqual(
    resolveReader({ review: { reader: 'local' } }, { SSH_CONNECTION: 'x' }),
    { reader: 'local', why: 'configured' },
    'told local, over a signal that says remote',
  )
  assert.deepStrictEqual(
    resolveReader({ review: { reader: 'remote' } }, {}),
    { reader: 'remote', why: 'configured' },
    'told remote, with no signal at all',
  )
})

test('detect defers to the signals, and a missing config behaves like detect', () => {
  assert.strictEqual(resolveReader({ review: { reader: 'detect' } }, { SSH_TTY: 'x' }).reader, 'remote')
  assert.strictEqual(resolveReader({}, { SSH_TTY: 'x' }).reader, 'remote')
  assert.strictEqual(resolveReader(null, {}).reader, 'unknown')
})

test('an unrecognised reader falls through to detect, not to local', () => {
  const { config } = (() => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-reader-')))
    fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ review: { reader: 'Local' } }),
    )
    const out = loadEnvConfig(dir)
    fs.rmSync(dir, { recursive: true, force: true })
    return out
  })()
  assert.strictEqual(config.review.reader, 'detect', 'a typo must not become a confident local')
})

// --- what the engine prints ------------------------------------------------

function scaffold(reader, extraReview = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-rdr-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader, ...extraReview } }),
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
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\n')
  return { dir, wt }
}

function cleanup(dir) {
  try {
    execFileSync('git', ['-C', dir, 'worktree', 'prune'], { stdio: 'ignore' })
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

/**
 * Run the CLI in a CHILD PROCESS and return its stdout.
 *
 * Not `process.stdout.write` patching, which is what this used to do. Under
 * `node --test` the file IS a child emitting TAP on stdout, so capturing that
 * stream swallows the runner's own protocol — invisible while `review` returned
 * within a tick, fatal now that it awaits a server coming up and the runner
 * emits TAP for other tests inside that window. A separate process has a
 * separate stdout, so there is nothing to share and nothing to sniff.
 */
function review(dir, ...extra) {
  const script =
    `const { run } = require(${JSON.stringify(path.resolve(__dirname, '../src/cli.js'))});` +
    'run(process.argv.slice(1)).then(() => {}, (e) => { console.error(e); process.exit(1) })'
  // The child inherits this process's environment, and THIS suite is routinely
  // run from a bridged or ssh session — the very signals under test. Scrubbed
  // here so every test states the world it is testing, exactly as `detectReader`
  // takes its environment as an argument rather than reading `process.env`.
  const env = { ...process.env }
  delete env.SSH_CONNECTION
  delete env.SSH_TTY
  delete env.CLAUDE_CODE_BRIDGE_SESSION_ID
  return execFileSync('node', ['-e', script, 'spec-env', 'review', 'feat-alpha', '--dir', dir, ...extra], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env,
  })
}

function stopServe(dir) {
  const script =
    `const { run } = require(${JSON.stringify(path.resolve(__dirname, '../src/cli.js'))});` +
    'run(process.argv.slice(1)).then(() => {}, () => {})'
  try {
    execFileSync('node', ['-e', script, 'spec-env', 'review', 'serve', '--stop', '--dir', dir], {
      encoding: 'utf-8',
      stdio: 'ignore',
    })
  } catch {}
}

test('serveOnRemote off returns the marked link and the command to type', async () => {
  const { dir } = scaffold('remote', { serveOnRemote: false })
  try {
    const out = await review(dir)
    assert.match(out, /reader: remote \(configured\)/)
    assert.match(out, /will not open where you are reading/)
    assert.match(out, /serve: skitterspec spec-env review serve --host 0\.0\.0\.0/)
    assert.match(out, /open: file:\/\//, 'the path is marked, never suppressed')
  } finally {
    cleanup(dir)
  }
})

test('a local reader gets the link and no warning', async () => {
  const { dir } = scaffold('local')
  try {
    const out = await review(dir)
    assert.match(out, /reader: local \(configured\)/)
    assert.doesNotMatch(out, /will not open/)
    assert.doesNotMatch(out, /serve:/)
  } finally {
    cleanup(dir)
  }
})

// An unknown reader is the ordinary state of a local machine. Saying so, or
// warning on it, would be noise about a healthy session.
test('an unknown reader is not announced and not warned about', async () => {
  const { dir } = scaffold('detect')
  const saved = { ...process.env }
  delete process.env.SSH_CONNECTION
  delete process.env.SSH_TTY
  delete process.env.CLAUDE_CODE_BRIDGE_SESSION_ID
  try {
    const out = await review(dir)
    assert.doesNotMatch(out, /reader:/, 'nothing to report is reported as nothing')
    assert.doesNotMatch(out, /will not open/)
    assert.doesNotMatch(out, /serve:/)
    assert.match(out, /open: file:\/\//, 'and the link is still offered, exactly as before')
  } finally {
    process.env.SSH_CONNECTION = saved.SSH_CONNECTION
    process.env.SSH_TTY = saved.SSH_TTY
    process.env.CLAUDE_CODE_BRIDGE_SESSION_ID = saved.CLAUDE_CODE_BRIDGE_SESSION_ID
    for (const k of ['SSH_CONNECTION', 'SSH_TTY', 'CLAUDE_CODE_BRIDGE_SESSION_ID']) {
      if (saved[k] === undefined) delete process.env[k]
    }
    cleanup(dir)
  }
})

test('the reader is reported as data too, so a skill never sniffs', async () => {
  const { dir } = scaffold('remote')
  try {
    const data = JSON.parse(await review(dir, '--json'))
    assert.strictEqual(data.reader, 'remote')
    assert.strictEqual(data.readerWhy, 'configured')
  } finally {
    cleanup(dir)
  }
})

// Detection may choose wording. It may never choose an action.
test('nothing is published or served on a detection', async () => {
  const { dir } = scaffold('remote')
  try {
    await review(dir)
    const reviews = path.join(dir, '.spec-env', 'reviews')
    const written = fs.readdirSync(reviews)
    assert.deepStrictEqual(written, ['feat-alpha.html'], 'the page, and nothing else')
    assert.ok(!written.some((f) => f.endsWith('.url')), 'a remote reader did not publish anything')
    assert.ok(!written.some((f) => f.endsWith('.publish.html')), 'nor write a publish copy')
  } finally {
    cleanup(dir)
  }
})

// --- the offer a remote reader can actually take ---------------------------

/**
 * A free port, taken by binding and releasing.
 *
 * Async because `address()` answers null until the `listening` event — reading
 * it synchronously throws AND leaves the socket open, which hangs the whole
 * test runner rather than failing one test.
 */
function freePort() {
  const net = require('node:net')
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

// THE BUG. Detection was never the broken half — this line was. A `file://`
// URL handed to a reader the engine has just identified as remote is the exact
// dead link the whole feature was built to stop printing.
test('a remote reader is given a link that opens where they are', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    const out = await review(dir)
    assert.match(out, /reader: remote \(configured\)/)
    assert.match(
      out,
      /open: http:\/\/[^\s]+\/feat-alpha/,
      'the offered link must be one the reader can open, not a path on this machine',
    )
    assert.doesNotMatch(out, /open: file:\/\//, 'a dead link is not an offer')
  } finally {
    await stopServe(dir)
    cleanup(dir)
  }
})

test('a second review adopts the running server rather than restarting it', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    const first = JSON.parse(review(dir, '--json')).served
    const second = JSON.parse(review(dir, '--json')).served
    assert.ok(first && second, 'both calls served')
    assert.strictEqual(first.started, true, 'the first call stood it up')
    assert.strictEqual(second.started, false, 'the second adopted it')
    assert.strictEqual(second.port, first.port)
    // The token is the load-bearing part: a restart mints a new one and kills a
    // URL the operator may already have open on their phone.
    assert.strictEqual(second.token, first.token, 'the URL already handed out still works')
    assert.strictEqual(second.url, first.url)
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3). The expensive
// mistake is a LAN listener standing up on the laptop of every developer who
// never asked for one, so the absence of a pidfile is asserted, not assumed.
test('a local reader starts no server at all', async () => {
  const { dir } = scaffold('local', { servePort: await freePort() })
  try {
    const out = review(dir)
    assert.match(out, /open: file:\/\//)
    assert.ok(
      !fs.existsSync(path.join(dir, '.spec-env', 'pids', 'review-serve.pid')),
      'nothing was started for a reader who is sitting right here',
    )
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('an unknown reader starts no server either', async () => {
  const { dir } = scaffold('detect', { servePort: await freePort() })
  try {
    const out = review(dir)
    assert.doesNotMatch(out, /open: http:\/\//)
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'pids', 'review-serve.pid')))
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

// Rule 4: route the case we cannot act on to the harmless branch. A busy port
// is not evidence of anything wrong with this repo, so it must not read as an
// error — it falls back to the link that was always printed.
test('a port already in use falls back to the file link, and does not fail', async () => {
  const port = await freePort()
  const net = require('node:net')
  const blocker = net.createServer()
  await new Promise((r) => blocker.listen(port, '127.0.0.1', r))
  const { dir } = scaffold('remote', { servePort: port })
  try {
    const out = review(dir)
    assert.match(out, /open: file:\/\//, 'the floor is the old link, never an error')
    assert.doesNotMatch(out, /open: http:\/\//)
    assert.strictEqual(JSON.parse(review(dir, '--json')).served, null)
  } finally {
    await new Promise((r) => blocker.close(r))
    stopServe(dir)
    cleanup(dir)
  }
})

// Machine-independent on purpose: which addresses exist is the ranking's
// business (env-review-lan-address.test.js states its own machines). What is
// asserted here is that whatever came out is CONSISTENT — the alternates point
// at the same spec through the same token, and none of them repeats the one
// already offered on `open:`.
test('the alternates are real alternatives to the offered link', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    const out = review(dir)
    const open = out.match(/^ {2}open: (\S+)$/m)
    assert.ok(open, 'a link was offered')
    const also = [...out.matchAll(/^ {2}also: (\S+)$/gm)].map((m) => m[1])
    const served = JSON.parse(review(dir, '--json')).served
    assert.strictEqual(also.length, served.alternates.length, 'text and --json agree')
    for (const url of also) {
      assert.match(url, /\/feat-alpha$/, 'every alternate reaches the same spec')
      assert.ok(url.includes(served.token), 'and carries the same token')
      assert.notStrictEqual(url, open[1], 'an alternate that repeats the offer is not one')
    }
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})
