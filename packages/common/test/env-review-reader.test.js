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
const { portsInUseOn } = require('../src/env/proxy.js')
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
  // STOP THE SERVER FIRST, in cleanup rather than per test. A serving test that
  // forgets leaves a real daemon running on the real machine, pointing at a temp
  // dir this function is about to delete — and it outlives the suite, squats the
  // port, and breaks every later render. That happened: a daemon leaked here
  // held 7777 for hours while `spec-env review` reported success on every call.
  // Making it structural is the point; remembering per test is what failed.
  stopServe(dir)
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
    // THE WARNING WAS REPLACED, NOT DROPPED. This asserted
    // `will not open where you are reading` plus a `serve: --host 0.0.0.0`
    // hint — telling the reader what was NOT available. The stack shows every
    // tier and its state instead, which answers the same question positively
    // and names a setting rather than a one-off flag.
    assert.match(out, /^ {2}local: +file:\/\//m, 'the path is marked, never suppressed')
    assert.match(out, /^ {2}network: +http:\/\/|^ {2}network: +off|^ {2}network: +—/m, 'network is stated')
  } finally {
    cleanup(dir)
  }
})

test('a local reader gets the link and no warning', async () => {
  const { dir } = scaffold('local', { servePort: await freePort() })
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
  const { dir } = scaffold('detect', { servePort: await freePort(), allowNetwork: false })
  const saved = { ...process.env }
  delete process.env.SSH_CONNECTION
  delete process.env.SSH_TTY
  delete process.env.CLAUDE_CODE_BRIDGE_SESSION_ID
  try {
    const out = await review(dir)
    assert.doesNotMatch(out, /reader:/, 'nothing to report is reported as nothing')
    assert.doesNotMatch(out, /will not open/)
    assert.doesNotMatch(out, /serve:/)
    // The SILENCE is what this test is about and it is unchanged. The link is
    // now loopback http rather than `file://` — serving stopped being gated on
    // the reader — but an unknown reader is still not announced and still not
    // warned about, which is the accusation this guards against.
    assert.match(out, /^ {2}local: +http:\/\/127\.0\.0\.1:/m, 'a link that opens, and can answer')
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
  // A FREE PORT, not the configured default. A serving test that takes 7777
  // binds the real machine's real port for as long as it runs.
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    const data = JSON.parse(await review(dir, '--json'))
    assert.strictEqual(data.reader, 'remote')
    assert.strictEqual(data.readerWhy, 'configured')
  } finally {
    cleanup(dir)
  }
})

// Detection may authorise SERVING — a local process, ended by one flag, leaving
// nothing behind. It may never authorise PUBLISHING, which leaves a page this
// tooling cannot remove.
//
// This test was once called `nothing is published or served on a detection` and
// only ever checked the publishing half, so the serving prohibition it claimed
// to hold lived in its name. That gap is the bug this spec fixed; the name now
// describes what is actually asserted, and the serving half is asserted for
// real — as behaviour that MUST happen — a few tests below.
test('nothing is published on a detection, however remote the reader', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
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

/**
 * Wait until a killed review server has actually let go of its port.
 *
 * WHY THIS IS NOT A SLEEP, AND NOT OPTIONAL. `process.kill(pid, 'SIGKILL')`
 * returns as soon as the signal is *delivered*, not when the process has died
 * and its listening socket has been released. The next render probes that port
 * with `portsInUseOn` and, finding it still held, returns `error: 'busy'` and
 * falls back to a `file://` page — so the assertion reads `null` instead of the
 * URL, and blames the URL-stability logic for a race in its own setup.
 *
 * macOS releases the socket inside the gap and Linux does not, so this passed
 * locally on every run and failed on every CI runner — which is the worst shape
 * a test can have: green where it is written, red where it is trusted. It cost
 * two release workflows.
 *
 * It waits on **the product's own probe** rather than a timer, so what it waits
 * for is exactly what `ensureReviewServer` decides on. A timer would be a guess
 * about the same race, tuned on the machine that never lost it.
 */
async function waitPortReleased(port, { timeoutMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const busy = await portsInUseOn(port, ['0.0.0.0', '127.0.0.1'])
    if (!busy.length) return
    if (Date.now() > deadline) {
      throw new Error(`port ${port} still held ${timeoutMs}ms after SIGKILL — not the race this waits for`)
    }
    await new Promise((r) => setTimeout(r, 50))
  }
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
      /^ {2}network: +http:\/\/[^\s]+\/feat-alpha/m,
      'the offered link must be one the reader can open, not a path on this machine',
    )
    assert.doesNotMatch(out, /^ {2}network: +file:\/\//m, 'a dead link is not an offer')
  } finally {
    await stopServe(dir)
    cleanup(dir)
  }
})

