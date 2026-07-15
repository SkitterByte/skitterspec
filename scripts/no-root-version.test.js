'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const rootPkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
)

// --- root package.json hygiene ----------------------------------------------

test('root package.json drops the single-package-era release scripts', () => {
  const removed = [
    'version',
    'changelog',
    'releases',
    'changelog:retro',
    'releases:retro',
  ]
  for (const name of removed) {
    assert.ok(
      !(name in rootPkg.scripts),
      `stale script "${name}" should be removed from the root`,
    )
  }
})

test('root package.json keeps build/test and adds release + preversion guard', () => {
  assert.strictEqual(rootPkg.scripts.build, 'node scripts/build-dist.js all')
  assert.strictEqual(rootPkg.scripts.test, 'node --test')
  assert.strictEqual(rootPkg.scripts.release, 'node scripts/release.js')
  assert.strictEqual(rootPkg.scripts.preversion, 'node scripts/no-root-version.js')
})

// --- the guard itself -------------------------------------------------------

test('no-root-version guard exits non-zero and explains itself', () => {
  const res = spawnSync('node', ['scripts/no-root-version.js'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.notStrictEqual(res.status, 0, 'guard must exit non-zero')
  assert.match(res.stderr, /Refusing 'npm version' at the monorepo root/)
  assert.match(res.stderr, /scripts\/release\.js/)
})

// --- release-doc discoverability --------------------------------------------

test('a root README exists and points operators at RELEASING.md', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  assert.match(readme, /RELEASING\.md/, 'root README must link to RELEASING.md')
  assert.match(readme, /Releasing/, 'root README must have a Releasing section')
})
