'use strict'

/**
 * `spec-env review wait` — the wait, as one tested command.
 *
 * It exists because the wait had no implementation. The skills said "watch the
 * pending store and end your turn" and stopped, so every run wrote its own
 * watcher in shell — and three of them failed in two days, each reported as
 * *"I pressed the button and nothing happened"*:
 *
 * - `until [ -f "$P" ] && [ "$x" \> "$y" ]` — `\>` is a bash-ism that the `[`
 *   builtin in zsh rejects. The loop spun for five minutes writing
 *   `condition expected: >` to a stderr nobody reads.
 * - a watch bounded at an hour, against a reader who came back at two.
 * - a link pointing at a port another repo had taken.
 *
 * The first two are what this closes, and the comparison is the point: it
 * happens HERE, in one place, in Node, where a test can run it — rather than in
 * a shell predicate composed fresh each time and proven by nothing.
 *
 * WHAT MADE THOSE FAILURES EXPENSIVE was not the bugs. It is that **silence was
 * the success signal**: a watcher that could never fire and one patiently
 * working are indistinguishable from outside. So this says it started, and the
 * test at the bottom runs a store that gains a pass mid-flight — which a
 * predicate that can never be true cannot survive.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, execFile } = require('node:child_process')

const {
  emptyPending,
  addPending,
  readPending,
  writePending,
  reviewOutPath,
} = require('../src/env/review.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-wait-')))
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

// The store the server would have written, placed directly — this is about the
// wait, not about how a pass gets there.
// `render` defaults to `at`, which is what two real renders look like: the page
// stamps `generatedAt` per render and `addPending` supersedes WITHIN one. Two
// passes sharing a render is the deliberate replace-my-mind case, not two
// readers — so a fixture for "two people, two passes" must give them two.
function putPass(dir, { at, verdict = 'commit', render = null } = {}) {
  const out = reviewOutPath(dir, 'feat-alpha', null)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  // The engine's own reader, never a hand-built path. Spelling the sidecar's
  // location by hand here silently started every write from an empty store, so
  // a second pass overwrote the first and the two-in-a-window case could not
  // be constructed at all.
  const store = readPending(out, 'feat-alpha').pending
  const added = addPending(store, {
    blob: { version: 1, spec: 'feat-alpha', accepted: [], unaccepted: [], comments: [], verdict },
    at,
    render: render === null ? at : render,
  })
  writePending(out, added.pending)
  return added.code
}

// A CHILD PROCESS, not the in-process `run`. Two reasons, and the second is the
// one that matters: the exit status is the contract here — a caller routes on
// timeout versus arrived versus ambiguous — and only a real process has one.
// The first is mechanical: these waits are long, and capturing stdout by
// monkey-patching `process.stdout.write` across a multi-second await swallows
// the test runner's own output along with the command's.
// THIS package's bin, never a distribution's. `packages/skitterspec/src/` is a
// build artefact and gitignored, so pointing at it would test whatever the last
// build produced — a green suite against code this file did not change, and a
// red one on a clean checkout that has not built yet.
const BIN = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function runCli(argv) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...argv], { timeout: 30000 }, (err, stdout, stderr) => {
      resolve({ out: `${stdout}${stderr}`, code: err && typeof err.code === 'number' ? err.code : 0 })
    })
  })
}

const wait = (dir, ...extra) =>
  runCli(['spec-env', 'review', 'wait', 'feat-alpha', '--dir', dir, ...extra])

const EARLIER = '2026-09-16T10:00:00.000Z'
const SINCE = '2026-09-16T11:00:00.000Z'
const LATER = '2026-09-16T11:05:00.000Z'
const LATER2 = '2026-09-16T11:06:00.000Z'

test('a pass inside the window ends the wait and names its code', async () => {
  const { dir } = scaffold()
  try {
    const code = putPass(dir, { at: LATER })
    const { out, code: exit } = await wait(dir, '--since', SINCE)
    assert.strictEqual(exit, 0)
    assert.match(out, new RegExp(code), 'the code is named, so the caller can claim exactly it')
  } finally {
    cleanup(dir)
  }
})

// THE WINDOW IS THE SCOPE, and it is the same rule `--claim-since` follows: a
// pass already sitting there when the wait began is a stranger's, or an older
// sitting's, and must not end a wait that was not about it.
test('a pass that predates the window does not end the wait', async () => {
  const { dir } = scaffold()
  try {
    putPass(dir, { at: EARLIER })
    const { out, code } = await wait(dir, '--since', SINCE, '--timeout', '1')
    assert.notStrictEqual(code, 0, 'it timed out rather than returning a pass')
    assert.doesNotMatch(out, /\b\d{6}\b/, 'and named no code')
  } finally {
    cleanup(dir)
  }
})

// Two in one window is the ambiguity `--claim-since` refuses to resolve, so
// this must not resolve it either — it reports the count and never a code.
test('two passes in the window refuse rather than pick', async () => {
  const { dir } = scaffold()
  try {
    putPass(dir, { at: LATER })
    putPass(dir, { at: LATER2 })
    const { out, code } = await wait(dir, '--since', SINCE, '--timeout', '1')
    assert.notStrictEqual(code, 0)
    assert.match(out, /2 passes/, 'it names the count')
    assert.doesNotMatch(out, /\b\d{6}\b/, 'and never a code')
  } finally {
    cleanup(dir)
  }
})

test('a timeout that elapses exits distinctly from a pass arriving', async () => {
  const { dir } = scaffold()
  try {
    const { out, code } = await wait(dir, '--since', SINCE, '--timeout', '1')
    assert.notStrictEqual(code, 0)
    assert.match(out, /timed out/i)
  } finally {
    cleanup(dir)
  }
})

// A window it cannot compute is not a window to wait forever inside. Refuse at
// once rather than block on a comparison that can never be satisfied — which is
// precisely the failure this command exists to stop.
test('an unparseable --since refuses immediately, never waits', async () => {
  const { dir } = scaffold()
  try {
    const { out, code } = await wait(dir, '--since', 'yesterday-ish')
    assert.notStrictEqual(code, 0)
    assert.match(out, /not a timestamp/i)
  } finally {
    cleanup(dir)
  }
})

test('--since is required — an absent window is not an open one', async () => {
  const { dir } = scaffold()
  try {
    const { out, code } = await wait(dir)
    assert.notStrictEqual(code, 0)
    assert.match(out, /--since/)
  } finally {
    cleanup(dir)
  }
})

// It WAITS; the claim stays a separate deliberate step, so `/spec-diff` §0 goes
// on meaning what it says.
test('it claims nothing — the pass is still there afterwards', async () => {
  const { dir } = scaffold()
  try {
    const code = putPass(dir, { at: LATER })
    await wait(dir, '--since', SINCE)
    const store = JSON.parse(
      fs.readFileSync(path.join(dir, '.spec-env', 'reviews', 'feat-alpha.pending.json'), 'utf8'),
    )
    assert.deepStrictEqual(store.passes.map((p) => p.code), [code], 'still waiting to be claimed')
    assert.strictEqual(
      fs.existsSync(path.join(dir, '.spec-env', 'reviews', 'feat-alpha.notes.json')),
      false,
      'and nothing was merged into the review',
    )
  } finally {
    cleanup(dir)
  }
})

// SILENCE IS NOT THE SUCCESS SIGNAL. A caller must be able to tell a live wait
// from a dead one, which is the whole reason the shell watchers were expensive.
test('it says it started, and names the window it is waiting in', async () => {
  const { dir } = scaffold()
  try {
    putPass(dir, { at: LATER })
    const { out } = await wait(dir, '--since', SINCE)
    assert.match(out, /waiting/i, 'it announces the wait')
    assert.match(out, new RegExp(SINCE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'and the window')
    assert.match(out, /feat-alpha/, 'and which spec')
  } finally {
    cleanup(dir)
  }
})

// Stays silent (`.claude/rules/negative-checks.md` rule 3): none of these is a
// reason to return. A wait that ended on an empty store would be reporting "no
// pass" as an outcome, which is the opposite of what it is for.
test('stays silent: absent, empty, and older-only stores all keep waiting', async () => {
  const { dir } = scaffold()
  try {
    for (const prepare of [
      () => {},
      () => writePending(reviewOutPath(dir, 'feat-alpha', null), emptyPending('feat-alpha')),
      () => putPass(dir, { at: EARLIER }),
    ]) {
      fs.rmSync(path.join(dir, '.spec-env', 'reviews'), { recursive: true, force: true })
      prepare()
      const { code } = await wait(dir, '--since', SINCE, '--timeout', '1')
      assert.notStrictEqual(code, 0, 'it kept waiting until the timeout')
    }
  } finally {
    cleanup(dir)
  }
})

// THE TEST THAT WOULD HAVE CAUGHT THE REAL BUG. A predicate that can never be
// true passes every static check and fails only this: a store that is empty
// when the wait starts and gains a pass while it is running.
test('a pass arriving mid-flight ends the wait', async () => {
  const { dir } = scaffold()
  try {
    let code = null
    const arriving = new Promise((resolve) =>
      setTimeout(() => {
        code = putPass(dir, { at: new Date().toISOString() })
        resolve()
      }, 150),
    )
    const since = new Date(Date.now() - 1000).toISOString()
    const [{ out, code: exit }] = await Promise.all([wait(dir, '--since', since, '--timeout', '20'), arriving])
    assert.strictEqual(exit, 0, 'it returned because a pass arrived, not because it gave up')
    assert.match(out, new RegExp(code), 'and named the one that arrived')
  } finally {
    cleanup(dir)
  }
})
