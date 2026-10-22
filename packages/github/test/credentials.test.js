'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { resolveCredential, scopeOf, LITERAL_TOKEN_RE } = require('../src/credentials.js')

const config = (over = {}) => ({ github: { owner: 'SkitterByte', repo: 'x' }, auth: { tokenEnv: 'GITHUB_TOKEN' }, ...over })
const noStore = { storePath: () => '/nowhere/credentials.json', readStore: () => ({ ok: false, code: 'absent' }) }

test('the configured env var wins', () => {
  const got = resolveCredential(config(), { GITHUB_TOKEN: ' tok ', GH_TOKEN: 'other' }, noStore)
  assert.deepStrictEqual([got.ok, got.token, got.source, got.envVar], [true, 'tok', 'env', 'GITHUB_TOKEN'])
})

test('GH_TOKEN is the fallback the gh CLI already exports', () => {
  const got = resolveCredential(config(), { GH_TOKEN: 'gh' }, noStore)
  assert.deepStrictEqual([got.ok, got.token, got.envVar], [true, 'gh', 'GH_TOKEN'])
})

test('the store is read under github.com/<owner>, case-folded', () => {
  assert.strictEqual(scopeOf(config()), 'github.com/skitterbyte')
  assert.strictEqual(scopeOf({ github: { owner: '' } }), '')
  const store = { version: 2, providers: { github: { teams: { 'github.com/skitterbyte': { key: 'stored' } } } } }
  const got = resolveCredential(config(), {}, { storePath: () => '/s', readStore: () => ({ ok: true, store }) })
  assert.deepStrictEqual([got.ok, got.token, got.source], [true, 'stored', 'store'])
})

test("another provider's entry is not this provider's token", () => {
  const store = { version: 2, providers: { linear: { teams: { 'github.com/skitterbyte': { key: 'lin' } } } } }
  const got = resolveCredential(config(), {}, { storePath: () => '/s', readStore: () => ({ ok: true, store }) })
  assert.strictEqual(got.ok, false)
})

test('nothing found names what was looked for, and never a token', () => {
  const got = resolveCredential(config(), {}, noStore)
  assert.strictEqual(got.ok, false)
  assert.match(got.error, /GITHUB_TOKEN or GH_TOKEN/)
  const noOwner = resolveCredential({ github: { owner: '' } }, {}, noStore)
  assert.match(noOwner.error, /github\.owner/)
})

test('an unreadable store is reported, not treated as absent', () => {
  const got = resolveCredential(config(), {}, { storePath: () => '/s', readStore: () => ({ ok: false, code: 'mode', reason: 'store is world-readable' }) })
  assert.deepStrictEqual([got.ok, got.error], [false, 'store is world-readable'])
})

test('the literal-token guard recognises each GitHub token shape, and not a plain command', () => {
  for (const t of ['ghp_' + 'a'.repeat(36), 'gho_' + 'B'.repeat(36), 'github_pat_' + 'c_'.repeat(20)]) {
    assert.ok(LITERAL_TOKEN_RE.test(`echo ${t}`), t)
  }
  assert.ok(!LITERAL_TOKEN_RE.test('op read op://vault/github/token'))
})
