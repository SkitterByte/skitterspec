'use strict'

/**
 * `waitingPasses` / `spec-env review waiting` — is anything waiting, anywhere?
 *
 * A wait that never fired, a session cleared, a terminal closed overnight: none
 * of those is recoverable by any watcher, however good. The gate already
 * records the obligation durably and a render already prints `pending:` — but
 * only for the ONE spec you re-render, and nobody re-renders a spec they have
 * finished. Ten passes sat unnoticed across six completed specs for that exact
 * reason.
 *
 * THE LOAD-BEARING DECISION IS WHERE IT LOOKS. `specEnvStatus` walks specs that
 * have a **worktree**, and every one of those ten belonged to a spec that had
 * been completed and torn down. Scoping this scan to provisioned specs would
 * therefore make it blind to precisely the case that produced it — so it reads
 * the reviews sidecar directory, where a file exists because a pass was
 * received (`.claude/rules/negative-checks.md` rule 1: assert something
 * present).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const {
  emptyPending,
  addPending,
  readPending,
  writePending,
  reviewOutPath,
  waitingPasses,
} = require('../src/env/review.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function scaffold({ worktrees = ['feat-alpha'] } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-waiting-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local' } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  for (const folder of worktrees) {
    const specDir = path.join(dir, 'specs', 'in-progress', folder)
    fs.mkdirSync(specDir, { recursive: true })
    fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  }
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  for (const folder of worktrees) {
    const slug = folder.replace(/^(feat|bug|hotfix)-/, '')
    const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
    git(dir, 'worktree', 'add', '-q', '-b', `feat/${slug}`, wt)
  }
  return dir
}

function cleanup(dir) {
  try { git(dir, 'worktree', 'prune') } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

// A pass in `folder`'s store. `folder` need not be a provisioned spec — that is
// the whole point.
function putPass(dir, folder, { at, verdict = 'commit' }) {
  const out = reviewOutPath(dir, folder, null)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const store = readPending(out, folder).pending
  const added = addPending(store, {
    blob: { version: 1, spec: folder, accepted: [], unaccepted: [], comments: [], verdict },
    at,
    render: at,
  })
  writePending(out, added.pending)
  return added.code
}

const reviewsDir = (dir) => path.join(dir, '.spec-env', 'reviews')

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (c) => { out += c; return true }
  try { await run(argv) } finally { process.stdout.write = orig }
  return out
}

const T1 = '2026-09-14T17:17:43.774Z'
const T2 = '2026-09-15T16:54:06.693Z'
const T3 = '2026-09-16T09:53:38.558Z'

// --- the scan ---------------------------------------------------------------

test('every waiting pass across every spec, oldest first', () => {
  const dir = scaffold()
  try {
    const c2 = putPass(dir, 'feat-beta', { at: T2, verdict: 'changes' })
    const c1 = putPass(dir, 'feat-alpha', { at: T1 })
    const c3 = putPass(dir, 'feat-alpha', { at: T3, verdict: 'commit-continue' })
    const found = waitingPasses(reviewsDir(dir))
    assert.deepStrictEqual(
      found.passes.map((p) => [p.spec, p.code, p.verdict]),
      [['feat-alpha', c1, 'commit'], ['feat-beta', c2, 'changes'], ['feat-alpha', c3, 'commit-continue']],
    )
  } finally {
    cleanup(dir)
  }
})

// THE CASE THE WHOLE PHASE EXISTS FOR. `feat-gone` has no worktree and no spec
// folder — it was completed and torn down — and its pass must still be found.
test('a spec with no worktree is still listed', () => {
  const dir = scaffold()
  try {
    const code = putPass(dir, 'feat-gone', { at: T2 })
    const found = waitingPasses(reviewsDir(dir))
    assert.deepStrictEqual(found.passes.map((p) => [p.spec, p.code]), [['feat-gone', code]])
  } finally {
    cleanup(dir)
  }
})

// Rule 4: a file we cannot read is not an empty one. It holds someone's pass,
// and "nothing waiting" is the one reading that is certainly wrong.
test('an unreadable store is named, never counted as zero', () => {
  const dir = scaffold()
  try {
    const code = putPass(dir, 'feat-alpha', { at: T1 })
    fs.mkdirSync(reviewsDir(dir), { recursive: true })
    fs.writeFileSync(path.join(reviewsDir(dir), 'feat-broken.pending.json'), '{ not json')
    const found = waitingPasses(reviewsDir(dir))
    assert.deepStrictEqual(found.passes.map((p) => p.code), [code])
    assert.deepStrictEqual(found.unreadable, ['feat-broken'], 'said, not swallowed')
  } finally {
    cleanup(dir)
  }
})

test('a reviews directory that does not exist is empty, not an error', () => {
  const dir = scaffold()
  try {
    const found = waitingPasses(reviewsDir(dir))
    assert.deepStrictEqual(found.passes, [])
    assert.deepStrictEqual(found.unreadable, [])
  } finally {
    cleanup(dir)
  }
})

// It reads pending stores and nothing else — a notes sidecar and a rendered
// page sit in the same directory and are not passes.
test('only pending stores are read, not the pages beside them', () => {
  const dir = scaffold()
  try {
    fs.mkdirSync(reviewsDir(dir), { recursive: true })
    fs.writeFileSync(path.join(reviewsDir(dir), 'feat-alpha.html'), '<p>not a pass</p>')
    fs.writeFileSync(path.join(reviewsDir(dir), 'feat-alpha.notes.json'), '{"version":1}')
    const found = waitingPasses(reviewsDir(dir))
    assert.deepStrictEqual(found.passes, [])
    assert.deepStrictEqual(found.unreadable, [], 'and a page is not an unreadable store')
  } finally {
    cleanup(dir)
  }
})

// --- what `status` prints ---------------------------------------------------

test('status reports what is waiting, with the age and how to disown it', async () => {
  const dir = scaffold()
  try {
    const code = putPass(dir, 'feat-alpha', { at: T1 })
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.match(out, /Reviews waiting:/)
    assert.match(out, new RegExp(`feat-alpha[^\\n]*${code}`), 'the spec and its code on one line')
    assert.match(out, /ago/, 'with an age, which is the tell for a stranger’s pass')
    assert.match(out, /--drop/, 'and how to disown one')
  } finally {
    cleanup(dir)
  }
})

// A repo with nothing in flight is exactly where a stranded pass hides longest,
// and `specEnvStatus` used to return before it could say anything at all.
test('status still reports a waiting pass when nothing is provisioned', async () => {
  const dir = scaffold({ worktrees: [] })
  try {
    const code = putPass(dir, 'feat-gone', { at: T2 })
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.match(out, /no provisioned specs/i, 'it still says that')
    assert.match(out, /Reviews waiting:/, 'and does not stop there')
    assert.match(out, new RegExp(code))
  } finally {
    cleanup(dir)
  }
})

test('review waiting lists them on its own, and --json carries them', async () => {
  const dir = scaffold()
  try {
    const code = putPass(dir, 'feat-alpha', { at: T1 })
    const out = await runQuiet(['spec-env', 'review', 'waiting', '--dir', dir])
    assert.match(out, new RegExp(code))
    const json = JSON.parse(await runQuiet(['spec-env', 'review', 'waiting', '--dir', dir, '--json']))
    assert.deepStrictEqual(json.waiting.map((p) => [p.spec, p.code]), [['feat-alpha', code]])
  } finally {
    cleanup(dir)
  }
})

// STAYS SILENT (rule 3). A repo with no waiting pass must read exactly as it
// did before any of this existed — no heading, and no key in `--json`.
test('stays silent: nothing waiting adds no section and no json key', async () => {
  const dir = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.doesNotMatch(out, /Reviews waiting/i)
    assert.doesNotMatch(out, /--drop/)
    const json = JSON.parse(await runQuiet(['spec-env', 'review', 'waiting', '--dir', dir, '--json']))
    assert.ok(!('waiting' in json), 'absent, not an empty array')
  } finally {
    cleanup(dir)
  }
})

// Reporting a pass is not taking one. `/spec-diff` §0 is untouched by this.
test('it claims nothing — every pass is still there afterwards', async () => {
  const dir = scaffold()
  try {
    const code = putPass(dir, 'feat-alpha', { at: T1 })
    await runQuiet(['spec-env', 'status', '--dir', dir])
    await runQuiet(['spec-env', 'review', 'waiting', '--dir', dir])
    const store = readPending(reviewOutPath(dir, 'feat-alpha', null), 'feat-alpha').pending
    assert.deepStrictEqual(store.passes.map((p) => p.code), [code])
    assert.strictEqual(
      fs.existsSync(path.join(reviewsDir(dir), 'feat-alpha.notes.json')),
      false,
      'nothing was merged into any review',
    )
  } finally {
    cleanup(dir)
  }
})
