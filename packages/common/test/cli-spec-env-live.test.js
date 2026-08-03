'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { writeReceipt } = require('../src/env/live.js')

// Live-git tests for `spec-env live status`. Exercise the real anchor path: the
// authority on "who's live" is the branch checked out in the PRIMARY checkout,
// regardless of the cwd the command is invoked from.

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
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

function scaffoldRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-live-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main') // guarantee the base branch is `main`
  return dir
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

test('live status reports free when the primary checkout is on main', async () => {
  const dir = scaffoldRepo()
  try {
    const out = await runQuiet(['spec-env', 'live', 'status', '--dir', dir])
    assert.match(out, /primary:\s+main\s+\(on base — free\)/)
    assert.match(out, /receipt:\s+free — no spec is live/)
  } finally {
    cleanup(dir)
  }
})

test('live status anchors on the primary checkout when run from a worktree', async () => {
  const dir = scaffoldRepo()
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  try {
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/x', worktree)
    // Primary is still on main → free, whichever checkout we invoke from.
    const out = await runQuiet(['spec-env', 'live', 'status', '--dir', worktree])
    assert.match(out, /primary:\s+main\s+\(on base — free\)/)
  } finally {
    cleanup(dir)
  }
})

test('live status shows the feature in control and the receipt when held', async () => {
  const dir = scaffoldRepo()
  try {
    // Simulate a live session: primary switched to the feature branch + a receipt.
    git(dir, 'checkout', '-q', '-b', 'feat/x')
    writeReceipt(dir, { registry: '.spec-env/registry.json' }, {
      spec: 'feat-x',
      branch: 'feat/x',
      holder: 'Test',
      heldSince: '2026-08-03T10:00:00Z',
      baseMainCommit: git(dir, 'rev-parse', 'HEAD'),
    })
    const out = await runQuiet(['spec-env', 'live', 'status', '--dir', dir])
    assert.match(out, /primary:\s+feat\/x\s+\(feature in control — not on main\)/)
    assert.match(out, /receipt:\s+feat-x \(branch feat\/x\)/)
    assert.match(out, /held by Test/)
  } finally {
    cleanup(dir)
  }
})
