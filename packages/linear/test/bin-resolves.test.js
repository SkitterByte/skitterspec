'use strict'

/**
 * The published bin must actually LOAD.
 *
 * Every other test in this package imports `../src/*.js` directly, so none of
 * them ever executes `bin/skitterspec-linear.js` — and the bin is the only file
 * that requires this package by its own name
 * (`@skitterbyte/skitterspec-provider-linear/src/…`). It has to: `build-dist.js`
 * vendors this package's `src` to `src/vendor/linear/` in the distribution and
 * rewrites those bare specifiers to match, so a relative require here would
 * survive the rewrite and then point at nothing in the dist.
 *
 * The cost is that the bin only resolves when the workspace is linked into a
 * `node_modules/@skitterbyte/` on the lookup path — which the root
 * `devDependencies` `workspace:*` entry provides. A fresh git worktree once
 * installed cleanly, passed the whole suite, and still could not run the CLI at
 * all. Spawning the real bin is the only thing that catches that.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BIN = path.join(__dirname, '..', 'bin', 'skitterspec-linear.js')

function runBin(argv, cwd) {
  return spawnSync(process.execPath, [BIN, ...argv], { cwd, encoding: 'utf-8' })
}

test('the bin resolves its own package and runs', () => {
  // A bare directory: no linear.config.json, so `spec-sync` takes the opt-in
  // path and exits 0. Any module-resolution failure shows up as a non-zero exit
  // with MODULE_NOT_FOUND on stderr, long before that path is reached.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-bin-'))
  const r = runBin(['spec-sync', 'linked'], dir)

  assert.ok(
    !/MODULE_NOT_FOUND|Cannot find module/.test(r.stderr || ''),
    `bin failed to resolve its requires:\n${r.stderr}`,
  )
  assert.strictEqual(r.status, 0, `bin exited ${r.status}:\n${r.stderr}`)
  assert.match(r.stdout, /Linear sync not enabled/, 'reached the opt-in path')
})

test('the root workspace link the bin depends on is declared', () => {
  // Belt and braces: if someone drops the devDependency, the spawn test above
  // fails with an opaque MODULE_NOT_FOUND. This says why.
  const root = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf-8'),
  )
  const self = require('../package.json').name
  assert.strictEqual(
    (root.devDependencies || {})[self],
    'workspace:*',
    `root package.json must link ${self} so bin/ can require itself by name`,
  )
})

test('the bin propagates a non-zero exit code from spec-sync', () => {
  // The bin used to `await specSync(rest)` and drop the result, so a refused
  // write and a bad workspace state both looked like success to anything
  // checking $? — including /spec-push, which is told to stop when
  // `status --workspace-states` errors. Only spawning the bin catches it;
  // the unit tests assert the returned code, which was never read.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-exit-'))
  const cfg = path.join(dir, 'specs', '.core', 'linear.config.json')
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')
  const folder = path.join(dir, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, '00-overview.md'), '# X\n', 'utf-8')
  fs.writeFileSync(path.join(folder, '01-a.md'), '# Phase 1 — A ⬜\n\n**Goal:** a.\n', 'utf-8')

  const refused = runBin(['spec-sync', 'stamp', 'feat-x', '--sub', '09-nope=SKI-2'], dir)
  assert.strictEqual(refused.status, 1, 'a refused stamp exits 1')

  const ok = runBin(['spec-sync', 'stamp', 'feat-x', '--sub', '01-a=SKI-2'], dir)
  assert.strictEqual(ok.status, 0, 'a successful stamp exits 0')

  const states = path.join(dir, 'ws.json')
  fs.writeFileSync(states, JSON.stringify(['Backlog']), 'utf-8')
  const bad = runBin(['spec-sync', 'status', 'feat-x', '--workspace-states', states], dir)
  assert.strictEqual(bad.status, 1, 'an unknown configured state exits 1')
})