test('a second review adopts the running server rather than restarting it', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    const firstText = review(dir)
    const secondText = review(dir)
    // The exposure warning is said ONCE, where the server is stood up. Repeating
    // it on every phase is how a real warning becomes wallpaper.
    assert.match(firstText, /anyone with a URL on your network/)
    assert.doesNotMatch(secondText, /anyone with a URL on your network/)
    const first = JSON.parse(review(dir, '--json')).served
    const second = JSON.parse(review(dir, '--json')).served
    assert.ok(first && second, 'both calls served')
    assert.strictEqual(first.started, false, 'by now it is adopted, not started')
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
// INVERTED, DELIBERATELY. These two asserted that a local and an unknown reader
// got no server, and the reasoning was real: `'nothing was started for a reader
// who is sitting right here'`. What defeats it is that the reader sitting right
// here also cannot SEND a verdict — a `file://` page has no server to POST to,
// so the buttons on it have nowhere to go. Serving them costs one loopback
// process and no exposure, because the bind still comes from the reader.
//
// The remote cases below are untouched on purpose: that path worked and this
// change must not disturb it.

test('a local reader is served too, on loopback, because file:// cannot POST', async () => {
  // `allowNetwork: false` is what confines it now; the reader no longer does.
  const { dir } = scaffold('local', { servePort: await freePort(), allowNetwork: false })
  try {
    const out = review(dir)
    assert.match(out, /^ {2}local: +http:\/\/127\.0\.0\.1:/m, 'a link that opens AND can answer')
    assert.doesNotMatch(out, /^ {2}local: +file:\/\//m)
    assert.ok(
      fs.existsSync(path.join(dir, '.spec-env', 'pids', 'review-serve.pid')),
      'the server is what makes the verdict buttons work',
    )
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('an unknown reader is served on loopback as well — cannot-tell is not a reason to withhold', async () => {
  const { dir } = scaffold('detect', { servePort: await freePort(), allowNetwork: false })
  try {
    const out = review(dir)
    assert.match(out, /^ {2}local: +http:\/\/127\.0\.0\.1:/m)
    assert.ok(fs.existsSync(path.join(dir, '.spec-env', 'pids', 'review-serve.pid')))
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('allowNetwork off binds loopback only, whatever the reader', async () => {
  // THE GUARANTEE MOVED, IT DID NOT GO. This asserted that a local or unknown
  // reader binds loopback, which was the safety argument for serving
  // unconditionally: "serving more never means listening wider". The bind is no
  // longer taken from the reader at all — `allowNetwork` decides it — so the
  // same guarantee is now conditioned on the setting rather than on a guess.
  //
  // The DEFAULT changed with it, deliberately and by the operator's decision:
  // network reviews are on out of the box, so a fresh project does bind every
  // interface. That is the trade for a phone that can open the page without
  // anyone configuring anything.
  for (const who of ['local', 'detect', 'remote']) {
    const { dir } = scaffold(who, { servePort: await freePort(), allowNetwork: false })
    try {
      const out = review(dir)
      assert.doesNotMatch(out, /^ {2}network: +http:\/\//m, `${who} must bind loopback only`)
      assert.doesNotMatch(out, /^\s+also: +/m, `${who} has no alternates to offer`)
    } finally {
      stopServe(dir)
      cleanup(dir)
    }
  }
})

test('allowNetwork on binds the network, whatever the reader', async () => {
  // The other half, and the point of the change: a local session now gets a URL
  // a phone can open, without detection having to be right about anything.
  for (const who of ['local', 'detect']) {
    const { dir } = scaffold(who, { servePort: await freePort() })
    try {
      const out = review(dir)
      assert.match(out, /^ {2}(local|network): +http:\/\//m, `${who} is served`)
      assert.match(out, /^ {2}network: +http:\/\//m, `${who} reaches the network`)
    } finally {
      stopServe(dir)
      cleanup(dir)
    }
  }
})

test('serve: "never" is the way back to the file:// link', async () => {
  const { dir } = scaffold('local', { servePort: await freePort(), serve: 'never' })
  try {
    const out = review(dir)
    assert.match(out, /^ {2}local: +file:\/\//m)
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'pids', 'review-serve.pid')))
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('a legacy serveOnRemote: false is still read as serve: "never"', async () => {
  // Tolerance, not migration: these configs are committed, so a rename with no
  // tolerance breaks every other checkout on the next pull.
  const { dir } = scaffold('local', { servePort: await freePort(), serveOnRemote: false })
  try {
    const out = review(dir)
    assert.match(out, /^ {2}local: +file:\/\//m)
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
    assert.match(out, /^ {2}local: +file:\/\//m, 'the floor is the old link, never an error')
    assert.doesNotMatch(out, /^ {2}network: +http:\/\//m)
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
    // The alternates now sit UNDER the network tier, indented, because that is
    // what they are alternatives to — and virtual adapters no longer appear
    // among them at all.
    const open = out.match(/^ {2}network: +(\S+)$/m)
    assert.ok(open, 'a network link was offered')
    const also = [...out.matchAll(/^ {4}also: +(\S+)$/gm)].map((m) => m[1])
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

// --- why there is no served URL, when there is none -------------------------
//
// Since serving stopped being gated on the reader, a `file://` link can only
// mean the ask did not land. Saying nothing about it reads as the ordinary
// outcome, which it no longer is.

test('serve: "never" says so, rather than leaving the file:// link unexplained', async () => {
  const { dir } = scaffold('local', { servePort: await freePort(), serve: 'never' })
  try {
    const out = review(dir)
    assert.match(out, /^ {2}local: +file:\/\//m)
    assert.match(out, /not served: review\.serve is "never"/)
    assert.strictEqual(JSON.parse(review(dir, '--json')).notServed, 'review.serve is "never"')
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('a failed serve names the failure, not just the fallback', async () => {
  const port = await freePort()
  const net = require('node:net')
  const blocker = net.createServer()
  await new Promise((r) => blocker.listen(port, '127.0.0.1', r))
  const { dir } = scaffold('remote', { servePort: port })
  try {
    const out = review(dir)
    assert.match(out, /^ {2}local: +file:\/\//m, 'the floor is still the old link, never an error')
    // The PORT, not just the word `busy` — the port is the whole of what the
    // reader can act on.
    assert.match(out, new RegExp(`not served: port ${port} is already in use`))
    const json = JSON.parse(review(dir, '--json'))
    assert.strictEqual(json.served, null)
    assert.match(String(json.notServed), /is already in use/)
  } finally {
    await new Promise((r) => blocker.close(r))
    stopServe(dir)
    cleanup(dir)
  }
})

test('a remote reader still gets the warning on that fallback, and only there', async () => {
  const port = await freePort()
  const net = require('node:net')
  const blocker = net.createServer()
  await new Promise((r) => blocker.listen(port, '127.0.0.1', r))
  const { dir } = scaffold('remote', { servePort: port })
  try {
    const out = review(dir)
    // Same replacement as above: the stack states each tier rather than warning
    // about the one the reader cannot use.
    assert.match(out, /^ {2}local: +file:\/\//m)
    assert.match(out, /not served: /, 'and it still says why there is no server')
  } finally {
    await new Promise((r) => blocker.close(r))
    stopServe(dir)
    cleanup(dir)
  }
})

test('STAYS SILENT: a served render explains nothing, because nothing needs it', async () => {
  const { dir } = scaffold('local', { servePort: await freePort(), allowNetwork: false })
  try {
    const out = review(dir)
    assert.match(out, /^ {2}local: +http:\/\/127\.0\.0\.1:/m)
    assert.doesNotMatch(out, /not served/, 'a reason for a thing that happened is noise')
    assert.ok(!('notServed' in JSON.parse(review(dir, '--json'))))
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

// --- the token outlives the process ----------------------------------------
//
// The port is `PORT_BASE + hash(realpath(repo)) % PORT_SPAN` — a pure function
// of the path, stable across a restart by design. The token beside it was
// `crypto.randomBytes(6)` per process, so one half of the URL was built to
// survive and the other was not. Six URLs were handed out for one repo in a
// single session and a reader was left pressing verdicts on dead pages twice.

/**
 * The URL a reader would use, read off the tier stack.
 *
 * The single `open:` line this used to parse is gone: the engine stopped
 * picking one surface, because it cannot know where the reader is. `network`
 * first, then `local` — which is the order of reach, not the order printed.
 */
const urlOf = (out) => {
  const net = /^ {2}network: +(http:\/\/\S+)/m.exec(out)
  if (net) return net[1]
  const local = /^ {2}local: +(http:\/\/\S+)/m.exec(out)
  return local ? local[1] : null
}

test('a stop and a start leave the URL unchanged', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    const first = urlOf(review(dir))
    assert.ok(first, `expected a served URL, got:\n${review(dir)}`)
    stopServe(dir)
    const second = urlOf(review(dir))
    assert.strictEqual(second, first, 'a restart must not change the link someone is holding')
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('a server dying leaves the URL unchanged too, which a restart-only fix would miss', async () => {
  // The case found while starting this spec: nobody restarted anything, the
  // server had died on its own, and the next render minted a sixth token.
  const port = await freePort()
  const { dir } = scaffold('remote', { servePort: port })
  try {
    const first = urlOf(review(dir))
    const pid = Number(
      fs.readFileSync(path.join(dir, '.spec-env', 'pids', 'review-serve.pid'), 'utf8').trim(),
    )
    process.kill(pid, 'SIGKILL')
    // The signal is delivered before the socket is released; render too soon and
    // the port probe reports 'busy' and hands back a file:// page. See
    // `waitPortReleased` — this is the line CI failed on.
    await waitPortReleased(port)
    // No --stop, no settings rewrite: exactly what a crash or a sleep leaves.
    const second = urlOf(review(dir))
    assert.strictEqual(second, first, 'a death must not change the link either')
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('the token is stored once, not derived from the repo path', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    review(dir)
    const file = path.join(dir, '.spec-env', 'review-token')
    assert.ok(fs.existsSync(file), 'it is written where the next process can read it')
    const token = fs.readFileSync(file, 'utf8').trim()
    assert.match(token, /^[0-9a-f]{12}$/, '48 random bits, unchanged — only its lifetime moved')
    // NOT DERIVED, deliberately. The port is a pure function of the path
    // because a port is not a secret; the token is the only guard on a
    // non-loopback bind, and a path is guessable by anyone on the machine.
    const crypto = require('node:crypto')
    const fromPath = crypto.createHash('sha256').update(fs.realpathSync(dir)).digest('hex')
    assert.notStrictEqual(token, fromPath.slice(0, 12), 'a path-derived token would be guessable')
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('two repos get different tokens', async () => {
  const a = scaffold('remote', { servePort: await freePort() })
  const b = scaffold('remote', { servePort: await freePort() })
  try {
    review(a.dir)
    review(b.dir)
    const read = (d) => fs.readFileSync(path.join(d, '.spec-env', 'review-token'), 'utf8').trim()
    assert.notStrictEqual(read(a.dir), read(b.dir))
  } finally {
    stopServe(a.dir)
    stopServe(b.dir)
    cleanup(a.dir)
    cleanup(b.dir)
  }
})

test('STAYS SILENT: the token file is gitignored, so serving leaves no change to commit', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    review(dir)
    const status = execFileSync('git', ['-C', dir, 'status', '--porcelain'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString()
    assert.doesNotMatch(status, /review-token/, 'a served review must not dirty the tree')
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('--rotate-token changes it, and says every existing link is dead', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    const before = urlOf(review(dir))
    const rotate = execFileSync(
      'node',
      [
        '-e',
        `const { run } = require(${JSON.stringify(path.resolve(__dirname, '../src/cli.js'))});` +
          'run(process.argv.slice(1)).then(() => {}, (e) => { console.error(e); process.exit(1) })',
        'spec-env',
        'review',
        'serve',
        '--rotate-token',
        '--dir',
        dir,
      ],
      { encoding: 'utf-8' },
    )
    assert.match(rotate, /token rotated/)
    assert.match(rotate, /EVERY LINK ALREADY HANDED OUT IS NOW DEAD/)
    // ADOPTION STILL WINS while the old server lives, and the message says so:
    // rotating the file does not reach a process that already holds a token.
    assert.match(rotate, /still answers on the old token/)
    assert.strictEqual(urlOf(review(dir)), before, 'the running server keeps its token')
    stopServe(dir)
    const after = urlOf(review(dir))
    assert.notStrictEqual(after, before, 'and the next server picks the rotated one up')
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('a malformed token file is replaced rather than serving nothing', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    fs.mkdirSync(path.join(dir, '.spec-env'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.spec-env', 'review-token'), '\n')
    const out = review(dir)
    assert.match(out, /^ {2}(local|network): +http:\/\//m, 'a file nobody reads must not take the page away')
    const token = fs.readFileSync(path.join(dir, '.spec-env', 'review-token'), 'utf8').trim()
    assert.match(token, /^[0-9a-f]{12}$/)
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('nothing but rotation mints a token', () => {
  // The silent mint is the bug. This is the structural half: `mintToken` may be
  // called from the per-repo store and from the rotate verb, and nowhere else.
  const src = fs.readFileSync(require.resolve('../src/cli.js'), 'utf8')
  const calls = [...src.matchAll(/mintToken\(\)/g)]
  assert.strictEqual(calls.length, 2, `mintToken() is called ${calls.length} times, expected 2`)
  assert.match(src, /function repoToken\(dir, config\) \{[\s\S]*?mintToken\(\)/)
  assert.match(src, /if \(flags\.rotateToken\) \{[\s\S]*?mintToken\(\)/)
})

// --- one URL shape, whatever the bind --------------------------------------
//
// `token = loopback ? null : …` made the URL's SHAPE follow the bind, and the
// bind follows reader detection — which flipped `unknown` → `remote` inside a
// single session. So the same repo's address gained and lost a path segment
// depending on what the engine last guessed about where someone was sitting.

const shapeOf = (u) => (u ? u.replace(/^http:\/\/[^/]+/, '').replace(/[^/]+$/, '') : null)

test('the path is the same under local, remote and detect — only the host differs', async () => {
  const port = await freePort()
  const shapes = {}
  for (const who of ['local', 'remote', 'detect']) {
    const { dir } = scaffold(who, { servePort: port })
    try {
      const url = urlOf(review(dir))
      assert.ok(url, `${who} produced no served URL`)
      shapes[who] = shapeOf(url)
    } finally {
      stopServe(dir)
      cleanup(dir)
    }
  }
  // Different repos, so the tokens differ; what must match is the SHAPE — a
  // token segment present in every case rather than only on a network bind.
  for (const who of ['local', 'remote', 'detect']) {
    assert.match(shapes[who], /^\/[0-9a-f]{12}\/$/, `${who} must carry a token segment`)
  }
})

test('a loopback server carries a token, so a detection flip cannot reshape the URL', async () => {
  const { dir } = scaffold('local', { servePort: await freePort(), allowNetwork: false })
  try {
    const url = urlOf(review(dir))
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{12}\/feat-alpha$/)
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('STAYS SILENT: the token still guards a network bind, and a wrong one is notfound', () => {
  // Widening WHERE the token appears must not weaken WHAT it does. `routeFor`
  // is pure, so this is the cheapest place to assert it.
  const { routeFor } = require('../src/env/serve.js')
  const token = 'abcdef012345'
  assert.strictEqual(routeFor(`/${token}/`, { token }).kind, 'index')
  assert.strictEqual(routeFor(`/${token}/feat-alpha`, { token }).kind, 'spec')
  assert.strictEqual(routeFor('/deadbeef0000/feat-alpha', { token }).kind, 'notfound')
  assert.strictEqual(routeFor('/feat-alpha', { token }).kind, 'notfound', 'never a redirect')
})

// --- a stale BUILD is replaced, and the link survives it --------------------

const pidOf = (dir) =>
  Number(fs.readFileSync(path.join(dir, '.spec-env', 'pids', 'review-serve.pid'), 'utf8').trim())

test('a daemon whose recorded build is older is replaced, and the URL is unchanged', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    const before = urlOf(review(dir))
    const firstPid = pidOf(dir)

    // What a rebuilt dist looks like from the engine's side: same version, a
    // script whose mtime has moved. Done by rewinding the RECORDED value rather
    // than touching the real engine file, which every other test shares.
    const sfile = path.join(dir, '.spec-env', 'review-serve.json')
    const settings = JSON.parse(fs.readFileSync(sfile, 'utf8'))
    assert.ok(Number.isFinite(settings.scriptMtime), 'the spawn recorded a build')
    fs.writeFileSync(sfile, JSON.stringify({ ...settings, scriptMtime: settings.scriptMtime - 5000 }))

    const after = urlOf(review(dir))
    assert.notStrictEqual(pidOf(dir), firstPid, 'the stale process was replaced')
    // THE POINT OF DOING THIS NOW rather than earlier: the token outlives the
    // process, so replacing it no longer costs the reader their link. Before
    // `feat-one-review-link` this test could not have passed.
    assert.strictEqual(after, before, 'and the link someone is holding still works')
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('STAYS SILENT: a daemon whose build matches is adopted, with nothing said', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    const before = urlOf(review(dir))
    const firstPid = pidOf(dir)
    const out = review(dir)
    assert.strictEqual(pidOf(dir), firstPid, 'the healthy server was adopted, not restarted')
    assert.strictEqual(urlOf(out), before)
    assert.doesNotMatch(out, /engine/, 'an ordinary render says nothing about the engine')
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})

test('STAYS SILENT: a settings file with no recorded build is adopted', async () => {
  const { dir } = scaffold('remote', { servePort: await freePort() })
  try {
    review(dir)
    const firstPid = pidOf(dir)
    const sfile = path.join(dir, '.spec-env', 'review-serve.json')
    const settings = JSON.parse(fs.readFileSync(sfile, 'utf8'))
    delete settings.scriptMtime // a file written before this existed
    fs.writeFileSync(sfile, JSON.stringify(settings))
    review(dir)
    assert.strictEqual(pidOf(dir), firstPid, 'an absent field must not restart a healthy server')
  } finally {
    stopServe(dir)
    cleanup(dir)
  }
})
