'use strict'

/**
 * `spec-env resume` against a real repo (feat-spec-resume): the cases only git
 * can show — a spec that exists on its branch and nowhere else, read from the
 * primary checkout where base still says nothing about it.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { shellPath } = require('../src/env/project.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  const code = process.exitCode
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
  const exit = process.exitCode
  process.exitCode = code
  return { out, exit }
}

function write(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), text)
}

// main knows nothing of feat-x; feat/x carries it in-progress, linked to #999.
// `withWorktree` provisions it the way /spec-start does.
function scaffold({ withWorktree = false } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-resume-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  write(
    dir,
    'specs/.core/env.config.json',
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, branch: { pattern: '{type}/{slug}', identifierField: 'github_identifier' } }),
  )
  write(dir, '.gitignore', '/.spec-env/\n')
  write(dir, 'specs/backlog/feat-parked/00-overview.md', '# Parked\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  git(dir, 'switch', '-q', '-c', 'feat/x')
  write(
    dir,
    'specs/in-progress/feat-x/00-overview.md',
    '---\ngithub_identifier: "#999"\n---\n\n# X\n\n> **Blocked on:** waiting on LSC release\n',
  )
  write(dir, 'specs/in-progress/feat-x/01-one.md', '# Phase 1 ✅\n')
  write(dir, 'specs/in-progress/feat-x/02-two.md', '# Phase 2 ⬜\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'start feat-x')
  git(dir, 'switch', '-q', 'main')
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  if (withWorktree) git(dir, 'worktree', 'add', '-q', worktree, 'feat/x')
  return { dir, worktree }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

test('a branch-only spec resolves by ticket from the primary checkout, with an attach plan', async () => {
  const { dir, worktree } = scaffold()
  try {
    const { out, exit } = await runQuiet(['spec-env', 'resume', '#999', '--dir', dir, '--json'])
    const r = JSON.parse(out)
    assert.strictEqual(exit, undefined)
    assert.strictEqual(r.spec, 'feat-x')
    assert.strictEqual(r.bucket, 'in-progress')
    assert.strictEqual(r.source, 'branch')
    assert.deepStrictEqual(r.blockers, [{ where: 'spec', text: 'waiting on LSC release', until: null }])
    // The engine's own quoting, so the expectation holds on Windows too.
    assert.deepStrictEqual(r.commands, [`git worktree add ${shellPath(worktree)} feat/x`])
    assert.deepStrictEqual(r.then, ['skitterspec spec-env bootstrap feat-x'])
  } finally {
    cleanup(dir)
  }
})

test('with its worktree in place there is nothing to provision', async () => {
  const { dir, worktree } = scaffold({ withWorktree: true })
  try {
    const { out } = await runQuiet(['spec-env', 'resume', 'feat-x', '--dir', dir, '--json'])
    const r = JSON.parse(out)
    assert.strictEqual(r.source, 'worktree')
    assert.deepStrictEqual(r.worktree, { path: worktree, present: true })
    assert.deepStrictEqual(r.commands, [])
  } finally {
    cleanup(dir)
  }
})

test('a backlog spec is refused with a non-zero exit, naming /spec-start', async () => {
  const { dir } = scaffold()
  try {
    const { out, exit } = await runQuiet(['spec-env', 'resume', 'feat-parked', '--dir', dir])
    assert.strictEqual(exit, 1)
    assert.match(out, /in backlog — it was never started; \/spec-start/)
  } finally {
    cleanup(dir)
  }
})

// STAYS SILENT: one spec in flight, an unknown ticket — it must not answer
// with the one spec it can see.
test('an unknown ticket refuses and names nothing', async () => {
  const { dir } = scaffold({ withWorktree: true })
  try {
    const { out, exit } = await runQuiet(['spec-env', 'resume', '#1', '--dir', dir])
    assert.strictEqual(exit, 1)
    assert.doesNotMatch(out, /feat-x/)
  } finally {
    cleanup(dir)
  }
})

// A completed spec, the way /spec-complete leaves it: landed on main, branch gone.
function scaffoldComplete(dir) {
  write(dir, 'specs/complete/feat-done/00-overview.md', '# Done\n\n> **Type:** Feature\n')
  write(dir, 'specs/complete/feat-done/01-one.md', '# Phase 1 ✅\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'complete feat-done')
}

test('a completed spec refuses with an offer, and --reopen plans a fork from main', async () => {
  const { dir } = scaffold()
  try {
    scaffoldComplete(dir)
    const refused = await runQuiet(['spec-env', 'resume', 'feat-done', '--dir', dir, '--json'])
    assert.strictEqual(refused.exit, 1)
    assert.strictEqual(JSON.parse(refused.out).offer.command, 'skitterspec spec-env resume feat-done --reopen')

    const { out, exit } = await runQuiet(['spec-env', 'resume', 'feat-done', '--reopen', '--dir', dir, '--json'])
    const r = JSON.parse(out)
    assert.strictEqual(exit, undefined)
    assert.strictEqual(r.base, 'main')
    assert.deepStrictEqual(r.commands, ['git branch -f feat/done main', 'skitterspec spec-env up feat-done'])
  } finally {
    cleanup(dir)
  }
})

test('--reopen resets a merged leftover branch and refuses an unmerged one', async () => {
  const { dir } = scaffold()
  try {
    scaffoldComplete(dir)
    git(dir, 'branch', 'feat/done', 'HEAD~1')
    const merged = JSON.parse((await runQuiet(['spec-env', 'resume', 'feat-done', '--reopen', '--dir', dir, '--json'])).out)
    assert.strictEqual(merged.ok, true)

    git(dir, 'branch', '-f', 'feat/done', 'feat/x')
    const { out, exit } = await runQuiet(['spec-env', 'resume', 'feat-done', '--reopen', '--dir', dir])
    assert.strictEqual(exit, 1)
    assert.match(out, /feat\/done still exists with commits not on main/)
  } finally {
    cleanup(dir)
  }
})
