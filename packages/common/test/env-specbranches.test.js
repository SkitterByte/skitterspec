'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { specBranchDocs, preferBranches, branchLabel } = require('../src/env/specbranches.js')
const { checkGating } = require('../src/gating.js')
const { epicStatus, indexSpecTree } = require('../src/env/epic.js')

// Specs that live only on their own branch (feat-tracker-spec-branches): a real
// repo, because the property is what git can see — refs, ranges, trees.

function sh(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function reader(cwd) {
  return (args) => {
    try {
      return sh(cwd, ...args)
    } catch {
      return null
    }
  }
}

function write(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), text)
}

const CONFIG = { branch: { pattern: '{type}/{slug}' }, land: { remote: 'origin' } }

// main holds one landed spec; feat/new carries a spec written on its branch.
function scaffold() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-sb-')))
  sh(dir, 'init', '-q')
  sh(dir, 'config', 'user.email', 'test@example.com')
  sh(dir, 'config', 'user.name', 'Test')
  write(dir, 'specs/backlog/feat-old/00-overview.md', '# Old\n\n> **Docs:** none: test\n')
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'init')
  sh(dir, 'branch', '-M', 'main')
  sh(dir, 'switch', '-q', '-c', 'feat/new')
  write(dir, 'specs/backlog/feat-new/00-overview.md', '# New\n\n> **Epic:** epic-x\n> **Waits on:** feat-old\n')
  write(dir, 'specs/backlog/feat-new/01-first.md', '# Phase 1 ⬜\n')
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'spec')
  sh(dir, 'switch', '-q', 'main')
  return dir
}

test('a spec that exists only on its branch is found, with its phases', () => {
  const dir = scaffold()
  try {
    const found = specBranchDocs(reader(dir), CONFIG, 'main')
    assert.deepStrictEqual(found.map((f) => [f.folder, f.bucket, f.local]), [['feat-new', 'backlog', true]])
    assert.match(found[0].overview, /# New/)
    assert.deepStrictEqual(found[0].phases.map((p) => p.n), [1])
    assert.strictEqual(branchLabel(found[0]), 'on feat/new')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('only the specs a branch CHANGED are its own — base specs it carries are not', () => {
  const dir = scaffold()
  try {
    const folders = specBranchDocs(reader(dir), CONFIG, 'main').map((f) => f.folder)
    assert.ok(!folders.includes('feat-old'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a local branch beats its remote-tracking copy; remote-only is labelled as of last fetch', () => {
  const dir = scaffold()
  const bare = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-sb-bare-')))
  try {
    execFileSync('git', ['init', '-q', '--bare', bare], { stdio: 'ignore' })
    sh(dir, 'remote', 'add', 'origin', bare)
    sh(dir, 'push', '-q', 'origin', 'main', 'feat/new')
    sh(dir, 'fetch', '-q', 'origin')
    const both = specBranchDocs(reader(dir), CONFIG, 'main')
    assert.strictEqual(both.length, 1)
    assert.strictEqual(both[0].local, true)

    sh(dir, 'branch', '-q', '-D', 'feat/new')
    const remoteOnly = specBranchDocs(reader(dir), CONFIG, 'main')
    assert.strictEqual(remoteOnly[0].local, false)
    assert.strictEqual(branchLabel(remoteOnly[0]), 'on origin/feat/new, as of last fetch')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(bare, { recursive: true, force: true })
  }
})

test('a spec the base branch finished beats a stale branch copy', () => {
  const dir = scaffold()
  try {
    write(dir, 'specs/complete/feat-new/00-overview.md', '# New, done\n')
    sh(dir, 'add', '-A')
    sh(dir, 'commit', '-q', '-m', 'complete')
    assert.deepStrictEqual(specBranchDocs(reader(dir), CONFIG, 'main'), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('stays-silent: a repo with no spec branches, or no git at all, finds nothing', () => {
  const dir = scaffold()
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-sb-nogit-'))
  try {
    sh(dir, 'branch', '-q', '-D', 'feat/new')
    assert.deepStrictEqual(specBranchDocs(reader(dir), CONFIG, 'main'), [])
    assert.deepStrictEqual(specBranchDocs(reader(plain), CONFIG, 'main'), [])
    assert.deepStrictEqual(specBranchDocs(reader(dir), CONFIG, null), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(plain, { recursive: true, force: true })
  }
})

test('stays-silent: a landed branch has no range, so it adds nothing', () => {
  const dir = scaffold()
  try {
    sh(dir, 'merge', '-q', '--ff-only', 'feat/new')
    assert.deepStrictEqual(specBranchDocs(reader(dir), CONFIG, 'main'), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('preferBranches: a branch copy replaces the disk copy and adds the unseen', () => {
  const merged = preferBranches(
    [{ folder: 'a', bucket: 'backlog' }, { folder: 'b', bucket: 'backlog' }],
    [{ folder: 'b', bucket: 'in-progress', ref: 'refs/heads/feat/b' }, { folder: 'c', bucket: 'backlog', ref: 'refs/heads/feat/c' }],
  )
  assert.deepStrictEqual(merged.map((m) => [m.folder, m.bucket]), [['a', 'backlog'], ['b', 'in-progress'], ['c', 'backlog']])
})

test('gating check reports a branch-only spec with no decision, labelled by its branch', () => {
  const dir = scaffold()
  try {
    write(dir, 'specs/.core/gating.config.json', '{}')
    const branches = specBranchDocs(reader(dir), CONFIG, 'main')
    const result = checkGating(dir, null, { branches })
    const row = result.findings.find((f) => f.folder === 'feat-new')
    assert.ok(row, 'the branch-only spec is checked')
    assert.strictEqual(row.kind, 'missing')
    assert.strictEqual(row.from, 'on feat/new')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('epic status sees a branch-only member; its wait is still met only on base', () => {
  const branches = [{
    folder: 'feat-new', bucket: 'backlog', ref: 'refs/heads/feat/new', local: true,
    overview: '# New\n\n> **Epic:** epic-x\n> **Waits on:** feat-dep\n', phases: [],
  }]
  // feat-dep exists only on a branch too: visible, but its wait cannot be met.
  const index = indexSpecTree('specs/backlog/epic-x/00-overview.md')
  const status = epicStatus({ epic: 'epic-x', index, readFile: () => null, branches })
  const m = status.members.find((x) => x.spec === 'feat-new')
  assert.ok(m, 'the member is visible')
  assert.strictEqual(m.bucket, 'backlog')
  assert.notStrictEqual(m.waits[0].state, 'met')
})
