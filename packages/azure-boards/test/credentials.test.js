'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { resolveCredential, authHeader, orgOf } = require('../src/credentials.js')

const CONFIG = { azure: { orgUrl: 'https://dev.azure.com/acme' }, auth: { tokenEnv: 'AZURE_DEVOPS_EXT_PAT' } }

test('the env var wins over everything', () => {
  const got = resolveCredential(CONFIG, { AZURE_DEVOPS_EXT_PAT: ' pat-123 ' })
  assert.deepStrictEqual(got, { ok: true, token: 'pat-123', source: 'env', envVars: ['AZURE_DEVOPS_EXT_PAT'] })
})

test('a custom tokenEnv name is honoured', () => {
  const got = resolveCredential({ ...CONFIG, auth: { tokenEnv: 'MY_PAT' } }, { MY_PAT: 'x' })
  assert.strictEqual(got.ok, true)
  assert.strictEqual(got.source, 'env')
})

test('falls back to the store entry keyed by org URL', () => {
  const got = resolveCredential(CONFIG, {}, {
    storePath: () => '/tmp/creds.json',
    readStore: () => ({
      ok: true,
      store: { version: 2, providers: { 'azure-boards': { teams: { 'https://dev.azure.com/acme': { key: 'stored-pat' } } } } },
    }),
  })
  assert.strictEqual(got.ok, true)
  assert.strictEqual(got.token, 'stored-pat')
  assert.strictEqual(got.source, 'store')
})

test('nothing anywhere is a named refusal that never contains a token', () => {
  const got = resolveCredential(CONFIG, {}, {
    storePath: () => '/tmp/creds.json',
    readStore: () => ({ ok: false, code: 'absent' }),
  })
  assert.strictEqual(got.ok, false)
  assert.match(got.error, /AZURE_DEVOPS_EXT_PAT/)
  assert.match(got.error, /credentials set/)
})

test('an unreadable store is relayed, not shadowed by the generic message', () => {
  const got = resolveCredential(CONFIG, {}, {
    storePath: () => '/tmp/creds.json',
    readStore: () => ({ ok: false, code: 'unreadable', reason: 'credentials.json is not valid JSON' }),
  })
  assert.strictEqual(got.ok, false)
  assert.match(got.error, /not valid JSON/)
})

test('authHeader is basic auth with an empty user', () => {
  assert.strictEqual(authHeader({ token: 'pat' }), `Basic ${Buffer.from(':pat').toString('base64')}`)
})

test('orgOf reads the configured org URL', () => {
  assert.strictEqual(orgOf(CONFIG), 'https://dev.azure.com/acme')
  assert.strictEqual(orgOf({}), '')
})
