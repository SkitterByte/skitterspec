'use strict'

// The two-schema contract: v1 belongs to the legacy owner and stays v1 under
// its writes; the FIRST write by a second provider migrates the file to v2,
// folding the v1 entries under their owner; and reads resolve both shapes.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { makeCredentialsStore } = require('../src/credentials.js')

const legacy = makeCredentialsStore({ provider: 'alpha', legacyV1Owner: 'alpha' })
const second = makeCredentialsStore({ provider: 'beta', legacyV1Owner: 'alpha' })

function tmpStore(content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-cred-'))
  const file = path.join(root, 'credentials.json')
  if (content !== undefined) {
    fs.writeFileSync(file, JSON.stringify(content, null, 2) + '\n', { mode: 0o600 })
  }
  return { root, file }
}

const parse = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'))

test('the legacy owner keeps a v1 store v1', () => {
  const { file } = tmpStore({ version: 1, teams: { T1: { key: 'k1' } } })
  assert.ok(legacy.writeKey(file, 'T2', 'k2').ok)
  const store = parse(file)
  assert.strictEqual(store.version, 1)
  assert.deepStrictEqual(Object.keys(store.teams).sort(), ['T1', 'T2'])
  assert.strictEqual(legacy.keyFor(store, 'T2'), 'k2')
})

test('the legacy owner creates a fresh store as v1', () => {
  const { file } = tmpStore()
  assert.ok(legacy.writeKey(file, 'T1', 'k1').ok)
  const store = parse(file)
  assert.strictEqual(store.version, 1)
  assert.strictEqual(store.providers, undefined)
})

test('a second provider creates a fresh store as v2', () => {
  const { file } = tmpStore()
  assert.ok(second.writeKey(file, 'S1', { email: 'a@b.c', token: 't' }).ok)
  const store = parse(file)
  assert.strictEqual(store.version, 2)
  assert.deepStrictEqual(store.providers.beta.teams.S1.key, { email: 'a@b.c', token: 't' })
})

test("a second provider's first write migrates v1, folding entries under their owner", () => {
  const { file } = tmpStore({ version: 1, teams: { T1: { key: 'k1', user: { id: 'u1' } } } })
  assert.ok(second.writeKey(file, 'S1', 'sk').ok)
  const store = parse(file)
  assert.strictEqual(store.version, 2)
  assert.strictEqual(store.teams, undefined, 'the v1 map is gone, not duplicated')
  assert.strictEqual(store.providers.alpha.teams.T1.key, 'k1')
  assert.strictEqual(store.providers.beta.teams.S1.key, 'sk')
  // Both bindings still read their own entries after the migration.
  assert.strictEqual(legacy.keyFor(store, 'T1'), 'k1')
  assert.deepStrictEqual(legacy.userFor(store, 'T1'), { id: 'u1', name: null })
  assert.strictEqual(second.keyFor(store, 'S1'), 'sk')
})

test('a v1 store holds nothing for a provider that is not its owner', () => {
  const store = { version: 1, teams: { T1: { key: 'k1' } } }
  assert.strictEqual(second.keyFor(store, 'T1'), null)
})

test('a compound credential resolves through credentialFor, never keyFor', () => {
  const store = { version: 2, providers: { beta: { teams: { S1: { key: { email: 'a', token: 'b' } } } } } }
  assert.strictEqual(second.keyFor(store, 'S1'), null)
  assert.deepStrictEqual(second.credentialFor(store, 'S1'), { email: 'a', token: 'b' })
})

test('the migrated file stays owner-only', () => {
  const { file } = tmpStore({ version: 1, teams: { T1: { key: 'k1' } } })
  fs.chmodSync(file, 0o600)
  assert.ok(second.writeKey(file, 'S1', 'sk').ok)
  assert.strictEqual((fs.statSync(file).mode & 0o777).toString(8), '600')
})
