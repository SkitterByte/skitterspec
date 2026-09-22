'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { resolveCredential, writeCredential, authHeader } = require('../src/credentials.js')

const SITE = 'https://acme.atlassian.net'
const CFG = { jira: { siteUrl: SITE }, auth: { emailEnv: 'JIRA_EMAIL', tokenEnv: 'JIRA_API_TOKEN' } }

function tmpHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-cred-'))
  return { root, file: path.join(root, 'skitterspec', 'credentials.json') }
}

test('environment wins when both halves are set', () => {
  const r = resolveCredential(CFG, { JIRA_EMAIL: 'a@b.c', JIRA_API_TOKEN: 'sekret-tok' })
  assert.deepStrictEqual({ ok: r.ok, email: r.email, source: r.source }, { ok: true, email: 'a@b.c', source: 'env' })
})

test('one env half alone is refused, naming the missing one — never half-authenticated', () => {
  const r = resolveCredential(CFG, { JIRA_EMAIL: 'a@b.c' }, { storePath: () => '/nonexistent/credentials.json' })
  assert.strictEqual(r.ok, false)
  assert.match(r.error, /JIRA_API_TOKEN is unset/)
})

test('the store supplies a compound credential, keyed by site', () => {
  const { root, file } = tmpHome()
  assert.ok(writeCredential(file, SITE, 'store@user.dev', 'store-tok').ok)
  const r = resolveCredential(CFG, { XDG_CONFIG_HOME: root })
  assert.deepStrictEqual(
    { ok: r.ok, email: r.email, token: r.token, source: r.source },
    { ok: true, email: 'store@user.dev', token: 'store-tok', source: 'store' },
  )
})

test('a jira write produces a v2 namespaced store', () => {
  const { file } = tmpHome()
  writeCredential(file, SITE, 'a@b.c', 'tok')
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
  assert.strictEqual(raw.version, 2)
  assert.deepStrictEqual(raw.providers.jira.teams[SITE].key, { email: 'a@b.c', token: 'tok' })
})

test('no credential anywhere is a refusal whose message never carries a token', () => {
  const { root, file } = tmpHome()
  writeCredential(file, SITE, 'a@b.c', 'super-secret-token')
  const r = resolveCredential({ ...CFG, jira: { siteUrl: 'https://other.atlassian.net' } }, { XDG_CONFIG_HOME: root })
  assert.strictEqual(r.ok, false)
  assert.doesNotMatch(JSON.stringify(r), /super-secret-token/)
})

test('an over-permissive store is refused with the chmod advice', () => {
  const { root, file } = tmpHome()
  writeCredential(file, SITE, 'a@b.c', 'tok')
  fs.chmodSync(file, 0o644)
  const r = resolveCredential(CFG, { XDG_CONFIG_HOME: root })
  assert.strictEqual(r.ok, false)
  assert.match(r.error, /chmod 600/)
})

test('authHeader is basic auth over email:token', () => {
  assert.strictEqual(
    authHeader({ email: 'a@b.c', token: 't0k' }),
    `Basic ${Buffer.from('a@b.c:t0k').toString('base64')}`,
  )
})
