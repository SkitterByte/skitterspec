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

function scaffold(reader) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-rdr-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader } }),
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

async function review(dir, ...extra) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (c) => {
    out += c
    return true
  }
  try {
    await run(['spec-env', 'review', 'feat-alpha', '--dir', dir, ...extra])
  } finally {
    process.stdout.write = orig
  }
  return out
}

test('a remote reader is told the link will not open, and what will', async () => {
  const { dir } = scaffold('remote')
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
