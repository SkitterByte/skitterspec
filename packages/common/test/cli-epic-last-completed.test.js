'use strict'

/**
 * bug-epic-next-after-complete: `/spec-complete` on an epic member lands it,
 * `cd`s to the primary checkout and removes the member's worktree — the one
 * thing a bare `epic status` resolved from. So the bare `/spec-epic-next` it
 * handed off to answered `epic: null` every time. `spec-env down` on a landed
 * member now records its epic, and a bare `epic status` that resolves nothing
 * from where it stands falls back to it, `via: "last-completed-member"`, while
 * that epic still has open members.
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

async function runQuiet(argv, cwd) {
  const orig = process.stdout.write
  const was = process.cwd()
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    process.chdir(cwd)
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
 * `epic-x` with members `feat-a` (in flight in its own worktree) and `feat-b`
 * (waiting on it, or already `bBucket`). `epic-y` with `feat-c` in flight in a
 * worktree of its own, for the cwd-wins case.
 */
function scaffold({ bBucket = 'backlog' } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-epic-last-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  write(path.join(dir, 'specs', '.core', 'env.config.json'), JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }))
  write(path.join(dir, '.gitignore'), '/.spec-env/\n')
  write(path.join(dir, 'specs', 'backlog', 'epic-x', '00-overview.md'), '# X\n\n> **Type:** Epic\n')
  write(path.join(dir, 'specs', 'backlog', 'feat-a', '00-overview.md'), '# A\n\n> **Epic:** epic-x\n> **Waits on:** none\n')
  write(path.join(dir, 'specs', bBucket, 'feat-b', '00-overview.md'), '# B\n\n> **Epic:** epic-x\n> **Waits on:** feat-a\n')
  write(path.join(dir, 'specs', 'backlog', 'epic-y', '00-overview.md'), '# Y\n\n> **Type:** Epic\n')
  write(path.join(dir, 'specs', 'backlog', 'feat-c', '00-overview.md'), '# C\n\n> **Epic:** epic-y\n> **Waits on:** none\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  const start = (slug, folder) => {
    const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
    git(dir, 'worktree', 'add', '-q', '-b', `feat/${slug}`, wt)
    fs.mkdirSync(path.join(wt, 'specs', 'in-progress'), { recursive: true })
    git(wt, 'mv', `specs/backlog/${folder}`, `specs/in-progress/${folder}`)
    git(wt, 'commit', '-q', '-m', `start ${folder}`)
    return wt
  }
  return { dir, a: start('a', 'feat-a'), c: start('c', 'feat-c') }
}

// What /spec-complete does to feat-a: complete it on its branch, fast-forward
// the base onto it, then tear the worktree down from the primary checkout.
async function completeA(dir, a) {
  fs.mkdirSync(path.join(a, 'specs', 'complete'), { recursive: true })
  git(a, 'mv', 'specs/in-progress/feat-a', 'specs/complete/feat-a')
  git(a, 'commit', '-q', '-m', 'complete feat-a')
  git(dir, 'merge', '-q', '--ff-only', 'feat/a')
  const down = await runQuiet(['spec-env', 'down', 'feat-a'], dir)
  assert.match(down, /run these:/, down)
  git(dir, 'worktree', 'remove', '--force', a)
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

test('a member landed and torn down leaves a bare epic status its epic', async () => {
  const { dir, a } = scaffold()
  try {
    await completeA(dir, a)
    const out = JSON.parse(await runQuiet(['epic', 'status', '--json'], dir))
    assert.strictEqual(out.epic, 'epic-x')
    assert.strictEqual(out.via, 'last-completed-member')
    assert.deepStrictEqual(out.ready.map((m) => m.spec), ['feat-b'])
    const human = await runQuiet(['epic', 'status'], dir)
    assert.match(human, /^epic-x — /)
    assert.match(human, /last completed member/)
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: an epic with no open member left is never offered', async () => {
  const { dir, a } = scaffold({ bBucket: 'cancelled' })
  try {
    await completeA(dir, a)
    const out = JSON.parse(await runQuiet(['epic', 'status', '--json'], dir))
    assert.strictEqual(out.epic, null)
    assert.strictEqual(out.via, undefined)
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: an epic since moved to complete is never offered', async () => {
  const { dir, a } = scaffold()
  try {
    await completeA(dir, a)
    fs.mkdirSync(path.join(dir, 'specs', 'complete'), { recursive: true })
    git(dir, 'mv', 'specs/backlog/epic-x', 'specs/complete/epic-x')
    git(dir, 'commit', '-q', '-m', 'complete epic-x')
    const out = JSON.parse(await runQuiet(['epic', 'status', '--json'], dir))
    assert.strictEqual(out.epic, null)
  } finally {
    cleanup(dir)
  }
})

test('standing in another epic\'s worktree, the cwd answer wins over the record', async () => {
  const { dir, a, c } = scaffold()
  try {
    await completeA(dir, a)
    const out = JSON.parse(await runQuiet(['epic', 'status', '--json'], c))
    assert.strictEqual(out.epic, 'epic-y')
    assert.strictEqual(out.via, undefined)
  } finally {
    cleanup(dir)
  }
})

test('a named epic is answered as named, never via the record', async () => {
  const { dir, a } = scaffold()
  try {
    await completeA(dir, a)
    const out = JSON.parse(await runQuiet(['epic', 'status', 'epic-y', '--json'], dir))
    assert.strictEqual(out.epic, 'epic-y')
    assert.strictEqual(out.via, undefined)
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: tearing down an UNLANDED member records nothing', async () => {
  const { dir, a } = scaffold()
  try {
    await runQuiet(['spec-env', 'down', 'feat-a', '--force'], dir)
    git(dir, 'worktree', 'remove', '--force', a)
    const out = JSON.parse(await runQuiet(['epic', 'status', '--json'], dir))
    assert.strictEqual(out.epic, null)
  } finally {
    cleanup(dir)
  }
})
