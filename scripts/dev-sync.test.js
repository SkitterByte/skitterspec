'use strict'

/**
 * `dev-sync` rebuilds here and runs the consumer's `skitterspec update` there.
 *
 * Both halves are the point: a `link:` dependency makes the CLI live, but `init`
 * COPIES skills into the consumer, so an edited SKILL.md reaches it only when
 * `update` re-copies. The refusals below all guard the same failure — a command
 * that succeeds while changing nothing, which is indistinguishable from a change
 * that had no effect.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SCRIPT = path.join(__dirname, 'dev-sync.js')

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
}

function project(tag, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `skitterspec-${tag}-`))
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"c","version":"1.0.0"}')
  for (const rel of Object.keys(files)) fs.mkdirSync(path.join(dir, rel), { recursive: true })
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

test('a project not linked back to this repo is refused, not silently synced', () => {
  // The worst outcome this script can produce: rebuild here, update a consumer
  // that is on the PUBLISHED package, and report success having changed nothing.
  const r = run([project('unlinked')])
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /does not link back to this repo/)
  assert.match(r.stderr, /dev:link/, 'names the fix')
})

test('the link check resolves real paths, so it cannot be fooled by a name', () => {
  // A directory that merely CONTAINS node_modules/@skitterbyte/<dist> is not a
  // link to this repo — resolving it is what distinguishes them.
  const dir = project('lookalike')
  fs.mkdirSync(path.join(dir, 'node_modules', '@skitterbyte', 'skitterspec-linear'), {
    recursive: true,
  })
  const r = run([dir])
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /does not link back to this repo/)
})

test('the README documents the loop and both of its footguns', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8')
  assert.match(readme, /npm run dev:link/, 'the link step')
  assert.match(readme, /npm run dev:sync/, 'the refresh step')
  assert.match(readme, /does \*\*not\*\*\s*\n?\s*run `prepare`/, 'why a build must precede the link')
  assert.match(readme, /skills are copies/i, 'why the CLI updates but skills do not')
  assert.match(readme, /needs no `--force`/, 'and that forcing would clobber customisations')
})
