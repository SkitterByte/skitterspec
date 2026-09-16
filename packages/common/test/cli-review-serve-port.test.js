'use strict'

/**
 * What the serve command SAYS about its port.
 *
 * Two claims, both about the same question — *why is this on 7742?* — answered
 * by the tool rather than by reading `config.js`:
 *
 *   - `--status` prints the port and which of the three chose it.
 *   - the busy refusal names `review.servePort`, not only `--port`. That
 *     distinction is the bug this phase closes: `--port` moves the run aside and
 *     leaves every link already handed out pointing at the busy port, which is
 *     precisely how a reader came to press a verdict into another repo's daemon.
 *
 * A real server on a real port, for the same reason the sibling suites use one:
 * the settings file is written by the start path and read by the status path, so
 * a unit test of either half would not show that they agree.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

// LOOPBACK, not `0.0.0.0`. The server binds 127.0.0.1 unless asked otherwise,
// and under BSD semantics a wildcard bind and a loopback bind COEXIST — so a
// `0.0.0.0` squatter leaves the loopback probe succeeding and the port reading
// as free. Squatting the address the server will actually want is what makes
// this refusal reproduce rather than pass by accident.
function squat(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(port, host, () => resolve({ close: () => new Promise((r) => s.close(r)) }))
  })
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

function scaffold(review) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-serveport-cli-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'init')
  g('branch', '-M', 'main')
  return dir
}

// A CHILD PROCESS rather than stdout patching — under `node --test` this file is
// itself a child emitting TAP, and the start path spawns a daemon inside that
// window. Copied deliberately from `env-serve-start-proof.test.js`, which says
// so at length.
function cli(dir, ...extra) {
  const script =
    `const { run } = require(${JSON.stringify(path.resolve(__dirname, '../src/cli.js'))});` +
    'run(process.argv.slice(1)).then(() => {}, (e) => { console.error(e); process.exit(1) })'
  const env = { ...process.env }
  delete env.SSH_CONNECTION
  delete env.SSH_TTY
  delete env.CLAUDE_CODE_BRIDGE_SESSION_ID
  return execFileSync('node', ['-e', script, 'spec-env', 'review', 'serve', ...extra, '--dir', dir], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env,
  })
}

const stop = (dir) => {
  try {
    cli(dir, '--stop')
  } catch {}
}

test('--status names the port and that it was derived', async () => {
  const dir = scaffold({ servePort: 'auto' })
  try {
    const started = cli(dir)
    // A derived port can genuinely be busy on the machine running the tests.
    // That is the refusal under test below, not a failure of this one.
    if (/already in use/.test(started)) return
    const status = cli(dir, '--status')
    assert.match(status, /running \(pid \d+\)/)
    assert.match(status, /^ {2}port: {2}77\d\d \(derived from this repo's path\)$/m, status)
  } finally {
    stop(dir)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('--status says "pinned" for a configured number, and "--port" for a flag', async () => {
  const dir = scaffold({ servePort: await freePort() })
  try {
    if (/already in use/.test(cli(dir))) return
    assert.match(cli(dir, '--status'), /^ {2}port: {2}\d+ \(pinned by review\.servePort\)$/m)
    stop(dir)

    const other = await freePort()
    if (/already in use/.test(cli(dir, '--port', String(other)))) return
    assert.match(
      cli(dir, '--status'),
      new RegExp(`^ {2}port: {2}${other} \\(this run only, from --port\\)$`, 'm'),
    )
  } finally {
    stop(dir)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the busy refusal names servePort as the durable fix, not just --port', async () => {
  const port = await freePort()
  const held = await squat(port)
  const dir = scaffold({ servePort: port })
  try {
    const out = cli(dir)
    assert.match(out, /is already in use/)
    assert.match(out, /servePort/, 'the durable fix is named')
    assert.match(out, /env\.config\.json/, 'and where to write it')
    // `--port` is still offered, but as what it is: a move for this run that
    // leaves the links behind.
    assert.match(out, /--port <n> moves this run only/)
  } finally {
    stop(dir)
    await held.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a derived port that collides says so, rather than moving itself aside', async () => {
  // The honest answer to a hash collision is the refusal, because walking up to
  // the next free port would make the port depend on which repo started first —
  // which is the staleness this phase exists to remove.
  const dir = scaffold({ servePort: 'auto' })
  const { resolveServePort, loadEnvConfig } = require('../src/env/config.js')
  const derived = resolveServePort(loadEnvConfig(dir).config, dir)
  assert.strictEqual(derived.source, 'derived')
  let held
  try {
    held = await squat(derived.port)
  } catch {
    // Something on this machine already holds the derived port. That is the
    // collision itself rather than a failure, and there is nothing left to
    // stage — leave it alone rather than accusing the test of it.
    fs.rmSync(dir, { recursive: true, force: true })
    return
  }
  try {
    const out = cli(dir)
    assert.match(out, new RegExp(`port ${derived.port} is already in use`))
    assert.match(out, /two repos derived the same port/)
    assert.match(out, /servePort/)
  } finally {
    stop(dir)
    await held.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('STAYS SILENT: a server that is not running reports exactly that', () => {
  const dir = scaffold({ servePort: 'auto' })
  try {
    const out = cli(dir, '--status')
    assert.match(out, /not running\.$/m)
    // No port line, because there is no server to have chosen one — an absence
    // is not evidence of a source (.claude/rules/negative-checks.md).
    assert.ok(!/ {2}port: /.test(out), out)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('STAYS SILENT: a server from before portSource was recorded gets no "how"', async () => {
  const dir = scaffold({ servePort: await freePort() })
  try {
    if (/already in use/.test(cli(dir))) return
    // Exactly what an upgrade finds: a live server whose settings file predates
    // the key. It must report the port and claim nothing about where it came
    // from — never recompute one, which could disagree with what is served.
    const settingsFile = path.join(dir, '.spec-env', 'review-serve.json')
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
    delete settings.portSource
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n')

    const out = cli(dir, '--status')
    assert.match(out, new RegExp(`^ {2}port: {2}${settings.port}$`, 'm'), out)
    assert.ok(!/derived|pinned|--port/.test(out.split('\n').find((l) => l.includes('port:  '))))
  } finally {
    stop(dir)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
