'use strict'

/**
 * `spec-env review wait` re-shows the stack every fifth re-arm.
 *
 * A wait that dies is re-armed on the same window, and every re-arm leaves a
 * trace in the conversation. Over a long idle those pile up until the banner
 * and its links have scrolled out of sight, and a reader coming back has to dig
 * for the URL that lets them answer. So the engine counts the starts on one
 * window and, every fifth re-arm, prints the stack again — read-only, from the
 * same functions a render uses, with the server left alone.
 *
 * The stays-silent cases matter as much as the firing ones
 * (`.claude/rules/negative-checks.md` rule 3): the first wait, an unreadable
 * store, and `--reshow-every 0` must say nothing extra at all.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, execFile } = require('node:child_process')

const {
  recordWaitStart,
  reshowDue,
  reviewWaitsPath,
  reviewOutPath,
  emptyPending,
  addPending,
  writePending,
} = require('../src/env/review.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-reshow-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local', serve: 'never' } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  return { dir, wt }
}

function cleanup(dir) {
  try { git(dir, 'worktree', 'prune') } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

const BIN = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function runCli(argv) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...argv], { timeout: 30000 }, (err, stdout, stderr) => {
      resolve({ stdout, out: `${stdout}${stderr}`, code: err && typeof err.code === 'number' ? err.code : 0 })
    })
  })
}

// A pass already inside the window, so each wait returns at once — this is
// about what the wait says when it starts, not about how long it waits.
function putPass(dir, at) {
  const out = reviewOutPath(dir, 'feat-alpha', null)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const added = addPending(emptyPending('feat-alpha'), {
    blob: { version: 1, spec: 'feat-alpha', accepted: [], unaccepted: [], comments: [], verdict: 'commit' },
    at,
    render: at,
  })
  writePending(out, added.pending)
}

// Recent, so the 12-hour prune does not drop the window between starts.
const SINCE = new Date(Date.now() - 60 * 1000).toISOString()
const LATER = new Date(Date.now() - 30 * 1000).toISOString()

const wait = (dir, ...extra) =>
  runCli(['spec-env', 'review', 'wait', 'feat-alpha', '--dir', dir, '--since', SINCE, ...extra])

// ---------------------------------------------------------------- unit

test('recordWaitStart counts per window, and a new window starts again', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-waits-'))
  try {
    const out = path.join(dir, 'feat-x.html')
    const now = Date.parse('2026-10-31T12:00:00Z')
    const a = '2026-10-31T11:00:00.000Z'
    const b = '2026-10-31T11:30:00.000Z'
    assert.deepStrictEqual(recordWaitStart(out, 'feat-x', a, { now }), { starts: 1, rearm: 0 })
    assert.deepStrictEqual(recordWaitStart(out, 'feat-x', a, { now }), { starts: 2, rearm: 1 })
    assert.deepStrictEqual(recordWaitStart(out, 'feat-x', b, { now }), { starts: 1, rearm: 0 })
    assert.deepStrictEqual(recordWaitStart(out, 'feat-x', a, { now }), { starts: 3, rearm: 2 })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('recordWaitStart prunes windows older than 12 hours', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-waits-'))
  try {
    const out = path.join(dir, 'feat-x.html')
    const old = '2026-10-30T08:00:00.000Z'
    const fresh = '2026-10-31T11:00:00.000Z'
    recordWaitStart(out, 'feat-x', old, { now: Date.parse('2026-10-30T09:00:00Z') })
    recordWaitStart(out, 'feat-x', fresh, { now: Date.parse('2026-10-31T12:00:00Z') })
    const stored = JSON.parse(fs.readFileSync(reviewWaitsPath(out), 'utf8'))
    assert.deepStrictEqual(Object.keys(stored.windows), [fresh])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('recordWaitStart cannot tell on an unreadable store, and never writes over it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-waits-'))
  try {
    const out = path.join(dir, 'feat-x.html')
    fs.writeFileSync(reviewWaitsPath(out), '{not json')
    assert.strictEqual(recordWaitStart(out, 'feat-x', '2026-10-31T11:00:00.000Z'), null)
    assert.strictEqual(fs.readFileSync(reviewWaitsPath(out), 'utf8'), '{not json')
    assert.strictEqual(recordWaitStart(out, 'feat-x', 'yesterday-ish'), null, 'an unusable window counts nothing')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('reshowDue fires on 5 and 10, never on the first wait, never when disabled', () => {
  assert.deepStrictEqual(
    [0, 1, 2, 3, 4, 5, 6, 9, 10].map((n) => reshowDue(n)),
    [false, false, false, false, false, true, false, false, true],
  )
  assert.strictEqual(reshowDue(5, 0), false)
  assert.strictEqual(reshowDue(null), false, 'cannot-tell is no re-show')
  assert.strictEqual(reshowDue(3, 3), true)
})

// ---------------------------------------------------------------- cli

test('the fifth re-arm prints the stack; the four before it do not', async () => {
  const { dir } = scaffold()
  try {
    putPass(dir, LATER)
    const first = await wait(dir)
    assert.doesNotMatch(first.stdout, /re-arm/, 'the first wait is not a re-arm')
    for (let i = 1; i <= 4; i++) {
      const r = await wait(dir)
      assert.match(r.stdout, new RegExp(`\\(re-arm ${i}\\)`))
      assert.doesNotMatch(r.stdout, /re-show:/, `re-arm ${i} re-shows nothing`)
    }
    const fifth = await wait(dir)
    assert.match(fifth.stdout, /re-show: banner \(re-arm 5\)/)
    assert.match(fifth.stdout, /^ {2}local:/m, 'every tier is named')
    assert.match(fifth.stdout, /^ {2}network:/m)
    assert.match(fifth.stdout, /^ {2}remote:/m)
  } finally {
    cleanup(dir)
  }
})

test('--reshow-every 0 never re-shows', async () => {
  const { dir } = scaffold()
  try {
    putPass(dir, LATER)
    let last
    for (let i = 0; i <= 5; i++) last = await wait(dir, '--reshow-every', '0')
    assert.match(last.stdout, /\(re-arm 5\)/)
    assert.doesNotMatch(last.stdout, /re-show:/)
  } finally {
    cleanup(dir)
  }
})

test('an unreadable waits store prints no marker and still waits', async () => {
  const { dir } = scaffold()
  try {
    putPass(dir, LATER)
    const out = reviewOutPath(dir, 'feat-alpha', null)
    fs.writeFileSync(reviewWaitsPath(out), '{not json')
    const r = await wait(dir)
    assert.strictEqual(r.code, 0, 'the pass still arrives')
    assert.doesNotMatch(r.stdout, /re-arm|re-show/)
  } finally {
    cleanup(dir)
  }
})

test('--json carries rearm, reshow and the stack', async () => {
  const { dir } = scaffold()
  try {
    putPass(dir, LATER)
    for (let i = 0; i < 5; i++) await wait(dir, '--json')
    const r = await wait(dir, '--json')
    const parsed = JSON.parse(r.stdout)
    assert.strictEqual(parsed.rearm, 5)
    assert.strictEqual(parsed.reshow, true)
    assert.deepStrictEqual(parsed.tiers.map((t) => t.tier), ['local', 'network', 'remote'])
  } finally {
    cleanup(dir)
  }
})

// THE SERVER IS READ, NEVER TOUCHED. A re-show that restarted it would mint a
// new process under the reader's open link to remind them of that link. A
// live pid (this test's own) and a settings file stand in for a server; the
// re-show must name its URL and leave both exactly as they were.
test('a re-show reads the running server and leaves it alone', async () => {
  const { dir } = scaffold()
  try {
    putPass(dir, LATER)
    const sdir = path.join(dir, '.spec-env')
    fs.mkdirSync(path.join(sdir, 'pids'), { recursive: true })
    const pidFile = path.join(sdir, 'pids', 'review-serve.pid')
    const settingsFile = path.join(sdir, 'review-serve.json')
    fs.writeFileSync(pidFile, `${process.pid}\n`)
    const settings = JSON.stringify({ port: 7799, host: '127.0.0.1', token: 'abc123abc123' })
    fs.writeFileSync(settingsFile, settings)
    let r
    for (let i = 0; i <= 5; i++) r = await wait(dir)
    assert.match(r.stdout, /http:\/\/127\.0\.0\.1:7799\/abc123abc123\/feat-alpha/)
    assert.strictEqual(fs.readFileSync(pidFile, 'utf8'), `${process.pid}\n`, 'the pidfile is untouched')
    assert.strictEqual(fs.readFileSync(settingsFile, 'utf8'), settings, 'and so are its settings')
  } finally {
    cleanup(dir)
  }
})
