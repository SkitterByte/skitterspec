'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const BIN = path.join(__dirname, '..', 'bin', 'skitterspec.js')

// A live-git integration test for `spec-env dev up|down`, driven through the real
// binary from a real cwd. It pins the regression that made the browser-testing
// path unreachable: /spec-go git-mv's the spec into specs/in-progress/ ON THE
// SPEC'S BRANCH, so the spec exists only in its worktree — and `dev` resolved
// specs against the primary checkout alone, so it threw "spec not found under
// specs/**" for exactly the specs it exists to serve. Every spec-env subcommand
// now goes through one resolution path (primary checkout, then the spec's
// worktree), so each works identically from either root.
//
// The CLI runs as a subprocess rather than via `run()` in-process: `dev up`
// spawns and kills real child processes, and an in-process test would have to
// patch `process.stdout.write` across those long async windows — which swallows
// the test runner's own result messages.

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

// Run the CLI *from* `cwd` (no --dir) — the repro's shape: invoked inside the
// worktree, where the spec is on disk but the git common dir points at main.
function cli(cwd, ...args) {
  return execFileSync(process.execPath, [BIN, ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString()
}

// A dev process that just stays alive — enough to exercise spawn/pid/kill
// without binding a port or needing a health gate.
const IDLE = 'node -e "setInterval(function(){},1000)"'

// Primary checkout on `main` plus a worktree on the spec's branch, with the spec
// folder present ONLY on that branch: the post-/spec-go state.
function scaffoldBranchOnlySpec() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-dev-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')

  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      {
        baseBranch: 'main',
        docker: { enabled: false },
        dev: [{ name: 'web', command: IDLE, portVar: 'PORT' }],
      },
      null,
      2,
    ),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')

  // The spec starts in the backlog on main…
  const backlog = path.join(dir, 'specs', 'backlog', 'feat-x')
  fs.mkdirSync(backlog, { recursive: true })
  fs.writeFileSync(path.join(backlog, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/x', worktree)

  // …and /spec-go moves it to in-progress on the BRANCH, in the worktree, while
  // main drops its backlog copy. The spec now exists nowhere in the primary
  // checkout's working tree.
  fs.mkdirSync(path.join(worktree, 'specs', 'in-progress'), { recursive: true })
  git(worktree, 'mv', 'specs/backlog/feat-x', 'specs/in-progress/feat-x')
  git(worktree, 'commit', '-q', '-m', 'start spec')
  git(dir, 'rm', '-r', '-q', 'specs/backlog/feat-x')
  git(dir, 'commit', '-q', '-m', 'drop backlog copy')

  assert.ok(!fs.existsSync(path.join(dir, 'specs', 'backlog', 'feat-x')))
  assert.ok(!fs.existsSync(path.join(dir, 'specs', 'in-progress', 'feat-x')))
  assert.ok(fs.existsSync(path.join(worktree, 'specs', 'in-progress', 'feat-x')))

  return { dir, worktree }
}

function cleanup(dir) {
  try {
    cli(dir, 'spec-env', 'dev', 'down', 'feat-x')
  } catch {}
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

for (const from of ['primary', 'worktree']) {
  test(`dev up/down drive a branch-only spec from the ${from} checkout`, () => {
    const { dir, worktree } = scaffoldBranchOnlySpec()
    const cwd = from === 'primary' ? dir : worktree
    try {
      const up = cli(cwd, 'spec-env', 'dev', 'up', 'feat-x')
      assert.doesNotMatch(up, /spec not found/, 'the branch-only spec resolves')
      assert.match(up, /spec-env dev up: feat-x {2}slot 0/)
      assert.match(up, /web: port \d+ {2}pid \d+ {2}started/)

      // The dev process really started, and its log/pid state landed under the
      // PRIMARY checkout — one state dir, whichever root you invoked from.
      const pid = Number(
        fs.readFileSync(path.join(dir, '.spec-env', 'pids', 'feat-x-web.pid'), 'utf-8').trim(),
      )
      assert.ok(pid > 0, 'pid file written under the primary checkout')
      assert.doesNotThrow(() => process.kill(pid, 0), 'the dev process is alive')
      assert.ok(fs.existsSync(path.join(dir, '.spec-env', 'logs', 'feat-x-web.log')))

      const down = cli(cwd, 'spec-env', 'dev', 'down', 'feat-x')
      assert.doesNotMatch(down, /spec not found/)
      assert.match(down, new RegExp(`web: stopped \\(pid ${pid}\\)`))
      assert.throws(() => process.kill(pid, 0), 'the dev process was killed')
    } finally {
      cleanup(dir)
    }
  })
}

test('dev up resolves the same spec, slot and ports from the worktree and from main', () => {
  const { dir, worktree } = scaffoldBranchOnlySpec()
  try {
    const fromWorktree = cli(worktree, 'spec-env', 'dev', 'up', 'feat-x')
    // Idempotent re-run from the other root: same spec, same slot, same block.
    const fromPrimary = cli(dir, 'spec-env', 'dev', 'up', 'feat-x')

    assert.match(fromPrimary, /already running/, 'the second call reuses the running process')
    const normalise = (s) => s.replace(/pid \d+/, 'pid N').replace('already running', 'started')
    assert.strictEqual(normalise(fromPrimary), normalise(fromWorktree))
  } finally {
    cleanup(dir)
  }
})

// The audit the fix is built on: resolution is one deliberate choice, applied by
// every subcommand — not a per-subcommand accident.
test('every spec-env subcommand resolves a branch-only spec from either root', () => {
  const { dir, worktree } = scaffoldBranchOnlySpec()
  try {
    for (const cwd of [dir, worktree]) {
      const where = cwd === dir ? 'primary' : 'worktree'
      for (const args of [
        ['resolve', 'feat-x'],
        ['up', 'feat-x'],
        ['dev', 'up', 'feat-x'],
        ['connect', 'feat-x'],
        ['integrate', 'feat-x'],
        ['live', 'status', 'feat-x'],
        ['down', 'feat-x'],
      ]) {
        const out = cli(cwd, 'spec-env', ...args)
        assert.doesNotMatch(out, /spec not found/, `spec-env ${args.join(' ')} from ${where}`)
      }
    }
  } finally {
    cleanup(dir)
  }
})

test('resolve reports the same coordinates from the worktree as from main', () => {
  const { dir, worktree } = scaffoldBranchOnlySpec()
  try {
    assert.strictEqual(
      cli(worktree, 'spec-env', 'resolve', 'feat-x'),
      cli(dir, 'spec-env', 'resolve', 'feat-x'),
    )
    assert.match(cli(worktree, 'spec-env', 'resolve', 'feat-x'), /spec: {7}feat-x \(in-progress\)/)
  } finally {
    cleanup(dir)
  }
})
