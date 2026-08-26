'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

// A live-git integration test for `spec-env integrate`. It exercises the real
// resolve/anchor path end-to-end — the piece that unit tests can't reach — and
// pins the regression: `integrate` must resolve the spec and the fast-forward
// target against the PRIMARY checkout even when invoked from inside a worktree.

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim()
}

// Run the CLI with stdout captured.
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

// Build a primary checkout on `main` with an isolated spec, plus a real worktree
// on the spec's branch holding one commit ahead of main (so integrate has work).
function scaffoldRepoWithWorktree() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-int-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')

  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n') // ignore runtime state
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')

  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main') // guarantee the base branch is `main`

  // Worktree path the engine derives: <parent>/<repo>-wt/<slug>, branch feat/x.
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/x', worktree)
  fs.writeFileSync(path.join(worktree, 'change.txt'), 'work\n')
  git(worktree, 'add', '-A')
  git(worktree, 'commit', '-q', '-m', 'phase 1')

  return { dir, worktree }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

test('integrate anchors on the primary checkout when run from inside a worktree', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    // Invoke from the worktree (via --dir) — the dispatch must anchor back to the
    // primary checkout. This drives the real planIntegrate path (the regression:
    // it once referenced a removed `mainRepoPath` local and threw).
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', worktree])

    assert.match(out, /spec-env integrate: feat-x/, 'prints the plan (no crash, not a no-op)')
    // The rebase runs in the worktree…
    assert.match(out, new RegExp(`git -C ${worktree} rebase main`), 'rebase targets the worktree')
    // …and the fast-forward lands on the PRIMARY checkout, not the worktree.
    assert.match(
      out,
      new RegExp(`git -C ${dir} merge --ff-only feat/x`),
      'ff-merge is anchored on the primary checkout',
    )
  } finally {
    cleanup(dir)
  }
})

test('integrate from inside a worktree resolves identically to running from main', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    const fromWorktree = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', worktree])
    const fromPrimary = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.strictEqual(fromWorktree, fromPrimary, 'same plan whether invoked from worktree or main')
  } finally {
    cleanup(dir)
  }
})

test('integrate is live-aware: ends the live session, then lands and re-isolates', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // primary → feat/x
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')

    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    // It ended the live session first…
    assert.match(out, /ended live session — feat-x released/)
    // …then printed the normal landing plan.
    assert.match(out, new RegExp(`git -C ${worktree} rebase main`))
    assert.match(out, new RegExp(`git -C ${dir} merge --ff-only feat/x`))

    // Back to the normal state: primary on base, branch re-isolated, receipt gone.
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main')
    assert.strictEqual(git(worktree, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'live.json')))
  } finally {
    cleanup(dir)
  }
})

test('integrate refuses when a different spec holds the primary checkout', async () => {
  const { dir } = scaffoldRepoWithWorktree()
  try {
    git(dir, 'checkout', '-q', '-b', 'feat/other') // another spec "live" on the primary
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /blocked — another spec \(feat\/other\) holds the primary checkout/)
  } finally {
    cleanup(dir)
  }
})

test('integrate aborts on stranded detached-HEAD commits without ending the live session', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // primary → feat/x, worktree detached
    // Simulate a non-live-aware /spec-go committing into the detached worktree —
    // the commit lands on the detached HEAD, never advancing the branch ref.
    fs.writeFileSync(path.join(worktree, 'stray.txt'), 'stray\n')
    git(worktree, 'add', '-A')
    git(worktree, 'commit', '-q', '-m', 'stray phase 2')

    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /blocked — 1 commit\(s\) are stranded on the detached HEAD/)
    // The live session must NOT have been ended — primary still on the branch, receipt intact.
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
    assert.ok(fs.existsSync(path.join(dir, '.spec-env', 'live.json')), 'receipt untouched')
  } finally {
    cleanup(dir)
  }
})

test('integrate aborts when live but the worktree is gone, without ending the live session', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // primary → feat/x
    git(dir, 'worktree', 'remove', '--force', worktree) // worktree vanishes while live

    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /blocked — feat-x is live but has no worktree to land from/)
    // Live session left intact — nothing checked out base, nothing landed silently.
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
  } finally {
    cleanup(dir)
  }
})

test('integrate lands fixes committed on the branch while live (commit-in-primary flow)', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // primary → feat/x
    // The live-aware flow: commit the fix on the branch in the PRIMARY checkout.
    fs.writeFileSync(path.join(dir, 'fix.txt'), 'fix\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'live fix')

    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /ended live session — feat-x released/)
    assert.match(out, /spec-env integrate: feat-x/, 'prints the landing plan, not a no-op')
    assert.doesNotMatch(out, /already landed/, 'the live fix is not silently dropped')
    assert.match(out, new RegExp(`git -C ${worktree} rebase main`))

    // Re-isolated: primary back on base, worktree carries the live fix on the branch.
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main')
    assert.strictEqual(git(worktree, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
    assert.match(git(worktree, 'log', '--oneline'), /live fix/)
  } finally {
    cleanup(dir)
  }
})
