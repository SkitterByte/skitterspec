'use strict'

// `fixture()` (chore-fast-windows-suite): build once, copy per test. The copy
// must behave like a repo built from scratch, worktrees included, and no two
// copies may share anything.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { fixture, git } = require('./helpers/repo.js')

const wtOf = (root) => path.resolve(root, `../${path.basename(root)}-wt`)
const rm = (root) => {
  for (const tree of [root, wtOf(root)]) fs.rmSync(tree, { recursive: true, force: true })
}

let builds = 0
const withWorktree = fixture('skitterspec-fixture-', (root, body) => {
  builds += 1
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  fs.writeFileSync(path.join(root, 'a.txt'), body)
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'init')
  git(root, 'worktree', 'add', '-q', '-b', 'feat/x', path.join(wtOf(root), 'x'))
})

test('each distinct argument set is built once, and every call is a fresh copy', () => {
  const before = builds
  const a = withWorktree('one\n')
  const b = withWorktree('one\n')
  const c = withWorktree('two\n')
  try {
    assert.strictEqual(builds - before, 2, 'one build for "one", one for "two"')
    assert.notStrictEqual(a, b)
    assert.strictEqual(fs.readFileSync(path.join(c, 'a.txt'), 'utf8'), 'two\n')
  } finally {
    for (const r of [a, b, c]) rm(r)
  }
})

test('a copy is its own repo: a commit in one is invisible in another', () => {
  const a = withWorktree('one\n')
  const b = withWorktree('one\n')
  try {
    fs.writeFileSync(path.join(a, 'b.txt'), 'x')
    git(a, 'add', '-A')
    git(a, 'commit', '-q', '-m', 'more')
    assert.strictEqual(git(a, 'rev-list', '--count', 'HEAD'), '2')
    assert.strictEqual(git(b, 'rev-list', '--count', 'HEAD'), '1')
  } finally {
    for (const r of [a, b]) rm(r)
  }
})

test('the copy\'s worktree belongs to the copy, not the template', () => {
  const a = withWorktree('one\n')
  try {
    const wt = path.join(wtOf(a), 'x')
    assert.strictEqual(git(wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feat/x')
    const listed = git(a, 'worktree', 'list', '--porcelain')
      .split('\n')
      .filter((l) => l.startsWith('worktree '))
      .map((l) => fs.realpathSync.native(l.slice('worktree '.length)))
    assert.deepStrictEqual(listed, [a, fs.realpathSync.native(wt)])
    // A commit in the copy's worktree lands on the copy's branch.
    fs.writeFileSync(path.join(wt, 'w.txt'), 'w')
    git(wt, 'add', '-A')
    git(wt, 'commit', '-q', '-m', 'wt')
    assert.strictEqual(git(a, 'rev-list', '--count', 'feat/x'), '2')
  } finally {
    rm(a)
  }
})

// STAYS SILENT: a fixture with no worktree copies without looking for one.
test('a fixture with no worktree folder copies the repo alone', () => {
  const plain = fixture('skitterspec-fixture-plain-', (root) => {
    git(root, 'init', '-q', '-b', 'main')
  })
  const a = plain()
  try {
    assert.ok(fs.existsSync(path.join(a, '.git')))
    assert.ok(!fs.existsSync(wtOf(a)))
  } finally {
    rm(a)
  }
})

test('a remote built beside the repo, under root, is re-pointed at the copy', () => {
  const withRemote = fixture('skitterspec-fixture-remote-', (root) => {
    const dir = path.join(root, 'repo')
    fs.mkdirSync(dir)
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'config', 'user.email', 'test@example.com')
    git(dir, 'config', 'user.name', 'Test')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'init')
    git(root, 'init', '-q', '--bare', path.join(root, 'remote.git'))
    git(dir, 'remote', 'add', 'origin', path.join(root, 'remote.git'))
  })
  const a = withRemote()
  const b = withRemote()
  try {
    git(path.join(a, 'repo'), 'push', '-q', 'origin', 'main')
    assert.strictEqual(git(path.join(a, 'remote.git'), 'rev-parse', 'main').length, 40, 'the push landed in the copy\'s own remote')
    assert.throws(() => git(path.join(b, 'remote.git'), 'rev-parse', '--verify', 'main'), 'and not in another copy\'s')
  } finally {
    for (const r of [a, b]) rm(r)
  }
})

// A detached `gc --auto` left running by the build repacked `.git/objects`
// while the copy read it, and the copy failed ENOENT on CI. The build runs with
// git's housekeeping off; the test process's own environment is left as found.
test('a build runs with git housekeeping off, and the environment is restored', () => {
  const before = process.env.GIT_CONFIG_COUNT
  let seen
  const probe = fixture('skitterspec-fixture-gc-', (root) => {
    git(root, 'init', '-q', '-b', 'main')
    seen = {
      gc: git(root, 'config', '--get', 'gc.auto'),
      maintenance: git(root, 'config', '--get', 'maintenance.auto'),
    }
  })
  const root = probe()
  try {
    assert.deepStrictEqual(seen, { gc: '0', maintenance: 'false' })
    assert.strictEqual(process.env.GIT_CONFIG_COUNT, before)
  } finally {
    rm(root)
  }
})
