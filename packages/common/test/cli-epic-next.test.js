'use strict'

/**
 * Live git, end to end: `skitterspec epic status` and `skitterspec status`
 * carry each spec's next action, read off its own worktree and the review
 * sidecars beside its page — and a bare `epic status` means the epic of the
 * worktree it runs in (spec feat-epic-next, phase 2).
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

async function runQuiet(argv, cwd = null) {
  const orig = process.stdout.write
  const was = process.cwd()
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    if (cwd) process.chdir(cwd)
    await run(argv)
  } finally {
    process.stdout.write = orig
    process.chdir(was)
  }
  return out
}

const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

/**
 * `epic-x` with two members: `feat-a` in flight in its own worktree, phase 1 of
 * 2 done, and `feat-b` in the backlog waiting on `feat-a`.
 */
function scaffold() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-epic-next-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  write(path.join(dir, 'specs', '.core', 'env.config.json'), JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }))
  write(path.join(dir, '.gitignore'), '/.spec-env/\n')
  write(path.join(dir, 'specs', 'backlog', 'epic-x', '00-overview.md'), '# X\n\n> **Type:** Epic\n')
  const a = path.join(dir, 'specs', 'backlog', 'feat-a')
  write(path.join(a, '00-overview.md'), '# A\n\n> **Epic:** epic-x\n> **Waits on:** none\n')
  write(path.join(a, '01-one.md'), '# Phase 1 ✅\n\n> **Status:** Done\n')
  write(path.join(a, '02-two.md'), '# Phase 2 ⬜\n\n> **Status:** Not started\n')
  write(path.join(dir, 'specs', 'backlog', 'feat-b', '00-overview.md'), '# B\n\n> **Epic:** epic-x\n> **Waits on:** feat-a\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'a')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/a', worktree)
  fs.mkdirSync(path.join(worktree, 'specs', 'in-progress'), { recursive: true })
  git(worktree, 'mv', 'specs/backlog/feat-a', 'specs/in-progress/feat-a')
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

const row = (out, spec) => out.rows.find((r) => r.spec === spec)

test('epic status: a clean in-flight member is /spec-next, a waiting one is blocked', async () => {
  const { dir, worktree } = scaffold()
  try {
    const out = JSON.parse(await runQuiet(['epic', 'status', 'epic-x', '--json', '--dir', dir]))
    assert.strictEqual(row(out, 'feat-a').next.command, '/spec-next')
    assert.strictEqual(row(out, 'feat-a').next.why, 'phase 2')
    assert.strictEqual(row(out, 'feat-a').tab, path.relative(path.dirname(dir), worktree))
    assert.strictEqual(row(out, 'feat-b').next.verb, 'blocked')
    assert.strictEqual(out.next, null)
  } finally {
    cleanup(dir)
  }
})

test('epic status: an uncommitted tree is building, and an armed gate is a verdict', async () => {
  const { dir, worktree } = scaffold()
  try {
    write(path.join(worktree, 'src.js'), 'x\n')
    let out = JSON.parse(await runQuiet(['epic', 'status', 'epic-x', '--json', '--dir', dir]))
    assert.strictEqual(row(out, 'feat-a').next.verb, 'building')
    assert.strictEqual(row(out, 'feat-a').next.command, null)

    write(path.join(dir, '.spec-env', 'reviews', 'feat-a.gate.json'), JSON.stringify({ version: 1, spec: 'feat-a', armed: true, phase: 2 }))
    out = JSON.parse(await runQuiet(['epic', 'status', 'epic-x', '--json', '--dir', dir]))
    assert.strictEqual(row(out, 'feat-a').next.verb, 'verdict')
  } finally {
    cleanup(dir)
  }
})

test('epic status: the human view is the same answer, as plain text', async () => {
  const { dir } = scaffold()
  try {
    const human = await runQuiet(['epic', 'status', 'epic-x', '--dir', dir])
    assert.match(human, /^ {2}feat-a +phase 2 of 2 +\/spec-next — phase 2 +\S+/m)
    assert.match(human, /^ {2}feat-b +backlog +waits on feat-a +—$/m)
    assert.doesNotMatch(human, /\|/)
  } finally {
    cleanup(dir)
  }
})

test('a bare epic status inside a member worktree means that member\'s epic', async () => {
  const { dir, worktree } = scaffold()
  try {
    const out = JSON.parse(await runQuiet(['epic', 'status', '--json'], worktree))
    assert.strictEqual(out.epic, 'epic-x')
  } finally {
    cleanup(dir)
  }
})

test('a bare epic status outside any worktree names the epics in flight, and picks none', async () => {
  const { dir } = scaffold()
  try {
    const out = JSON.parse(await runQuiet(['epic', 'status', '--json'], dir))
    assert.strictEqual(out.epic, null)
    assert.deepStrictEqual(out.inFlight, ['epic-x'])
    const human = await runQuiet(['epic', 'status'], dir)
    assert.match(human, /in flight here: epic-x/)
  } finally {
    cleanup(dir)
  }
})

test('status carries the same next action beside each in-flight spec', async () => {
  const { dir } = scaffold()
  try {
    const out = JSON.parse(await runQuiet(['status', '--json', '--dir', dir]))
    const a = out.specs.find((s) => s.spec === 'feat-a')
    assert.strictEqual(a.next.command, '/spec-next')
    const human = await runQuiet(['status', '--dir', dir])
    assert.match(human, /next: \/spec-next — phase 2/)
  } finally {
    cleanup(dir)
  }
})
