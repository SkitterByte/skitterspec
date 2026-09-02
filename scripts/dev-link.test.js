'use strict'

/**
 * `dev-link` exists for one reason: ORDER.
 *
 * pnpm does not run `prepare` for a `link:` dependency, and a distribution's
 * bin/src/assets are composed rather than committed — so linking an unbuilt
 * package creates no bin shim at all and the consumer sees only "command not
 * found". Building before linking is what makes the link work, so the tests
 * guard the refusals that keep a caller from getting a silently useless link.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SCRIPT = path.join(__dirname, 'dev-link.js')
const { primaryCheckout, installFlags } = require('./dev-link.js')

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
}

function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `skitterspec-${tag}-`))
}

test('with no consumer directory it prints usage and fails', () => {
  const r = run([])
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /usage/)
  assert.match(r.stderr, /skitterspec-linear/, 'names the distributions it can link')
})

test('a directory with no package.json is refused', () => {
  // Linking into the wrong directory would otherwise "succeed" and leave the
  // caller wondering why their change never showed up.
  const r = run([tmpDir('notaproject')])
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /no package\.json/)
})

test('an unknown distribution is refused, and the valid ones are named', () => {
  const dir = tmpDir('consumer')
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"c","version":"1.0.0"}')
  const r = run([dir, 'skitterspec-jira'])
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /unknown distribution/)
  assert.match(r.stderr, /skitterspec, skitterspec-linear/)
})

test('the script builds before it links — the ordering the whole thing is for', () => {
  // Asserted on the source rather than by running pnpm: the build call must come
  // before the link call, and a refactor that reorders them would produce a link
  // that yields no binary at all.
  const src = fs.readFileSync(SCRIPT, 'utf8')
  const build = src.indexOf('build-dist.js')
  const link = src.indexOf("'pnpm', ['add'")
  assert.ok(build !== -1 && link !== -1, 'both steps are present')
  assert.ok(build < link, 'build precedes link')
})

// A spec worktree is removed by /spec-complete when the spec lands, so a link
// into one dangles at exactly the moment the work became available. Detection is
// the `.git` FILE a linked worktree carries (`gitdir: <primary>/.git/worktrees/…`)
// where a primary checkout has a `.git` directory.
//
// Fixture-driven on purpose: asserting against the repo the suite happens to be
// running in would invert every time the work moved between worktree and main.
test('a linked worktree is detected, and names its primary checkout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-wt-'))
  fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /Users/me/code/proj/.git/worktrees/thing\n')
  assert.strictEqual(primaryCheckout(dir), '/Users/me/code/proj')
})

test('a primary checkout is not mistaken for a worktree', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-primary-'))
  fs.mkdirSync(path.join(dir, '.git'))
  assert.strictEqual(primaryCheckout(dir), null, 'a .git directory is the primary')
})

test('a non-git directory, or a .git file of another shape, is left alone', () => {
  // The guard must never refuse something it does not understand — that would
  // block linking from a perfectly ordinary checkout.
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-nogit-'))
  assert.strictEqual(primaryCheckout(plain), null)

  const odd = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-oddgit-'))
  fs.writeFileSync(path.join(odd, '.git'), 'gitdir: /somewhere/else\n')
  assert.strictEqual(primaryCheckout(odd), null, 'no /.git/worktrees/ segment')
})

test('the refusal names the worktree, the reason, and the primary to use', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8')
  assert.match(src, /refusing to link from a spec worktree/)
  assert.match(src, /would dangle/, 'says why')
  assert.match(src, /link from the primary checkout instead/, 'says what to do')
})

// A consumer is not always a plain single-package project. Two shapes make a
// bare `pnpm add` either fail outright or succeed while rewriting the project:
// a pnpm workspace ROOT, and a distribution kept in devDependencies.
test('a pnpm workspace root gets -w — pnpm refuses to add to it without one', () => {
  const dir = tmpDir('workspace')
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"c","version":"1.0.0"}')
  fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n")
  assert.deepStrictEqual(installFlags(dir, 'skitterspec-linear'), ['-w'])
})

test('a dist already in devDependencies gets -D, so the link does not move it', () => {
  // Without -D, pnpm writes the link into `dependencies` and leaves the old
  // devDependencies entry behind — the link works and the consumer's dependency
  // shape changes underneath it.
  const dir = tmpDir('devdep')
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{"name":"c","devDependencies":{"@skitterbyte/skitterspec-linear":"10.0.1"}}',
  )
  assert.deepStrictEqual(installFlags(dir, 'skitterspec-linear'), ['-D'])
})

test('an ordinary consumer gets no extra flags', () => {
  const dir = tmpDir('plain')
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{"name":"c","dependencies":{"@skitterbyte/skitterspec-linear":"10.0.1"}}',
  )
  assert.deepStrictEqual(installFlags(dir, 'skitterspec-linear'), [])
})

test('the flags are per-distribution — a different dist in devDeps is not ours', () => {
  const dir = tmpDir('otherdist')
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{"name":"c","devDependencies":{"@skitterbyte/skitterspec-linear":"10.0.1"}}',
  )
  assert.deepStrictEqual(installFlags(dir, 'skitterspec'), [])
})

test('an unreadable manifest still yields the workspace flag, and does not throw', () => {
  // pnpm reports a broken package.json far better than we can; the helper must
  // not turn it into a stack trace from here.
  const dir = tmpDir('brokenjson')
  fs.writeFileSync(path.join(dir, 'package.json'), '{ not json')
  fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'packages: []\n')
  assert.deepStrictEqual(installFlags(dir, 'skitterspec-linear'), ['-w'])
})
