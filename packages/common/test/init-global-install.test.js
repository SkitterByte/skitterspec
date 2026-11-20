'use strict'

// Providers no longer answer to `skitterspec`; the base does, installed
// alongside (feat-global-install, phase 1). These cover what that asks of the
// installer: each bin mapped to its own package, and the manifest naming the
// distribution that wrote it.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { packageForBin, writeManifest, readManifest, distributionPackage } = require('../src/init.js')

function tmp() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-global-')))
}

test('each bin maps to the package that carries it', () => {
  assert.strictEqual(packageForBin('skitterspec'), '@skitterbyte/skitterspec')
  assert.strictEqual(packageForBin('skitterspec-github'), '@skitterbyte/skitterspec-github')
  assert.strictEqual(packageForBin('skitterspec-azure-boards'), '@skitterbyte/skitterspec-azure-boards')
})

test('the manifest records the distribution that wrote it', () => {
  const dir = tmp()
  try {
    writeManifest(dir, { 'a.md': 'x' })
    assert.strictEqual(readManifest(dir).distribution, distributionPackage())
    writeManifest(dir, { 'a.md': 'x' }, { local: true })
    const m = readManifest(dir)
    assert.strictEqual(m.distribution, distributionPackage())
    assert.strictEqual(m.scope, 'local')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// Stays silent: a manifest from before the field is cannot-tell, not a guess.
test('stays silent: an older manifest has no distribution, and says so with null', () => {
  const dir = tmp()
  try {
    fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'specs', '.core', '.skitterspec-manifest.json'), JSON.stringify({ version: 1, files: {} }))
    assert.strictEqual(readManifest(dir).distribution, null)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
