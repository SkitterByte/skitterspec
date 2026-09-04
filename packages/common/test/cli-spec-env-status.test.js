'use strict'

// `spec-env status` answers "what is provisioned?". A spec is provisioned when it
// has a WORKTREE — the slot registry only ever records specs whose Stack asks for
// Docker (`specEnvUp` allocates a slot solely when `wantsDocker`), so reading it
// alone reports nothing at all in a project with `docker.enabled: false`.
//
// Same wrong-signal shape fixed in `feat-script-only-commands` for zero-arg
// resolution: the registry is not evidence of provisioning.

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

function scaffold({ docker = false } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-status-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: docker } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  return dir
}

function addSpec(dir, folder, stack = 'worktree') {
  const specDir = path.join(dir, 'specs', 'in-progress', folder)
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), `# X\n\n> **Stack:** ${stack}\n`)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', `add ${folder}`)
}

function addWorktree(dir, folder) {
  const slug = folder.replace(/^(feat|bug|hotfix)-/, '')
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
  git(dir, 'worktree', 'add', '-q', '-b', `feat/${slug}`, worktree)
  return worktree
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

test('status lists a worktree-only spec in a project with Docker off', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addWorktree(dir, 'feat-alpha')
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.match(out, /feat-alpha/, 'the standing worktree is reported')
    assert.doesNotMatch(out, /no provisioned specs/, 'it is not called unprovisioned')
  } finally {
    cleanup(dir)
  }
})

test('status shows the worktree path, since that is what provisioned means', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    const wt = addWorktree(dir, 'feat-alpha')
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.ok(out.includes(path.basename(wt)), `expected the worktree path, got:\n${out}`)
  } finally {
    cleanup(dir)
  }
})

test('status lists every provisioned spec, not just the first', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addSpec(dir, 'feat-beta')
    addWorktree(dir, 'feat-alpha')
    addWorktree(dir, 'feat-beta')
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.match(out, /feat-alpha/, 'first')
    assert.match(out, /feat-beta/, 'second')
  } finally {
    cleanup(dir)
  }
})

// --- stays-silent (.claude/rules/negative-checks.md rule 3) -----------------

test('stays silent: a genuinely empty repo still reports no provisioned specs', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha') // a spec, but no worktree — not provisioned
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.match(out, /no provisioned specs/, 'a bucketed spec is not provisioned')
    assert.doesNotMatch(out, /feat-alpha/, 'and is not listed')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: the primary checkout is never listed as a provisioned spec', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addWorktree(dir, 'feat-alpha')
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.doesNotMatch(out, new RegExp(`${path.basename(dir)}\\s`), 'primary is not a spec')
  } finally {
    cleanup(dir)
  }
})
