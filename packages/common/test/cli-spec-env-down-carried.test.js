'use strict'

/**
 * `spec-env down` after a re-land by cherry-pick (bug-up-forks-from-head,
 * phase 3).
 *
 * The hand recovery from a branch that carried another spec's commits was to
 * reset the base and cherry-pick the spec's own commits onto it. The branch is
 * then never an ancestor of the base, so `down` refused with "unpushed commits
 * not yet merged" and needed `--force` — although nothing on it would be lost:
 * its own commits are on the base as patches, and the rest are on the other
 * spec's branch. Real repos, because `git cherry` and reachability are the
 * whole signal.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function commit(cwd, file, msg) {
  fs.writeFileSync(path.join(cwd, file), `${msg}\n`)
  git(cwd, ['add', '-A'])
  git(cwd, ['commit', '-q', '-m', msg])
}

function scaffold() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-carried-')))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ docker: { enabled: false }, guards: { baseIsLandingZone: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  for (const folder of ['feat-live', 'feat-next']) {
    const d = path.join(dir, 'specs', 'in-progress', folder)
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  }
  commit(dir, 'seed.txt', 'init')
  git(dir, ['branch', '-M', 'main'])
  const wt = (slug) => path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
  // Spec A's work, and B created on top of it, as the old `up` made it.
  git(dir, ['worktree', 'add', '-q', '-b', 'feat/live', wt('live'), 'main'])
  commit(wt('live'), 'a1.txt', 'live work')
  git(dir, ['worktree', 'add', '-q', '-b', 'feat/next', wt('next'), 'feat/live'])
  commit(wt('next'), 'b1.txt', 'next fix')
  return { dir, wt }
}

function cleanup({ dir }) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function down(fx) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(['spec-env', 'down', 'feat-next', '--dir', fx.dir])
  } finally {
    process.stdout.write = orig
  }
  return out
}

test('down: a branch re-landed by cherry-pick, the rest held by another spec, needs no --force', async () => {
  const fx = scaffold()
  try {
    // The hand recovery: only B's own commit onto main.
    git(fx.dir, ['cherry-pick', git(fx.dir, ['rev-parse', 'feat/next'])])
    const out = await down(fx)
    assert.doesNotMatch(out, /blocked/)
    assert.match(out, /git worktree remove/)
    // Nothing would be lost, so the branch delete may use -D like any landed one.
    assert.match(out, /git branch -D feat\/next/)
  } finally {
    cleanup(fx)
  }
})

test('stays silent: a commit held by no other branch and not on the base still refuses', async () => {
  const fx = scaffold()
  try {
    // B's own commit is nowhere else; A's commit is on feat/live.
    const out = await down(fx)
    assert.match(out, /blocked — worktree has unpushed commits not yet merged into the base branch/)
  } finally {
    cleanup(fx)
  }
})

test('stays silent: the other spec\'s commit is gone from every other branch, so it still refuses', async () => {
  const fx = scaffold()
  try {
    git(fx.dir, ['cherry-pick', git(fx.dir, ['rev-parse', 'feat/next'])])
    git(fx.dir, ['worktree', 'remove', '--force', fx.wt('live')])
    git(fx.dir, ['branch', '-q', '-D', 'feat/live'])
    const out = await down(fx)
    assert.match(out, /blocked — worktree has unpushed commits/)
  } finally {
    cleanup(fx)
  }
})
