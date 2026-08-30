'use strict'

/**
 * `dev-unlink` puts a consumer back on the published package.
 *
 * It exists because `dev-link` writes an ABSOLUTE machine-local path into the
 * consumer's package.json, which resolves nowhere else — and, when the link
 * points at a spec worktree, stops resolving here too as soon as
 * `/spec-complete` removes it. Undoing has to be a command.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SCRIPT = path.join(__dirname, 'dev-unlink.js')

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
}

function project(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `skitterspec-${tag}-`))
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"c","version":"1.0.0"}')
  return dir
}

test('with no consumer directory it prints usage and fails', () => {
  const r = run([])
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /usage/)
})

test('a directory with no package.json is refused', () => {
  const r = run([fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-bare-'))])
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /no package\.json/)
})

test('a project that is not linked here is left alone, not reinstalled', () => {
  // Running it twice, or against the wrong project, must not touch dependencies.
  const r = run([project('unlinked')])
  assert.strictEqual(r.status, 0, 'succeeds without doing anything')
  assert.match(r.stdout, /not linked to this repo/)
})

test('it removes before adding — pnpm add alone would silently keep the link', () => {
  // Verified against pnpm: `add <name>` sees the dependency already satisfied by
  // the link, no-ops, and leaves `link:` in package.json while reporting success.
  // That is worse than failing, so the ordering is pinned.
  const src = fs.readFileSync(SCRIPT, 'utf8')
  const remove = src.indexOf("'remove'")
  const add = src.indexOf("['add'")
  assert.ok(remove !== -1 && add !== -1, 'both steps present')
  assert.ok(remove < add, 'remove precedes add')
})

test('dev:link warns that the linked path must not be committed', () => {
  const src = fs.readFileSync(path.join(__dirname, 'dev-link.js'), 'utf8')
  assert.match(src, /Do not commit that/, 'warns at link time')
  assert.match(src, /dev:unlink/, 'names the undo')
})

test('the README documents first-time init and the uncommittable link', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8')
  assert.match(readme, /skitterspec init/, 'the first-time step dev:sync refuses without')
  assert.match(readme, /Never commit the linked `package\.json`/)
  assert.match(readme, /npm run dev:unlink/)
})
