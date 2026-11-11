'use strict'

/**
 * `skitterspec epic status --here` (spec feat-epic-migration, phase 1): members
 * and headers read off the working tree the command runs in, uncommitted edits
 * included, while a wait is still met only on the base branch — so a plan
 * converted to an epic can be checked before the conversion lands.
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


// A conversion, uncommitted in the primary checkout: epic-y written, and feat-b
// moved from epic-x to epic-y with feat-a still its wait.
function convert(dir) {
  write(path.join(dir, 'specs', 'backlog', 'epic-y', '00-overview.md'), '# Y\n\n> **Type:** Epic\n> **Lanes:** 1\n')
  write(path.join(dir, 'specs', 'backlog', 'feat-b', '00-overview.md'), '# B\n\n> **Epic:** epic-y\n> **Waits on:** feat-a\n')
}

test('--here sees an uncommitted conversion that a bare run cannot', async () => {
  const { dir } = scaffold()
  try {
    convert(dir)
    const bare = JSON.parse(await runQuiet(['epic', 'status', 'epic-y', '--json'], dir))
    assert.strictEqual(bare.members.length, 0)
    const here = JSON.parse(await runQuiet(['epic', 'status', 'epic-y', '--here', '--json'], dir))
    assert.deepStrictEqual(here.members.map((m) => m.spec), ['feat-b'])
    assert.strictEqual(here.lanes, 1)
    assert.ok(here.here, 'and it says where the headers came from')
    const human = await runQuiet(['epic', 'status', 'epic-y', '--here'], dir)
    assert.match(human, /^epic-y — 1 member · 1 lanes, 1 free · headers from /)
  } finally {
    cleanup(dir)
  }
})

test('--here still meets a wait only on the base branch', async () => {
  const { dir } = scaffold()
  try {
    convert(dir)
    // feat-a "complete" in this tree only — not landed, so not met.
    fs.mkdirSync(path.join(dir, 'specs', 'complete'), { recursive: true })
    fs.renameSync(path.join(dir, 'specs', 'backlog', 'feat-a'), path.join(dir, 'specs', 'complete', 'feat-a'))
    const out = JSON.parse(await runQuiet(['epic', 'status', 'epic-y', '--here', '--json'], dir))
    const b = out.members.find((m) => m.spec === 'feat-b')
    assert.strictEqual(b.waits[0].state, 'unmet')
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: --here on a clean base checkout answers as a bare run does', async () => {
  const { dir } = scaffold()
  try {
    const strip = (o) => ({ ...o, here: undefined, page: undefined })
    const bare = JSON.parse(await runQuiet(['epic', 'status', 'epic-x', '--json'], dir))
    const here = JSON.parse(await runQuiet(['epic', 'status', 'epic-x', '--here', '--json'], dir))
    assert.deepStrictEqual(strip(here).rows, strip(bare).rows)
    assert.deepStrictEqual(here.waves, bare.waves)
  } finally {
    cleanup(dir)
  }
})
