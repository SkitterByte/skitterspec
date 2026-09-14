'use strict'

/**
 * Does the running review server know the engine moved under it?
 *
 * This exists because of an incident, not a hypothesis. A server started before
 * a feature landed went on rendering pre-feature pages for a whole session, and
 * every other check said it was healthy: the process was alive, the settings
 * were readable, the script was on disk, and each render was genuinely current —
 * the file counts moved, `generatedAt` moved, the diff was right. Only the
 * RENDERER was old, which is exactly the thing nothing was looking at.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { engineVersionFor, staleServer } = require('../src/env/serve.js')
const { collectReview } = require('../src/env/review.js')

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-engine-')))
}

// --- staleServer: three outcomes, and the third is the point ----------------

test('a matching version is current, a different one is stale', () => {
  assert.strictEqual(staleServer('9.2.0', '9.2.0'), 'current')
  assert.strictEqual(staleServer('9.2.0', '9.3.1'), 'stale')
  // Direction does not matter: a server running something NEWER than this CLI
  // is equally not the engine this one would start.
  assert.strictEqual(staleServer('9.3.1', '9.2.0'), 'stale')
})

// STAYS SILENT (`negative-checks.md` rule 3). Every one of these is a healthy
// server the check must not accuse. A server started before this shipped has no
// recorded version at all, and reading that absence as "different, therefore
// stale" would restart every running server on the first render after upgrading.
test('stays silent: every unanswerable case is unknown, never stale', () => {
  for (const [recorded, running, why] of [
    [undefined, '9.2.0', 'a server from before this was recorded'],
    [null, '9.2.0', 'an explicit null in the settings file'],
    ['', '9.2.0', 'an empty string is not a version'],
    ['9.2.0', null, 'this engine could not read its own package'],
    ['9.2.0', undefined, 'the same, spelled differently'],
    [3, '9.2.0', 'a version that is not a string'],
    ['9.2.0', 3, 'the same, on the other side'],
  ]) {
    assert.strictEqual(staleServer(recorded, running), 'unknown', why)
  }
})

// --- engineVersionFor: resolve from the SCRIPT, not from the caller ---------

test('the version comes from the package that owns the script', () => {
  const dir = tmp()
  fs.mkdirSync(path.join(dir, 'src', 'env'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '4.5.6' }))
  const script = path.join(dir, 'src', 'env', 'serve.js')
  fs.writeFileSync(script, '')
  assert.strictEqual(engineVersionFor(script), '4.5.6')
  fs.rmSync(dir, { recursive: true, force: true })
})

// THE TRAP THIS AVOIDS. The CLI and the daemon are routinely different packages
// — a superset distribution exposes the `skitterspec` binary from its own
// package while the daemon is resolved out of `node_modules/@skitterbyte/
// skitterspec`. Comparing one package's version against the other's reports a
// mismatch that is never true and never goes away, and wired to a restart that
// is a server replaced on every single render.
test('two packages in one tree each answer for their own script', () => {
  const dir = tmp()
  const daemon = path.join(dir, 'node_modules', '@skitterbyte', 'skitterspec')
  fs.mkdirSync(path.join(daemon, 'src', 'env'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'cli', version: '1.0.0' }))
  fs.writeFileSync(path.join(daemon, 'package.json'), JSON.stringify({ name: 'base', version: '9.2.0' }))
  const script = path.join(daemon, 'src', 'env', 'serve.js')
  fs.writeFileSync(script, '')

  assert.strictEqual(engineVersionFor(script), '9.2.0', 'the daemon answers for itself')
  // And the comparison that matters is that script's version across time — which
  // is `current`, where CLI-vs-daemon would have said `stale` forever.
  assert.strictEqual(staleServer('9.2.0', engineVersionFor(script)), 'current')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('stays silent: an unreadable or version-less package answers null', () => {
  const dir = tmp()
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  const script = path.join(dir, 'src', 'serve.js')
  fs.writeFileSync(script, '')

  // No package.json anywhere up the tree that has a version.
  assert.strictEqual(engineVersionFor(script), null, 'nothing to read')

  fs.writeFileSync(path.join(dir, 'package.json'), '{ not json')
  assert.strictEqual(engineVersionFor(script), null, 'unreadable')

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }))
  assert.strictEqual(engineVersionFor(script), null, 'no version field')

  // And each of those routes to inaction rather than to an accusation.
  assert.strictEqual(staleServer('9.2.0', engineVersionFor(script)), 'unknown')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('no path at all is answered, not thrown', () => {
  for (const v of [null, undefined, '']) assert.strictEqual(engineVersionFor(v), null)
})

// --- the page says which engine drew it -------------------------------------

test('the render carries the engine version into the page data', () => {
  const version = require('../package.json').version
  const data = collectReview({
    spec: { folder: 'feat-x', branch: 'feat/x', worktreePath: '/nowhere' },
    // No files: this test is about the field, and a git reader that answers
    // nothing keeps it that way.
    git: () => '',
    mode: 'working',
    ref: 'HEAD',
    now: '2020-01-01T00:00:00.000Z',
  })
  assert.strictEqual(data.engine, version, 'the engine that drew it is the one reporting')
})

test('the template renders the line, and only when there is a version', () => {
  const template = require('../src/env/review.js').loadTemplate()
  assert.match(template, /id="drawn-by"/, 'the page has somewhere to say it')
  assert.match(template, /rendered by skitterspec/, 'and says it in words a reader can act on')
  // Guarded, so a render that could not read its own version says nothing rather
  // than printing "undefined" at the foot of every page.
  assert.match(template, /if \(data\.engine\)/)
})
