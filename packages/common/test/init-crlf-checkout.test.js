'use strict'

/**
 * A checkout's line-ending conversion is not the user's edit.
 *
 * On Windows with `core.autocrlf=true`, a fresh clone or worktree checks every
 * managed file out with CRLF while `.skitterspec-manifest.json` holds the hash
 * of the LF content that was committed. `managedState` compared bytes and
 * hashes exactly, so every skill, command and rule read `customized` and
 * `update` reported "your edit — kept" for all of them — every teammate's
 * copy stopped receiving updates, silently.
 *
 * The stays-silent tests are the CRLF ones: a healthy but unusual checkout
 * that must say nothing. The last test is the other half — a genuine edit on
 * a CRLF file must still be called one.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { init, resync, checkSync, lastReport, managedState, managedTargets, readManifest, MANIFEST_FILE } =
  require('../src/init.js')

async function installed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-crlf-'))
  const orig = process.stdout.write
  process.stdout.write = () => true
  try {
    await init({ dir, force: false, claudeMd: false, mode: 'init' })
  } finally {
    process.stdout.write = orig
  }
  return dir
}

function quietly(fn) {
  const orig = process.stdout.write
  process.stdout.write = () => true
  try {
    return fn()
  } finally {
    process.stdout.write = orig
  }
}

const toCrlf = (s) => s.replace(/\r?\n/g, '\r\n')

// What git does to the working tree under autocrlf=true: every text file's
// LF becomes CRLF, and nothing else changes.
function checkOutWithCrlf(dir) {
  for (const { abs } of managedTargets(dir)) {
    if (fs.existsSync(abs)) fs.writeFileSync(abs, toCrlf(fs.readFileSync(abs, 'utf8')))
  }
}

function aManagedRule(dir) {
  const target = managedTargets(dir).find((t) => t.relPath.endsWith('spec-planning.md'))
  assert.ok(target, 'expected a managed rule file to exist')
  return target
}

test('a current install checked out CRLF reports up to date', async () => {
  const dir = await installed()
  checkOutWithCrlf(dir)

  const manifest = readManifest(dir)
  for (const { relPath, bundled } of managedTargets(dir)) {
    assert.strictEqual(managedState(dir, relPath, manifest, bundled), 'pristine', relPath)
  }
  const { rows } = checkSync(dir, { claudeMd: false, log: () => {} })
  assert.deepStrictEqual(rows, [])
})

test('an older install checked out CRLF is out of date, not your edit', async () => {
  const dir = await installed()
  const { relPath, abs } = aManagedRule(dir)

  // An earlier version of this file, recorded in the manifest as LF — the
  // state every teammate's clone is in when a new package version arrives.
  const older = fs.readFileSync(abs, 'utf8').replace('# Spec Planning', '# Spec Planning (older)')
  fs.writeFileSync(abs, older)
  const mf = path.join(dir, MANIFEST_FILE)
  const json = JSON.parse(fs.readFileSync(mf, 'utf8'))
  json.files[relPath] = require('node:crypto').createHash('sha1').update(older).digest('hex')
  fs.writeFileSync(mf, JSON.stringify(json, null, 2) + '\n')

  checkOutWithCrlf(dir)

  assert.strictEqual(managedState(dir, relPath, readManifest(dir), aManagedRule(dir).bundled), 'pristine')
  const { rows } = checkSync(dir, { claudeMd: false, log: () => {} })
  assert.deepStrictEqual(rows, [[relPath, 'out of date — would be updated']])

  quietly(() => resync(dir, { claudeMd: false }))
  assert.ok(lastReport().updated.includes(relPath), 'expected the older file to be updated')
  assert.ok(!lastReport().customized.some((r) => r.relPath === relPath))
})

test('resync leaves a current CRLF file alone rather than rewriting it', async () => {
  const dir = await installed()
  checkOutWithCrlf(dir)
  const { relPath } = aManagedRule(dir)

  quietly(() => resync(dir, { claudeMd: false }))
  const report = lastReport()
  assert.ok(report.skipped.includes(relPath))
  assert.ok(!report.updated.includes(relPath))
  assert.ok(!report.healed.includes(relPath))
})

test('a genuine one-line edit on a CRLF checkout is still your edit', async () => {
  const dir = await installed()
  checkOutWithCrlf(dir)
  const { relPath, abs, bundled } = aManagedRule(dir)

  fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace('# Spec Planning', '# Spec Planning, ours'))

  assert.strictEqual(managedState(dir, relPath, readManifest(dir), bundled), 'customized')
  const { rows } = checkSync(dir, { claudeMd: false, log: () => {} })
  assert.deepStrictEqual(rows, [[relPath, 'your edit — kept (--force overwrites)']])
})
