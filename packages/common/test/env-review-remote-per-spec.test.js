'use strict'

/**
 * `/spec-remote-review` permits publishing for ONE SPEC, not the codebase.
 *
 * bug-remote-review-toggle. Off the network with a review waiting, the operator
 * typed the command the banner named, and three things went wrong:
 *
 * 1. It wrote the COMMITTED `specs/.core/env.config.json` in the primary
 *    checkout, leaving the base branch dirty while they were in a worktree —
 *    and permitting every other spec in the repo to publish too.
 * 2. Nothing re-showed the review it was typed for, so the remote link the
 *    operator was waiting on never appeared.
 *
 * The permission is now a per-spec sidecar in the gitignored review store,
 * layered over the committed default — so what can generate an artifact is
 * decided per worktree, and the base branch is never touched.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function g(dir, ...a) {
  return execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
}

function repoWithSpecs(review = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-remotespec-')))
  g(dir, 'init', '-q')
  g(dir, 'config', 'user.email', 'test@example.com')
  g(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      { baseBranch: 'main', docker: { enabled: false }, review: { serve: 'never', reader: 'local', ...review } },
      null,
      2,
    ) + '\n',
  )
  for (const name of ['feat-alpha', 'feat-beta']) {
    const sd = path.join(dir, 'specs', 'in-progress', name)
    fs.mkdirSync(sd, { recursive: true })
    fs.writeFileSync(path.join(sd, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  }
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  g(dir, 'add', '-A')
  g(dir, 'commit', '-q', '-m', 'init')
  g(dir, 'branch', '-M', 'main')
  for (const slug of ['alpha', 'beta']) {
    const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
    g(dir, 'worktree', 'add', '-q', '-b', `feat/${slug}`, wt)
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\n')
  }
  return dir
}

function drop(dir) {
  try {
    execFileSync('git', ['-C', dir, 'worktree', 'prune'], { stdio: 'ignore' })
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

// A child process, for the reason `env-review-tiers.test.js` records: a render
// awaits, and `node --test` writes its report to the stdout an in-process
// capture would hijack.
function cli(dir, ...args) {
  const script =
    `const { run } = require(${JSON.stringify(path.resolve(__dirname, '../src/cli.js'))});` +
    'run(process.argv.slice(1)).then(() => {}, (e) => { console.error(e); process.exit(1) })'
  return execFileSync('node', ['-e', script, 'spec-env', ...args, '--dir', dir], { encoding: 'utf-8' })
}

const remoteTier = (dir, spec) =>
  JSON.parse(cli(dir, 'review', spec, '--json')).tiers.find((t) => t.tier === 'remote')

test('allow remote for a spec leaves the committed config and the base branch alone', () => {
  const dir = repoWithSpecs()
  try {
    const before = fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8')
    cli(dir, 'review', 'allow', 'remote', 'feat-alpha', '--set', 'on')
    assert.strictEqual(fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'), before)
    assert.strictEqual(g(dir, 'status', '--porcelain'), '', 'the primary checkout stays clean')
  } finally {
    drop(dir)
  }
})

test('the permission applies to that spec and no other', () => {
  const dir = repoWithSpecs()
  try {
    cli(dir, 'review', 'allow', 'remote', 'feat-alpha', '--set', 'on')
    assert.ok(!remoteTier(dir, 'feat-alpha').off, 'alpha may publish')
    assert.strictEqual(remoteTier(dir, 'feat-beta').off, true, 'beta still may not')
  } finally {
    drop(dir)
  }
})

test('a bare toggle reads the spec it is for, and flips back', () => {
  const dir = repoWithSpecs()
  try {
    assert.match(cli(dir, 'review', 'allow', 'remote', 'feat-alpha', '--set', ''), /now ON/)
    assert.match(cli(dir, 'review', 'allow', 'remote', 'feat-alpha', '--set', ''), /now OFF/)
    assert.strictEqual(remoteTier(dir, 'feat-alpha').off, true)
  } finally {
    drop(dir)
  }
})

// The review the command was typed for is named, so the run publishes it and
// re-shows the stack rather than leaving the operator without their link.
test('turning remote on beside a rendered review names it for publishing', () => {
  const dir = repoWithSpecs()
  try {
    cli(dir, 'review', 'feat-alpha')
    const out = cli(dir, 'review', 'allow', 'remote', 'feat-alpha', '--set', 'on')
    assert.match(out, /^ {2}review: {3}feat-alpha has a page — publish it and re-show the stack$/m)
    assert.match(out, /^ {2}publish: {2}skitterspec spec-env review feat-alpha --publish-copy$/m)
  } finally {
    drop(dir)
  }
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3): no page, nothing
// to publish — and turning it OFF is never a publish either.
test('STAYS SILENT: no page, or turning it off, names nothing to publish', () => {
  const dir = repoWithSpecs()
  try {
    const on = cli(dir, 'review', 'allow', 'remote', 'feat-alpha', '--set', 'on')
    assert.doesNotMatch(on, /publish:/)
    cli(dir, 'review', 'feat-alpha')
    const off = cli(dir, 'review', 'allow', 'remote', 'feat-alpha', '--set', 'off')
    assert.doesNotMatch(off, /publish:/)
  } finally {
    drop(dir)
  }
})

// STAYS SILENT: a project that permits remote for everyone in its committed
// config still does — the sidecar narrows nothing it did not set.
test('STAYS SILENT: the committed project default still applies to every spec', () => {
  const dir = repoWithSpecs({ allowRemote: true })
  try {
    assert.ok(!remoteTier(dir, 'feat-alpha').off)
    assert.ok(!remoteTier(dir, 'feat-beta').off)
  } finally {
    drop(dir)
  }
})

// Cannot tell which spec → refuse and write nothing, rather than fall back to
// the project-wide write this bug was about.
test('with no spec it can resolve, it refuses and changes nothing', () => {
  const dir = repoWithSpecs()
  try {
    const before = fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8')
    let out = ''
    try {
      cli(dir, 'review', 'allow', 'remote', '--set', 'on')
    } catch (err) {
      out = err.stdout
    }
    assert.match(out, /remote is permitted per spec — name it, or run this from its worktree/)
    assert.match(out, /Nothing changed/)
    assert.strictEqual(fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'), before)
    assert.strictEqual(remoteTier(dir, 'feat-alpha').off, true)
  } finally {
    drop(dir)
  }
})
