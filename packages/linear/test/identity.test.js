'use strict'

/**
 * `resolveIdentity` — "who am I in this Linear workspace?"
 *
 * The property under test throughout is that UNKNOWN IS A NORMAL STATE. A
 * shared key, an offline machine and a repo mid-setup all fail to identify
 * anyone, and none of them is a fault — so the resolver reports rather than
 * throws, and the caller is left free to skip assignment rather than guess at
 * one. The tests that matter most here are the ones asserting it stays quiet.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { resolveIdentity, displayNameOf } = require('../src/identity.js')
const { writeUser, writeKey, storePath } = require('../src/credentials.js')

const TEAM = 'team-abc'
const OTHER_TEAM = 'team-xyz'
const KEY = 'lin_api_zzzz9999'
const config = (over = {}) => ({ linear: { teamId: TEAM, teamKey: 'SKS', ...over }, auth: { keyEnv: 'LINEAR_API_KEY' } })

function xdg() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-identity-'))
  return { dir, env: { XDG_CONFIG_HOME: dir }, file: path.join(dir, 'skitterspec', 'credentials.json') }
}

// An adapter that records whether it was reached at all — how "the cache
// short-circuits the network" is actually proven rather than assumed.
function viewerAdapter(viewer, calls = []) {
  return { calls, async readViewer() { calls.push('readViewer'); return viewer } }
}

test('a cached identity is returned without touching the network', async () => {
  const s = xdg()
  writeUser(s.file, TEAM, { id: 'user-1', name: 'Jane Dev' })
  const calls = []
  const got = await resolveIdentity(config(), s.env, { adapter: viewerAdapter({ id: 'nope' }, calls) })
  assert.equal(got.ok, true)
  assert.equal(got.id, 'user-1')
  assert.equal(got.name, 'Jane Dev')
  assert.equal(got.source, 'store')
  assert.deepEqual(calls, [], 'a cache hit must not call Linear')
})

test('with no cache it derives from the credential viewer', async () => {
  const s = xdg()
  const env = { ...s.env, LINEAR_API_KEY: KEY }
  const got = await resolveIdentity(config(), env, {
    adapter: viewerAdapter({ id: 'user-2', name: 'Sam Ops', email: 'sam@acme.com' }),
  })
  assert.equal(got.ok, true)
  assert.equal(got.id, 'user-2')
  assert.equal(got.name, 'Sam Ops')
  assert.equal(got.source, 'viewer')
})

test('resolving never writes to the store — caching is the caller\'s decision', async () => {
  const s = xdg()
  const env = { ...s.env, LINEAR_API_KEY: KEY }
  await resolveIdentity(config(), env, { adapter: viewerAdapter({ id: 'user-2', name: 'Sam Ops' }) })
  assert.equal(fs.existsSync(s.file), false, 'asking who I am must not have a side effect')
})

test('another team\'s cached identity is not mine', async () => {
  const s = xdg()
  writeUser(s.file, OTHER_TEAM, { id: 'user-9', name: 'Someone Else' })
  const got = await resolveIdentity(config(), s.env, { adapter: viewerAdapter(null) })
  assert.equal(got.ok, false)
  assert.equal(got.source, 'unknown')
})

test('a stored key is preserved when an identity is written beside it', () => {
  const s = xdg()
  writeKey(s.file, TEAM, KEY)
  writeUser(s.file, TEAM, { id: 'user-1', name: 'Jane Dev' })
  const stored = JSON.parse(fs.readFileSync(s.file, 'utf-8'))
  assert.equal(stored.teams[TEAM].key, KEY, 'recording an identity must not cost the user their key')
  assert.deepEqual(stored.teams[TEAM].user, { id: 'user-1', name: 'Jane Dev' })
})

test('the store is created owner-only', () => {
  const s = xdg()
  writeUser(s.file, TEAM, { id: 'user-1', name: 'Jane Dev' })
  assert.equal((fs.statSync(s.file).mode & 0o777).toString(8), '600')
})

// --- stays silent ------------------------------------------------------------
//
// Per .claude/rules/negative-checks.md: the positive tests above prove the
// resolver can answer. These prove it does not ACCUSE when it cannot.

test('no key and no store reports unknown rather than failing', async () => {
  const s = xdg()
  const got = await resolveIdentity(config(), s.env, {})
  assert.equal(got.ok, false)
  assert.equal(got.source, 'unknown')
  assert.match(got.reason, /no Linear API key/)
})

test('an unreachable Linear reports unknown rather than throwing', async () => {
  const s = xdg()
  const env = { ...s.env, LINEAR_API_KEY: KEY }
  const adapter = { async readViewer() { throw new Error('Linear unreachable: fetch failed') } }
  const got = await resolveIdentity(config(), env, { adapter })
  assert.equal(got.ok, false)
  assert.equal(got.source, 'unknown')
  assert.match(got.reason, /unreachable/)
})

test('a key whose viewer is empty reports unknown rather than a blank identity', async () => {
  const s = xdg()
  const env = { ...s.env, LINEAR_API_KEY: KEY }
  const got = await resolveIdentity(config(), env, { adapter: viewerAdapter({ name: 'No Id Here' }) })
  assert.equal(got.ok, false)
  assert.equal(got.source, 'unknown')
})

test('a cached entry with no id is no identity, not a partial one', async () => {
  const s = xdg()
  fs.mkdirSync(path.dirname(s.file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(s.file, JSON.stringify({ version: 1, teams: { [TEAM]: { user: { name: 'Nameless' } } } }), { mode: 0o600 })
  const got = await resolveIdentity(config(), s.env, {})
  assert.equal(got.ok, false, 'an entry without an id cannot assign anything')
})

test('no teamId still derives — a repo mid-setup can say who you are', async () => {
  const s = xdg()
  const env = { ...s.env, LINEAR_API_KEY: KEY }
  const got = await resolveIdentity({ linear: {}, auth: {} }, env, {
    adapter: viewerAdapter({ id: 'user-3', name: 'Early Bird' }),
  })
  assert.equal(got.ok, true)
  assert.equal(got.source, 'viewer')
})

// --- display name ------------------------------------------------------------

test('displayNameOf falls back through name, displayName, email', () => {
  assert.equal(displayNameOf({ name: 'Jane Dev', displayName: 'jane' }), 'Jane Dev')
  assert.equal(displayNameOf({ displayName: 'jane' }), 'jane')
  assert.equal(displayNameOf({ email: 'jane@acme.com' }), 'jane@acme.com')
  assert.equal(displayNameOf({ id: 'u1' }), null)
  assert.equal(displayNameOf(null), null)
})

test('storePath honours XDG_CONFIG_HOME', () => {
  assert.equal(storePath({ XDG_CONFIG_HOME: '/tmp/x' }), path.join('/tmp/x', 'skitterspec', 'credentials.json'))
})
