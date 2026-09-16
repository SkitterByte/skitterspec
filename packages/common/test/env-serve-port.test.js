'use strict'

/**
 * `review.servePort` — a port per repo, stable across restarts.
 *
 * The claim under test is not "every repo gets a different port". It is that a
 * given tree gets THE SAME port every time, because that is what lets a link
 * handed out yesterday still resolve. So most of what follows asserts
 * stability — across calls, across spellings of one path, across the absence of
 * any state on disk — and only one test looks at spread.
 *
 * The last three are stays-silent tests (`.claude/rules/negative-checks.md`
 * rule 3): a repo that pins a number, a repo with no config at all, and a path
 * that does not exist all have to behave exactly as they did, with nothing said
 * about any of them.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  loadEnvConfig,
  resolveServePort,
  derivedServePort,
  servePortRoot,
  servePortReason,
  DEFAULT_CONFIG,
  CONFIG_FILE,
  PORT_BASE,
  PORT_SPAN,
} = require('../src/env/config.js')

function tmpDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-serveport-')))
}

function writeEnvConfig(dir, obj) {
  const file = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj), 'utf-8')
}

test('the default is "auto", not a number every repo shares', () => {
  assert.strictEqual(DEFAULT_CONFIG.review.servePort, 'auto')
  const dir = tmpDir()
  assert.strictEqual(loadEnvConfig(dir).config.review.servePort, 'auto')
})

test('"auto" is accepted by name, and a number pins the port', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { review: { servePort: 'auto' } })
  assert.strictEqual(loadEnvConfig(dir).config.review.servePort, 'auto')

  writeEnvConfig(dir, { review: { servePort: 7777 } })
  assert.strictEqual(loadEnvConfig(dir).config.review.servePort, 7777)
})

test('an unknown string is refused by name — the default stands', () => {
  const dir = tmpDir()
  for (const bad of ['atuo', 'AUTO', 'auto ', 'derive', '7777', true, null, {}, []]) {
    writeEnvConfig(dir, { review: { servePort: bad } })
    assert.strictEqual(
      loadEnvConfig(dir).config.review.servePort,
      'auto',
      `${JSON.stringify(bad)} should not have been taken`,
    )
  }
})

test('a non-finite number is refused too', () => {
  const dir = tmpDir()
  // JSON has no Infinity/NaN literal, so the only way in is a string that looks
  // numeric — which is exactly what the string branch must not accept.
  writeEnvConfig(dir, { review: { servePort: 'Infinity' } })
  assert.strictEqual(loadEnvConfig(dir).config.review.servePort, 'auto')
})

test('the same path derives the same port across calls', () => {
  const dir = tmpDir()
  const first = derivedServePort(dir)
  for (let i = 0; i < 5; i += 1) assert.strictEqual(derivedServePort(dir), first)
})

test('the derived port lands inside the declared window', () => {
  for (const p of ['/a', '/b/c', os.tmpdir(), process.cwd(), tmpDir()]) {
    const port = derivedServePort(p)
    assert.ok(port >= PORT_BASE && port < PORT_BASE + PORT_SPAN, `${p} → ${port}`)
    assert.strictEqual(Number.isInteger(port), true)
  }
})

test('the derivation reads nothing on disk — a deleted repo hashes the same', () => {
  // This is the property that makes a link survive a restart, a reboot and a
  // `--stop`: the port is a function of the PATH, never of any file beside it.
  const dir = tmpDir()
  writeEnvConfig(dir, { review: { servePort: 'auto' } })
  fs.mkdirSync(path.join(dir, '.spec-env'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.spec-env', 'registry.json'), '{"specs":{}}', 'utf-8')
  const withState = derivedServePort(dir)

  fs.rmSync(path.join(dir, '.spec-env'), { recursive: true, force: true })
  fs.rmSync(path.join(dir, 'specs'), { recursive: true, force: true })
  assert.strictEqual(derivedServePort(dir), withState)
})

test('different paths do not all collide', () => {
  // Not a claim that collisions cannot happen — a hundred slots guarantees
  // some, and the server refuses one when it comes. This asserts the
  // derivation SPREADS, because clustering is the only way it fails at its job.
  const paths = Array.from({ length: 60 }, (_, i) => `/Users/dev/code/project-${i}`)
  const distinct = new Set(paths.map((p) => derivedServePort(p)))
  assert.ok(distinct.size > 30, `only ${distinct.size} distinct ports from ${paths.length} paths`)
})

test('a symlinked spelling resolves to the same port as its target', (t) => {
  const real = tmpDir()
  const link = path.join(tmpDir(), 'link-to-repo')
  try {
    fs.symlinkSync(real, link, 'dir')
  } catch {
    // Symlink creation is not available everywhere (Windows without developer
    // mode). Skipping is the honest answer — a failure here would accuse the
    // derivation of something the platform did.
    t.skip('symlinks unavailable on this platform')
    return
  }
  assert.strictEqual(servePortRoot(link), real)
  assert.strictEqual(derivedServePort(servePortRoot(link)), derivedServePort(real))
})

test('a trailing slash and a relative spelling resolve to one port', () => {
  const dir = tmpDir()
  assert.strictEqual(servePortRoot(`${dir}/`), servePortRoot(dir))
  assert.strictEqual(servePortRoot(path.join(dir, 'sub', '..')), servePortRoot(dir))
})

test('resolveServePort: --port beats a pinned number beats the derivation', () => {
  const dir = tmpDir()

  writeEnvConfig(dir, { review: { servePort: 7777 } })
  const pinned = loadEnvConfig(dir).config
  assert.deepStrictEqual(resolveServePort(pinned, dir), { port: 7777, source: 'configured' })
  assert.deepStrictEqual(resolveServePort(pinned, dir, 7778), { port: 7778, source: 'flag' })

  writeEnvConfig(dir, { review: { servePort: 'auto' } })
  const auto = loadEnvConfig(dir).config
  const derived = resolveServePort(auto, dir)
  assert.strictEqual(derived.source, 'derived')
  assert.strictEqual(derived.port, derivedServePort(dir))
  assert.strictEqual(derived.root, dir)
  assert.deepStrictEqual(resolveServePort(auto, dir, 7778), { port: 7778, source: 'flag' })
})

test('resolveServePort: an absent or unusable --port falls through, never to NaN', () => {
  const dir = tmpDir()
  const config = loadEnvConfig(dir).config
  for (const override of [undefined, null, '', 'not-a-port']) {
    const out = resolveServePort(config, dir, override)
    assert.strictEqual(out.source, 'derived')
    assert.strictEqual(Number.isInteger(out.port), true)
  }
})

test('servePortReason names each source, and claims nothing for an unknown one', () => {
  assert.match(servePortReason('flag'), /--port/)
  assert.match(servePortReason('configured'), /servePort/)
  assert.match(servePortReason('derived'), /path/)
  // A server started before `portSource` was recorded. Silence, not a guess.
  assert.strictEqual(servePortReason(null), '')
  assert.strictEqual(servePortReason(undefined), '')
  assert.strictEqual(servePortReason('something-else'), '')
})

test('STAYS SILENT: a repo that pins a number sees no derivation at all', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { review: { servePort: 7777 } })
  const config = loadEnvConfig(dir).config

  assert.strictEqual(config.review.servePort, 7777)
  const out = resolveServePort(config, dir)
  assert.strictEqual(out.port, 7777)
  assert.strictEqual(out.source, 'configured')
  // No hashed root rides along, because nothing was hashed.
  assert.strictEqual('root' in out, false)
})

test('STAYS SILENT: a repo with no isolation config is untouched', () => {
  const dir = tmpDir()
  const { config, present, unknown } = loadEnvConfig(dir)
  assert.strictEqual(present, false)
  assert.deepStrictEqual(unknown, [])
  // The default resolves without reading anything that is not there.
  assert.strictEqual(resolveServePort(config, dir).source, 'derived')
})

test('STAYS SILENT: a path that does not exist resolves rather than throwing', () => {
  const missing = path.join(tmpDir(), 'never', 'created')
  assert.strictEqual(servePortRoot(missing), path.resolve(missing))
  const port = derivedServePort(servePortRoot(missing))
  assert.ok(port >= PORT_BASE && port < PORT_BASE + PORT_SPAN)
})
