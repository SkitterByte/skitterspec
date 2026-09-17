'use strict'

/**
 * Is this spec live, and does the render read the tree the branch is in?
 *
 * `liveStateFor` answers in FOUR states, and the fourth is the one under test
 * most often here. `on`/`off` are what a reader acts on, `held` is a refusal
 * with a named way out, and `unavailable` is **cannot tell** — routed to
 * silence, because a project with no isolation and a spec with no worktree are
 * both perfectly healthy (`.claude/rules/negative-checks.md` rule 4).
 *
 * The branch checked out in the primary checkout is the authority, not the
 * receipt — so the tests that take the receipt away assert the STATE survives
 * and only the holder's name is lost. Deriving the state from the receipt would
 * report `off` for a checkout plainly sitting on a feature branch, which is the
 * one answer that would let something act.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { liveStateFor, liveStateLine } = require('../src/env/live.js')
const { viewFor, renderSpecPage } = require('../src/env/serve.js')

const SPEC = { folder: 'feat-x', branch: 'feat/x', worktreePath: '/wt/x' }

// --- liveStateFor: the four states ----------------------------------------

test('on — the primary checkout is on this spec\'s branch', () => {
  const live = liveStateFor(SPEC, {
    isolated: true,
    onBase: false,
    primaryBranch: 'feat/x',
    url: 'http://localhost:3000',
  })
  assert.strictEqual(live.state, 'on')
  assert.strictEqual(live.url, 'http://localhost:3000')
  assert.match(liveStateLine(live), /^ {2}live: +on — running at http:\/\/localhost:3000$/)
})

test('on with no canonical port names no URL rather than inventing one', () => {
  const live = liveStateFor(SPEC, { isolated: true, onBase: false, primaryBranch: 'feat/x' })
  assert.strictEqual(live.state, 'on')
  assert.strictEqual(live.url, null)
  assert.strictEqual(liveStateLine(live), '  live:    on')
})

test('off — the workbench is free and the spec has a worktree to take', () => {
  const live = liveStateFor(SPEC, { isolated: true, onBase: true, worktreeExists: true })
  assert.deepStrictEqual(live, { state: 'off', holder: null, url: null, reason: null })
  assert.match(liveStateLine(live), /off — the page can put it live/)
})

test('held — another spec holds it, named, with every way out', () => {
  const live = liveStateFor(SPEC, {
    isolated: true,
    onBase: false,
    primaryBranch: 'feat/auth',
    receipt: { spec: 'feat-auth' },
  })
  assert.strictEqual(live.state, 'held')
  assert.strictEqual(live.holder, 'feat-auth')
  assert.match(live.reason, /feat-auth holds the workbench \(branch feat\/auth\)/)
  assert.match(liveStateLine(live), /^ {2}live: +held — feat-auth holds/)
})

// THE BRANCH IS THE AUTHORITY. A receipt lost, unreadable, or never written
// costs the holder's NAME and never the state — which is why the caller catches
// a receipt read failure and passes null rather than giving up.
test('held with no receipt still reports held, naming the branch instead', () => {
  const live = liveStateFor(SPEC, { isolated: true, onBase: false, primaryBranch: 'feat/auth' })
  assert.strictEqual(live.state, 'held')
  assert.strictEqual(live.holder, null)
  assert.match(live.reason, /the workbench is on feat\/auth — no receipt; switched by hand\?/)
})

test('a detached primary checkout is held, not live and not off', () => {
  const live = liveStateFor(SPEC, { isolated: true, onBase: false, primaryBranch: null })
  assert.strictEqual(live.state, 'held')
  assert.match(live.reason, /\(detached\)/)
})

// --- STAYS SILENT: every cannot-tell prints nothing -----------------------

// Each input below is a HEALTHY repo with no live surface. A warning here is an
// accusation against the common case, so `liveStateLine` answers null and the
// render prints no line at all.
test('STAYS SILENT: no isolation is unavailable, and prints nothing', () => {
  const live = liveStateFor(SPEC, { isolated: false })
  assert.strictEqual(live.state, 'unavailable')
  assert.strictEqual(liveStateLine(live), null)
})

test('STAYS SILENT: a spec with no worktree has nothing to put live', () => {
  const live = liveStateFor(SPEC, { isolated: true, onBase: true, worktreeExists: false })
  assert.strictEqual(live.state, 'unavailable')
  assert.match(live.reason, /no worktree to put live/)
  assert.strictEqual(liveStateLine(live), null)
})

test('STAYS SILENT: a primary checkout that could not be read claims nothing', () => {
  // `onBase` is three-valued deliberately: anything but a definite boolean is a
  // checkout we failed to read, and that is not evidence the spec is off.
  for (const onBase of [null, undefined]) {
    const live = liveStateFor(SPEC, { isolated: true, onBase, worktreeExists: true })
    assert.strictEqual(live.state, 'unavailable', `onBase=${onBase}`)
    assert.strictEqual(liveStateLine(live), null)
  }
})

test('STAYS SILENT: no spec at all, and no line', () => {
  for (const spec of [null, {}, { folder: 'feat-x' }]) {
    const live = liveStateFor(spec, { isolated: true, onBase: true, worktreeExists: true })
    assert.strictEqual(live.state, 'unavailable')
    assert.strictEqual(liveStateLine(live), null)
  }
})

// --- the render reads the tree the branch is actually in ------------------

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-livetree-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { serve: 'never' } }),
  )
  fs.mkdirSync(path.join(dir, 'specs', 'in-progress', 'feat-x'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', 'in-progress', 'feat-x', '00-overview.md'),
    '# X\n\n> **Type:** Feature\n> **Status:** In Progress\n',
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'module.exports = 1\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  return dir
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

const CONFIG = {
  baseBranch: 'main',
  registry: '.spec-env/registry.json',
  worktree: { root: '../{repo}-wt', folderPattern: '{slug}' },
  spec: { companionPaths: [] },
}

test('viewFor takes the worktree while the workbench is free', () => {
  const dir = scaffold()
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  try {
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/x', wt)
    const git0 = (argv) => {
      try {
        return execFileSync('git', ['-C', dir, ...argv], { stdio: ['ignore', 'pipe', 'ignore'] })
      } catch {
        return null
      }
    }
    const view = viewFor(dir, CONFIG, { folder: 'feat-x', branch: 'feat/x', worktreePath: wt }, git0)
    assert.strictEqual(view.kind, 'worktree')
    assert.strictEqual(view.tree, wt)
  } finally {
    cleanup(dir)
  }
})

// THE ONE THAT SHIPPED WRONG WOULD FAIL HERE. While a spec is live its worktree
// still EXISTS — detached — so a worktree-first check wins and reports a clean
// tree, showing the reader nothing. The branch, and the uncommitted fix made
// while live, are both in the primary checkout.
test('viewFor takes the primary checkout while the spec is live', () => {
  const dir = scaffold()
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  try {
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/x', wt)
    git(wt, 'switch', '--detach')
    git(dir, 'checkout', '-q', 'feat/x')
    const git0 = (argv) => {
      try {
        return execFileSync('git', ['-C', dir, ...argv], { stdio: ['ignore', 'pipe', 'ignore'] })
      } catch {
        return null
      }
    }
    const spec = { folder: 'feat-x', branch: 'feat/x', worktreePath: wt }
    assert.ok(fs.existsSync(wt), 'the worktree is still there — that is the trap')
    const view = viewFor(dir, CONFIG, spec, git0)
    assert.strictEqual(view.kind, 'live')
    assert.strictEqual(view.tree, dir)

    // And the page really reads it: an edit made in the primary checkout while
    // live shows up, where a worktree read would report nothing changed.
    fs.writeFileSync(path.join(dir, 'app.js'), 'module.exports = 2\n')
    const page = renderSpecPage(dir, CONFIG, spec)
    assert.ok(page, 'a live spec still gets a page')
    assert.strictEqual(page.totals.files, 1)
  } finally {
    cleanup(dir)
  }
})

// A detached HEAD spells its branch `HEAD` through `rev-parse --abbrev-ref`,
// which is a name no branch has. Returning it verbatim would make a detached
// checkout compare equal to a spec called `HEAD`.
test('STAYS SILENT: a detached primary checkout is not read as a live spec', () => {
  const dir = scaffold()
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  try {
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/x', wt)
    git(dir, 'checkout', '-q', '--detach')
    const git0 = (argv) => {
      try {
        return execFileSync('git', ['-C', dir, ...argv], { stdio: ['ignore', 'pipe', 'ignore'] })
      } catch {
        return null
      }
    }
    const view = viewFor(dir, CONFIG, { folder: 'HEAD', branch: 'HEAD', worktreePath: wt }, git0)
    assert.notStrictEqual(view && view.kind, 'live')
  } finally {
    cleanup(dir)
  }
})
