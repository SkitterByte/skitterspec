'use strict'

// Providers no longer answer to `skitterspec`; the base does, installed
// alongside (feat-global-install, phase 1). These cover what that asks of the
// installer: each bin mapped to its own package, the manifest naming the
// distribution that wrote it, and a warning when the base and the provider
// have drifted apart.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { packageForBin, baseVersionDrift, writeManifest, readManifest, distributionPackage } = require('../src/init.js')

const NO_PATH = { PATH: '' }

function tmp() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-global-')))
}

function seedBase(dir, version) {
  const pkg = path.join(dir, 'node_modules', '@skitterbyte', 'skitterspec')
  fs.mkdirSync(pkg, { recursive: true })
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@skitterbyte/skitterspec', version }))
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

test('a provider beside a base of another version is warned about, naming both', () => {
  const dir = tmp()
  try {
    seedBase(dir, '23.20.0')
    const line = baseVersionDrift(dir, NO_PATH, '23.21.0', '@skitterbyte/skitterspec-github')
    assert.match(line, /@skitterbyte\/skitterspec is 23\.20\.0 but @skitterbyte\/skitterspec-github is 23\.21\.0/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('stays silent: the same version, the base itself, or no base to ask', () => {
  const dir = tmp()
  try {
    seedBase(dir, '23.21.0')
    assert.strictEqual(baseVersionDrift(dir, NO_PATH, '23.21.0', '@skitterbyte/skitterspec-github'), null, 'matching')
    assert.strictEqual(baseVersionDrift(dir, NO_PATH, '1.0.0', '@skitterbyte/skitterspec'), null, 'the base compares with nothing')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const empty = tmp()
  try {
    assert.strictEqual(baseVersionDrift(empty, NO_PATH, '23.21.0', '@skitterbyte/skitterspec-github'), null, 'cannot tell')
  } finally {
    fs.rmSync(empty, { recursive: true, force: true })
  }
})
