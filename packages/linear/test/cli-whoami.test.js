'use strict'

/**
 * `spec-sync whoami` and `spec-sync users` — the CLI half of identity.
 *
 * Two contracts are asserted here that the rest of the suite cannot see:
 *
 *   - **`whoami` exits 0 even when it cannot identify anyone.** It answers a
 *     question, and "nobody" is an answer. `credentials status` exits 1 in the
 *     same situation because it is a READINESS check — the divergence is
 *     deliberate and is what stops an advisory command becoming an accusing one.
 *   - **The MCP path writes nothing and says so**, exactly as `states` and
 *     `projects` do, so a workspace without an API key is served rather than
 *     refused.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { writeKey, writeUser } = require('../src/credentials.js')

const TEAM = 'team-abc'
const KEY = 'lin_api_zzzz9999'

function scaffold({ linear } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-cli-whoami-'))
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-xdg-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'linear.config.json'),
    JSON.stringify({ linear: linear || { teamKey: 'SKS', teamId: TEAM } }),
  )
  return { dir, xdg, file: path.join(xdg, 'skitterspec', 'credentials.json') }
}

async function run(argv, s, { key, adapter } = {}) {
  let out = ''
  const env = { XDG_CONFIG_HOME: s.xdg }
  if (key) env.LINEAR_API_KEY = key
  const io = { out: { write: (c) => ((out += c), true) }, err: { write: () => true }, env }
  if (adapter) io.adapter = adapter
  const code = await specSync([...argv, '--dir', s.dir], io)
  return { code, out }
}

const viewerAdapter = (viewer) => ({ async readViewer() { return viewer } })

// --- whoami: resolving -------------------------------------------------------

test('whoami derives from the key and caches the answer', async () => {
  const s = scaffold()
  const adapter = viewerAdapter({ id: 'user-2', name: 'Sam Ops', email: 'sam@acme.com' })
  const r = await run(['whoami'], s, { key: KEY, adapter })
  assert.equal(r.code, 0)
  assert.match(r.out, /Sam Ops <user-2>/)
  assert.match(r.out, /derived from the API key/)
  const stored = JSON.parse(fs.readFileSync(s.file, 'utf-8'))
  assert.deepEqual(stored.teams[TEAM].user, { id: 'user-2', name: 'Sam Ops' })
})

test('whoami reads the cache on the second run', async () => {
  const s = scaffold()
  writeUser(s.file, TEAM, { id: 'user-1', name: 'Jane Dev' })
  const adapter = { async readViewer() { throw new Error('must not be called') } }
  const r = await run(['whoami'], s, { key: KEY, adapter })
  assert.equal(r.code, 0)
  assert.match(r.out, /Jane Dev <user-1>/)
  assert.match(r.out, /cached in/)
})

test('whoami --json carries the resolution for a skill to branch on', async () => {
  const s = scaffold()
  writeUser(s.file, TEAM, { id: 'user-1', name: 'Jane Dev' })
  const r = await run(['whoami', '--json'], s)
  const payload = JSON.parse(r.out)
  assert.equal(payload.ok, true)
  assert.equal(payload.id, 'user-1')
  assert.equal(payload.source, 'store')
})

// --- whoami: the override ----------------------------------------------------

test('whoami --set records an identity by hand, preserving the key', async () => {
  const s = scaffold()
  writeKey(s.file, TEAM, KEY)
  const r = await run(['whoami', '--set', 'user-7', '--name', 'Bot Wrangler'], s)
  assert.equal(r.code, 0)
  assert.match(r.out, /Bot Wrangler \(user-7\)/)
  const stored = JSON.parse(fs.readFileSync(s.file, 'utf-8'))
  assert.deepEqual(stored.teams[TEAM].user, { id: 'user-7', name: 'Bot Wrangler' })
  assert.equal(stored.teams[TEAM].key, KEY, 'setting an identity must not revoke the key')
})

test('whoami --set overrides what the viewer would have said', async () => {
  const s = scaffold()
  await run(['whoami', '--set', 'user-7', '--name', 'The Human'], s)
  const adapter = viewerAdapter({ id: 'bot-1', name: 'CI Bot' })
  const r = await run(['whoami'], s, { key: KEY, adapter })
  assert.match(r.out, /The Human <user-7>/, 'a shared key must not overwrite a deliberate override')
})

test('whoami --unset forgets the identity but keeps the key', async () => {
  const s = scaffold()
  writeKey(s.file, TEAM, KEY)
  writeUser(s.file, TEAM, { id: 'user-1', name: 'Jane Dev' })
  const r = await run(['whoami', '--unset'], s)
  assert.equal(r.code, 0)
  assert.match(r.out, /API key is untouched/)
  const stored = JSON.parse(fs.readFileSync(s.file, 'utf-8'))
  assert.equal(stored.teams[TEAM].user, undefined)
  assert.equal(stored.teams[TEAM].key, KEY)
})

test('whoami --unset on a store with nothing to forget is a clean no-op', async () => {
  const s = scaffold()
  const r = await run(['whoami', '--unset'], s)
  assert.equal(r.code, 0)
  assert.match(r.out, /nothing to forget/)
})

// --- whoami: stays silent ----------------------------------------------------
//
// Per .claude/rules/negative-checks.md. The tests above prove it can answer;
// these prove it does not accuse a healthy-but-unusual setup.

test('whoami with no key and no store exits 0 and reports unknown', async () => {
  const s = scaffold()
  const r = await run(['whoami'], s)
  assert.equal(r.code, 0, 'an unidentifiable user is not a broken install')
  assert.match(r.out, /unknown/)
  assert.match(r.out, /--set/, 'it must say how to fix it, not just that it failed')
})

test('whoami with no Linear config at all exits 0', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-cli-whoami-bare-'))
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-xdg-'))
  let out = ''
  const code = await specSync(['whoami', '--dir', dir], {
    out: { write: (c) => ((out += c), true) },
    err: { write: () => true },
    env: { XDG_CONFIG_HOME: xdg },
  })
  assert.equal(code, 0)
  assert.match(out, /not enabled/)
})

test('whoami reports unknown, not a crash, when Linear is unreachable', async () => {
  const s = scaffold()
  const adapter = { async readViewer() { throw new Error('Linear unreachable: fetch failed') } }
  const r = await run(['whoami'], s, { key: KEY, adapter })
  assert.equal(r.code, 0)
  assert.match(r.out, /unreachable/)
})

test('whoami refuses only when the config has no teamId to key on', async () => {
  const s = scaffold({ linear: { teamKey: 'SKS' } })
  const r = await run(['whoami'], s)
  assert.equal(r.code, 1, 'a store keyed by team cannot work without one — that IS a config fault')
  assert.match(r.out, /no linear.teamId/)
})

// --- users -------------------------------------------------------------------

test('users searches by name or email and reports the matches', async () => {
  const s = scaffold()
  const adapter = {
    calls: [],
    async searchUsers(query, opts) {
      this.calls.push({ query, opts })
      return { users: [{ id: 'user-1', name: 'Jane Dev', email: 'jane@acme.com', active: true }], nextCursor: null }
    },
  }
  const r = await run(['users', 'jane'], s, { key: KEY, adapter })
  assert.equal(r.code, 0)
  assert.match(r.out, /Jane Dev <user-1>/)
  assert.match(r.out, /jane@acme.com/)
  assert.equal(adapter.calls[0].query, 'jane')
})

test('users lists everyone when given no query', async () => {
  const s = scaffold()
  const adapter = {
    calls: [],
    async searchUsers(query, opts) {
      this.calls.push({ query, opts })
      return { users: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], nextCursor: null }
    },
  }
  const r = await run(['users'], s, { key: KEY, adapter })
  assert.match(r.out, /2 match\(es\)/)
  assert.equal(adapter.calls[0].query, '', 'search and listing are one command, not two')
})

test('users flags a deactivated member rather than offering them silently', async () => {
  const s = scaffold()
  const adapter = {
    async searchUsers() {
      return { users: [{ id: 'gone', name: 'Ex Employee', active: false }], nextCursor: null }
    },
  }
  const r = await run(['users', 'ex'], s, { key: KEY, adapter })
  assert.match(r.out, /\[deactivated\]/, 'a deactivated user can still be assigned — say so')
})

test('users surfaces the next page rather than truncating silently', async () => {
  const s = scaffold()
  const adapter = {
    async searchUsers() {
      return { users: [{ id: 'a', name: 'A' }], nextCursor: 'cur-2' }
    },
  }
  const r = await run(['users'], s, { key: KEY, adapter })
  assert.match(r.out, /--cursor cur-2/)
})

test('users with no match says so and exits 0', async () => {
  const s = scaffold()
  const adapter = { async searchUsers() { return { users: [], nextCursor: null } } }
  const r = await run(['users', 'nobody'], s, { key: KEY, adapter })
  assert.equal(r.code, 0, 'nobody matching a search is an answer, not a fault')
  assert.match(r.out, /no match/)
})

// --- the MCP path ------------------------------------------------------------

test('users on the MCP path steps aside and writes nothing', async () => {
  const s = scaffold()
  const r = await run(['users', 'jane'], s)
  assert.equal(r.code, 0)
  assert.match(r.out, /transport = mcp/)
})

test('users --json on the MCP path reports the transport for the skill', async () => {
  const s = scaffold()
  const r = await run(['users', '--json'], s)
  const payload = JSON.parse(r.out)
  assert.equal(payload.transport, 'mcp')
  assert.equal(payload.users, null)
})

test('an unknown flag is refused before anything runs', async () => {
  const s = scaffold()
  const r = await run(['whoami', '--nope'], s)
  assert.equal(r.code, 1)
  assert.match(r.out, /unknown flag/)
})
