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
