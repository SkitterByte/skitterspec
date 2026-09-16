'use strict'

/**
 * A path upstream has NEWLY ADOPTED is not the user's edit of our file.
 *
 * `managedState` used to answer `customized` for both, and the report said
 * "your edit — kept". For an adopted path that is a false statement, and the
 * reader acts on it: v21 renamed the commit hook to `review-gate.cjs` — the
 * same name anyone would have picked to work around v20's ESM crash — so a
 * hand-written shim was kept, the real hook was never installed, and
 * `review-gate.js` was pruned out from under it. The shim fails open, so the
 * gate went silently absent under an update that reported success.
 *
 * Both states still KEEP the file, and that is deliberate: keeping is the
 * harmless branch (`.claude/rules/negative-checks.md` rule 4) and it did not
 * change. Only what the report claims about it did.
 *
 * The three stays-silent tests below are the load-bearing half. `adopted` is
 * concluded from an ABSENCE — a path the manifest does not name — and an
 * absence is evidence only once the lookup could have seen the thing. On a
 * repo with no manifest yet EVERY path is absent, which is the shape that
 * would have accused a whole healthy install.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  init,
  resync,
  checkSync,
  lastReport,
  managedState,
  managedTargets,
  readManifest,
  MANIFEST_FILE,
} = require('../src/init.js')

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sks-adopted-'))
}

async function installed() {
  const dir = tmpProject()
  const orig = process.stdout.write
  process.stdout.write = () => true
  try {
    await init({ dir, force: false, claudeMd: false, mode: 'init' })
  } finally {
    process.stdout.write = orig
  }
  return dir
}

function captureResync(dir, opts) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    resync(dir, opts)
  } finally {
    process.stdout.write = orig
  }
  return out
}

// A rule file is a good stand-in for the hook: managed, plain text, and its
// content is not re-rendered per project the way a command file is.
function aManagedTarget(dir) {
  const target = managedTargets(dir).find((t) => t.relPath.endsWith('spec-planning.md'))
  assert.ok(target, 'expected a managed rule file to exist')
  return target
}

// Reproduce the state an adoption leaves behind: the project has a file at a
// path the manifest does not name, and it differs from what we ship.
function adopt(dir, relPath, content) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_FILE), 'utf8'))
  delete manifest.files[relPath]
  fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n')
  fs.writeFileSync(path.join(dir, relPath), content)
}

const MINE = '// mine, written before upstream claimed this path\n'

test('a path the manifest never named is adopted, not your edit', async () => {
  const dir = await installed()
  const { relPath } = aManagedTarget(dir)
  adopt(dir, relPath, MINE)

  const manifest = readManifest(dir)
  assert.strictEqual(manifest.baselined, true, 'the manifest holds other entries')
  assert.strictEqual(managedState(dir, relPath, manifest, aManagedTarget(dir).bundled), 'adopted')
})

test('an adopted path is kept, and reported in its own words', async () => {
  const dir = await installed()
  const { relPath } = aManagedTarget(dir)
  adopt(dir, relPath, MINE)

  const out = captureResync(dir, { claudeMd: false })
  const report = lastReport()

  assert.deepStrictEqual(
    report.adopted.map((a) => a.relPath),
    [relPath],
  )
  assert.deepStrictEqual(report.customized, [], 'it must not also be claimed as an edit')
  assert.strictEqual(fs.readFileSync(path.join(dir, relPath), 'utf8'), MINE, 'kept, untouched')
  assert.match(out, /adopted upstream \(kept — ours was never installed\)/)
  assert.doesNotMatch(out, /customized \(kept\)/)
})

test('--check names the adopted path without calling it yours', async () => {
  const dir = await installed()
  const { relPath } = aManagedTarget(dir)
  adopt(dir, relPath, MINE)

  const lines = []
  const { rows } = checkSync(dir, { claudeMd: false, log: (m) => lines.push(m) })
  const row = rows.find(([name]) => name === relPath)

  assert.ok(row, `expected a row for ${relPath}, got ${JSON.stringify(rows)}`)
  assert.strictEqual(row[1], 'adopted upstream — yours kept, theirs not installed (--force takes theirs)')
  assert.doesNotMatch(lines.join('\n'), /your edit/)
})

test('--force takes ours over an adopted path, as it always has', async () => {
  const dir = await installed()
  const { relPath, bundled } = aManagedTarget(dir)
  adopt(dir, relPath, MINE)

  captureResync(dir, { claudeMd: false, force: true })

  assert.strictEqual(fs.readFileSync(path.join(dir, relPath), 'utf8'), bundled)
  assert.deepStrictEqual(lastReport().adopted, [], 'taking ours is an update, not an adoption')
})

test('--diff shows what an adopted path declined', async () => {
  const dir = await installed()
  const { relPath } = aManagedTarget(dir)
  adopt(dir, relPath, MINE)

  const out = captureResync(dir, { claudeMd: false, diff: true })
  assert.match(out, new RegExp(`--- ${relPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(kept — this is what was not installed\\)`))
})

// --- stays silent on healthy-but-unusual inputs -----------------------------

test('a repo with no manifest at all adopts nothing', async () => {
  const dir = await installed()
  const { relPath, bundled } = aManagedTarget(dir)
  fs.rmSync(path.join(dir, MANIFEST_FILE))
  fs.writeFileSync(path.join(dir, relPath), MINE)

  const manifest = readManifest(dir)
  assert.strictEqual(manifest.baselined, false)
  assert.strictEqual(managedState(dir, relPath, manifest, bundled), 'customized')

  const out = captureResync(dir, { claudeMd: false })
  assert.deepStrictEqual(lastReport().adopted, [], 'every path is absent here — that is not evidence')
  assert.doesNotMatch(out, /adopted upstream/)
})

test('a manifest that will not parse adopts nothing', async () => {
  const dir = await installed()
  const { relPath, bundled } = aManagedTarget(dir)
  fs.writeFileSync(path.join(dir, MANIFEST_FILE), '{ this is not json')
  fs.writeFileSync(path.join(dir, relPath), MINE)

  assert.strictEqual(readManifest(dir).baselined, false)
  assert.strictEqual(managedState(dir, relPath, readManifest(dir), bundled), 'customized')

  const out = captureResync(dir, { claudeMd: false })
  assert.deepStrictEqual(lastReport().adopted, [], 'a baseline we could not read proves nothing')
  assert.doesNotMatch(out, /adopted upstream/)
})

test('a genuine edit to a path the manifest names is still your edit', async () => {
  const dir = await installed()
  const { relPath, bundled } = aManagedTarget(dir)
  fs.writeFileSync(path.join(dir, relPath), bundled + '\n<!-- my note -->\n')

  assert.strictEqual(managedState(dir, relPath, readManifest(dir), bundled), 'customized')

  const out = captureResync(dir, { claudeMd: false })
  assert.deepStrictEqual(
    lastReport().customized.map((c) => c.relPath),
    [relPath],
  )
  assert.deepStrictEqual(lastReport().adopted, [])
  assert.match(out, /customized \(kept\)/)
})

test('a healthy install reports neither bucket', async () => {
  const dir = await installed()
  const out = captureResync(dir, { claudeMd: false })

  assert.deepStrictEqual(lastReport().adopted, [])
  assert.deepStrictEqual(lastReport().customized, [])
  assert.doesNotMatch(out, /adopted upstream/)
})
