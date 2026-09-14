'use strict'

/**
 * Does the engine actually prove the review server started?
 *
 * It did not, and the way it failed is worth keeping in front of whoever reads
 * this next. A daemon leaked by another test held `0.0.0.0:7777`. Every
 * `spec-env review` afterwards reported a server started, wrote fresh settings
 * with a fresh URL token, and served nothing — because two checks were both
 * asking a question adjacent to the one that mattered:
 *
 *   - the pre-flight asked "can I bind 127.0.0.1?" when the daemon binds
 *     0.0.0.0, and on BSD semantics those two coexist, so it answered "free"
 *   - the confirmation asked "is anything listening?", and the squatter was
 *
 * Either check, asked correctly, would have caught it. Both adjacent, and the
 * failure reported itself as success for hours.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const net = require('node:net')

const { portsInUse } = require('../src/env/proxy.js')

function squat(port, host) {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(port, host, () => resolve({ close: () => new Promise((r) => s.close(r)) }))
  })
}

async function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

// THE ROOT CAUSE, in one assertion. A wildcard bind and a loopback bind coexist,
// so asking about loopback tells you nothing about whether a wildcard bind will
// succeed — and the daemon binds wildcard whenever it is reachable from a phone.
test('a loopback probe cannot see a wildcard squatter', async () => {
  const port = await freePort()
  const held = await squat(port, '0.0.0.0')
  try {
    assert.deepStrictEqual(
      await portsInUse([port], '127.0.0.1'),
      [],
      'binding loopback succeeds — which is exactly why it is the wrong question',
    )
    assert.deepStrictEqual(
      await portsInUse([port], '0.0.0.0'),
      [port],
      'asked about the address it will actually bind, it sees the conflict',
    )
  } finally {
    await held.close()
  }
})

// The pre-flight must ask about the address the daemon will bind, and about
// loopback — neither probe sees the other, and a port half-taken is unusable.
test('the pre-flight never substitutes loopback for the bind it will make', () => {
  const src = require('node:fs').readFileSync(require.resolve('../src/cli.js'), 'utf8')
  // The exact substitution that caused this: probing 127.0.0.1 INSTEAD OF the
  // wildcard bind. It is one keystroke to reintroduce and invisible when read.
  assert.doesNotMatch(
    src,
    /portsInUse\(\[usePort\], loopback \? host : '127\.0\.0\.1'\)/,
    'the pre-flight probes loopback for a wildcard bind',
  )
  // Pinned as a property, not a spelling: the bind host is among what is asked.
  assert.match(src, /new Set\(\[host, '127\.0\.0\.1'\]\)/, 'both addresses are probed')
})

// A port answering is not proof that OUR process is answering it. That is the
// same shape as every accusation rule in `.claude/rules/negative-checks.md`,
// inverted: a positive signal that is not specific enough to be evidence.
test('a started server is proven by its own process, not by the port', () => {
  const src = require('node:fs').readFileSync(require.resolve('../src/cli.js'), 'utf8')
  assert.match(
    src,
    /isAlive\(res\.pid\)/,
    'the spawned process must still be alive before the start is called good',
  )
})

// --- the behaviour, not the source ------------------------------------------
//
// The two assertions above pin the implementation, which is worth doing for a
// substitution this easy to reintroduce. THIS is the one that captures the bug:
// with the port already held, a render must not come back claiming a server.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function scaffold(servePort) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-proof-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({
      baseBranch: 'main',
      docker: { enabled: false },
      // `remote` is what makes a render try to serve at all.
      review: { reader: 'remote', servePort },
    }),
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
  return dir
}

function drop(dir) {
  try {
    execFileSync('git', ['-C', dir, 'worktree', 'prune'], { stdio: 'ignore' })
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

// A CHILD PROCESS, not `process.stdout.write` patching. Under `node --test`
// this file is itself a child emitting TAP on stdout, and a render that spawns
// a daemon and waits for it emits inside that window — capturing the stream
// swallows the runner's own protocol. `env-review-reader.test.js` learned this
// the same way and says so at length; the harness is copied from it deliberately
// rather than reinvented.
function cli(dir, ...extra) {
  const script =
    `const { run } = require(${JSON.stringify(path.resolve(__dirname, '../src/cli.js'))});` +
    'run(process.argv.slice(1)).then(() => {}, (e) => { console.error(e); process.exit(1) })'
  const env = { ...process.env }
  // This suite is routinely run from a bridged session — the very signal that
  // decides whether a render serves at all. Scrubbed so each test states the
  // world it is testing; `reader: remote` in the config is what turns it on.
  delete env.SSH_CONNECTION
  delete env.SSH_TTY
  delete env.CLAUDE_CODE_BRIDGE_SESSION_ID
  return execFileSync('node', ['-e', script, 'spec-env', 'review', ...extra, '--dir', dir], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env,
  })
}

const stopServe = (dir) => {
  try {
    cli(dir, 'serve', '--stop')
  } catch {}
}

test('a render whose port is already held does not claim a server', async () => {
  const port = await freePort()
  const held = await squat(port, '0.0.0.0')
  const dir = scaffold(port)
  try {
    const json = JSON.parse(cli(dir, 'feat-alpha', '--json'))
    // It must fall back to the file:// URL and say so, exactly as it does for
    // any other server failure. What it must NOT do is hand back a URL that
    // nothing of ours is answering.
    assert.strictEqual(json.served, null, 'no server was claimed')
  } finally {
    stopServe(dir)
    drop(dir)
    await held.close()
  }
})

// STAYS SILENT (`negative-checks.md` rule 3). The healthy case must be
// untouched: a free port still starts, still serves, still reports a URL.
test('stays silent: a free port still starts and is still reported', async () => {
  const port = await freePort()
  const dir = scaffold(port)
  try {
    const json = JSON.parse(cli(dir, 'feat-alpha', '--json'))
    assert.ok(json.served, 'a healthy start is still reported')
    assert.strictEqual(json.served.port, port)
  } finally {
    // Every serving test stops what it started. The bug this file exists for
    // was made invisible for hours by a test that did not.
    stopServe(dir)
    drop(dir)
  }
})

// --- the leak that made all of this invisible -------------------------------
//
// The two bugs above are why the symptom looked like success. THIS is what
// created the condition: a serving test left a real daemon running on the real
// machine's default port, pointing at a temp directory it had just deleted.
// Nothing in the suite stopped it, and nothing noticed.

const READER_SUITE = fs.readFileSync(path.join(__dirname, 'env-review-reader.test.js'), 'utf8')

test('the reader suite stops what it starts, structurally', () => {
  // In `cleanup`, not per test. Remembering per test is exactly what failed —
  // six of eight serving tests remembered, and the two that did not leaked.
  const cleanup = READER_SUITE.slice(
    READER_SUITE.indexOf('function cleanup(dir)'),
    READER_SUITE.indexOf('function stopServe(dir)'),
  )
  assert.match(cleanup, /stopServe\(dir\)/, 'cleanup stops the server it may have started')
})

test('no serving test binds the machine\'s configured default port', () => {
  // A POSITIVE SIGNAL: every `scaffold('remote'…)` must name a port. Omitting
  // one silently takes `review.servePort`, which is the real 7777 on the real
  // machine — and a test has no business binding the port the operator uses.
  const bare = [...READER_SUITE.matchAll(/scaffold\('remote'(?:,\s*\{([^}]*)\})?\)/g)].filter(
    (m) => !m[1] || !/servePort/.test(m[1]),
  )
  // `serveOnRemote: false` never reaches a bind, so it is allowed to omit one.
  const offenders = bare.filter((m) => !/serveOnRemote:\s*false/.test(m[1] || ''))
  assert.deepStrictEqual(
    offenders.map((m) => m[0]),
    [],
    'a serving test took the configured default port',
  )
})
