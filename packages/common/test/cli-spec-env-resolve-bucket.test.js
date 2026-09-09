'use strict'

/**
 * A live-git test for the half of `resolveSpecWithWorktree` that unit tests
 * cannot reach: the CLI must report a spec's bucket and `Stack:` from the
 * spec's OWN worktree, not from the primary checkout's stale copy.
 *
 * `/spec-start` performs the backlog→in-progress move on the spec's own branch,
 * so the primary checkout keeps showing `backlog` for the entire life of the
 * spec. The same stale file also supplies `Stack:`, which is why escalating a
 * spec to docker by editing its header in the worktree used to be invisible to
 * `spec-env up`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
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

/**
 * A repo where `feat-x` is `backlog` on main and `in-progress` on its own
 * branch — exactly the shape `/spec-start` leaves behind. `withWorktree: false`
 * builds the same repo with no worktree at all, for the stays-silent case.
 */
function scaffold({ withWorktree = true } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-bucket-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')

  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')

  const backlog = path.join(dir, 'specs', 'backlog', 'feat-x')
  fs.mkdirSync(backlog, { recursive: true })
  fs.writeFileSync(path.join(backlog, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')

  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  if (!withWorktree) return { dir, worktree: null }

  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/x', worktree)

  // What /spec-start does, on the spec's branch: move the bucket, and (here) also
  // escalate the Stack, which is the header edit the docs tell you to make.
  fs.mkdirSync(path.join(worktree, 'specs', 'in-progress'), { recursive: true })
  git(worktree, 'mv', 'specs/backlog/feat-x', 'specs/in-progress/feat-x')
  fs.writeFileSync(
    path.join(worktree, 'specs', 'in-progress', 'feat-x', '00-overview.md'),
    '# X\n\n> **Stack:** worktree + docker\n',
  )
  git(worktree, 'add', '-A')
  git(worktree, 'commit', '-q', '-m', 'start')

  return { dir, worktree }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

test('resolve reports the bucket from the spec\'s worktree, run from the primary checkout', async () => {
  const { dir } = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'resolve', 'feat-x', '--dir', dir])
    assert.match(out, /feat-x \(in-progress\)/)
    assert.doesNotMatch(out, /feat-x \(backlog\)/)
  } finally {
    cleanup(dir)
  }
})

test('and the same answer when run from inside the worktree', async () => {
  const { dir, worktree } = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'resolve', 'feat-x', '--dir', worktree])
    assert.match(out, /feat-x \(in-progress\)/)
  } finally {
    cleanup(dir)
  }
})

test('repo identity still comes from the primary checkout, not the worktree', async () => {
  // Guards `bug-spec-env-cwd-anchor`: only the spec FILE lookup prefers the
  // worktree. The worktree path and project name are repo-level facts and must
  // read identically from either side.
  const { dir, worktree } = scaffold()
  try {
    const fromPrimary = await runQuiet(['spec-env', 'resolve', 'feat-x', '--dir', dir])
    const fromWorktree = await runQuiet(['spec-env', 'resolve', 'feat-x', '--dir', worktree])
    const line = (out, label) => out.split('\n').find((l) => l.startsWith(label))
    assert.strictEqual(line(fromPrimary, 'worktree:'), line(fromWorktree, 'worktree:'))
    assert.strictEqual(line(fromPrimary, 'project:'), line(fromWorktree, 'project:'))
  } finally {
    cleanup(dir)
  }
})

// STAYS SILENT: a spec that has no worktree at all — the ordinary backlog case —
// must still report the primary checkout's bucket. The absence of a worktree is
// not evidence of anything; it is simply a spec nobody has started.
test('a spec with no worktree still reports its primary-checkout bucket', async () => {
  const { dir } = scaffold({ withWorktree: false })
  try {
    const out = await runQuiet(['spec-env', 'resolve', 'feat-x', '--dir', dir])
    assert.match(out, /feat-x \(backlog\)/)
  } finally {
    cleanup(dir)
  }
})
