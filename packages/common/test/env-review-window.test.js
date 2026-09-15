'use strict'

/**
 * The wait window — the one path that claims a pass nobody named.
 *
 * It exists because a phase that ends now waits on its page, so the button the
 * reader presses is what carries the work on. That inverts the old guard ("a
 * device that reaches your page cannot reach your conversation"), and these
 * tests pin what replaced it: the window decides which pass is yours, and
 * anything it cannot be sure about acts on nothing.
 *
 * The other half of the replacement — the serve token, which decides who can
 * POST at all — is covered by `cli-review-serve-bind.test.js`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const {
  passesSince,
  emptyPending,
  addPending,
  readPending,
  writePending,
  readNotes,
} = require('../src/env/review.js')

const blobOf = (over = {}) => ({
  version: 1,
  spec: 'feat-alpha',
  accepted: [],
  unaccepted: [],
  comments: [],
  ...over,
})

const store = (...entries) => {
  let pending = emptyPending('feat-alpha')
  const codes = []
  entries.forEach(([at, render], i) => {
    const added = addPending(pending, { blob: blobOf(), at, render: render || 'R' + i })
    pending = added.pending
    codes.push(added.code)
  })
  return { pending, codes }
}

// --- selection: the window, and nothing but the window ----------------------

test('a pass sent during the wait is in the window', () => {
  const { pending, codes } = store(['2026-01-01T10:05:00.000Z'])
  assert.deepStrictEqual(passesSince(pending, '2026-01-01T10:00:00.000Z').codes, codes)
})

test('a pass that was already waiting is not', () => {
  // THE STRANGER'S PASS. It was sitting there before this session began
  // waiting, which is exactly the case the old "never claim unasked" rule was
  // written about — and the window is what keeps that rule true automatically.
  const { pending } = store(['2026-01-01T09:00:00.000Z'])
  assert.deepStrictEqual(passesSince(pending, '2026-01-01T10:00:00.000Z').codes, [])
})

test('a pass sent at the instant the wait began counts', () => {
  // The boundary is inclusive: a press and a wait starting in the same
  // millisecond is one event, and excluding it would drop a real verdict.
  const { pending, codes } = store(['2026-01-01T10:00:00.000Z'])
  assert.deepStrictEqual(passesSince(pending, '2026-01-01T10:00:00.000Z').codes, codes)
})

test('a pass with no usable timestamp is never in the window', () => {
  // Cannot tell → inaction. Age is the one tell a stranger's pass has, and a
  // pass whose age cannot be established must not be auto-claimed on the
  // strength of having no age at all (`.claude/rules/negative-checks.md`).
  for (const at of [null, undefined, '', 'yesterday']) {
    const { pending } = store([at])
    assert.deepStrictEqual(passesSince(pending, '2026-01-01T10:00:00.000Z').codes, [], String(at))
  }
})

test('an unusable window selects nothing and says so, rather than selecting all', () => {
  const { pending } = store(['2026-01-01T10:05:00.000Z'])
  const got = passesSince(pending, 'not-a-time')
  assert.strictEqual(got.usable, false)
  assert.deepStrictEqual(got.codes, [])
})

test('two in the window are both returned, so the caller can refuse', () => {
  const { pending, codes } = store(['2026-01-01T10:01:00.000Z'], ['2026-01-01T10:02:00.000Z'])
  assert.deepStrictEqual(passesSince(pending, '2026-01-01T10:00:00.000Z').codes.sort(), codes.sort())
})

// --- through the CLI --------------------------------------------------------

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-window-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local' } }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\n')
  return { dir, wt }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  return out
}

const review = (dir, ...extra) => runQuiet(['spec-env', 'review', 'feat-alpha', '--dir', dir, ...extra])
const outPath = (dir) => path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html')

function hold(dir, blob, at) {
  const out = outPath(dir)
  const { pending } = readPending(out, 'feat-alpha')
  const added = addPending(pending, { blob, at, render: at })
  writePending(out, added.pending)
  return added.code
}

test('--claim-since claims the one pass in its window, exactly as --claim would', async () => {
  const { dir } = scaffold()
  try {
    await review(dir)
    hold(dir, blobOf({ verdict: 'discuss' }), '2026-01-01T09:00:00.000Z')
    hold(dir, blobOf({ verdict: 'commit', accepted: [{ path: 'app.js', hash: 'h1' }] }), '2026-01-01T10:05:00.000Z')

    const json = JSON.parse(await review(dir, '--claim-since', '2026-01-01T10:00:00.000Z', '--json'))
    assert.strictEqual(json.verdict.effective, 'commit')
    assert.strictEqual(json.claimed.accepted, 1)
    // A DELIVERY MECHANISM, not a second kind of review: it reached the same
    // sidecar a pasted blob would.
    assert.strictEqual(readNotes(outPath(dir), 'feat-alpha').notes.files['app.js'].acceptedHash, 'h1')
    // And the older pass is untouched — still waiting, still nobody's to take.
    assert.strictEqual(json.claimed.remaining, 1)
  } finally {
    cleanup(dir)
  }
})

test('--claim-since claims nothing when only an older pass is waiting', async () => {
  const { dir } = scaffold()
  try {
    await review(dir)
    hold(dir, blobOf({ verdict: 'commit' }), '2026-01-01T09:00:00.000Z')
    const said = await review(dir, '--claim-since', '2026-01-01T10:00:00.000Z')
    assert.match(said, /no pass has arrived since/)
    assert.match(said, /nothing claimed/)
    // It is still there: nothing was consumed by a wait it did not belong to.
    assert.strictEqual(readPending(outPath(dir), 'feat-alpha').pending.passes.length, 1)
  } finally {
    cleanup(dir)
  }
})

test('two in the window refuses, names the count, and names no codes', async () => {
  const { dir } = scaffold()
  try {
    await review(dir)
    const a = hold(dir, blobOf({ verdict: 'commit' }), '2026-01-01T10:01:00.000Z')
    const b = hold(dir, blobOf({ verdict: 'changes' }), '2026-01-01T10:02:00.000Z')
    const said = await review(dir, '--claim-since', '2026-01-01T10:00:00.000Z')
    assert.match(said, /2 passes arrived in that window/)
    // The same silence a wrong `--claim` keeps: listing the codes would hand a
    // guesser the answer the refusal exists to withhold.
    assert.doesNotMatch(said, new RegExp(a))
    assert.doesNotMatch(said, new RegExp(b))
    assert.strictEqual(readPending(outPath(dir), 'feat-alpha').pending.passes.length, 2, 'neither consumed')
  } finally {
    cleanup(dir)
  }
})

test('an unparseable window claims nothing rather than everything', async () => {
  const { dir } = scaffold()
  try {
    await review(dir)
    hold(dir, blobOf({ verdict: 'commit' }), '2026-01-01T10:05:00.000Z')
    const said = await review(dir, '--claim-since', 'whenever')
    assert.match(said, /is not a timestamp/)
    assert.strictEqual(readPending(outPath(dir), 'feat-alpha').pending.passes.length, 1)
  } finally {
    cleanup(dir)
  }
})

test('an explicit --claim still wins over a window', async () => {
  // The named path is never weakened by the automatic one existing beside it.
  const { dir } = scaffold()
  try {
    await review(dir)
    const older = hold(dir, blobOf({ verdict: 'commit' }), '2026-01-01T09:00:00.000Z')
    hold(dir, blobOf({ verdict: 'changes' }), '2026-01-01T10:05:00.000Z')
    const json = JSON.parse(
      await review(dir, '--claim', older, '--claim-since', '2026-01-01T10:00:00.000Z', '--json'),
    )
    assert.strictEqual(json.claimed.code, older)
  } finally {
    cleanup(dir)
  }
})
