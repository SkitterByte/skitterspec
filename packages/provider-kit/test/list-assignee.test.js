'use strict'

/**
 * `list --mine | --by` — the contract Linear defined, shared by every provider.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { resolveListAssignee } = require('../src/list-assignee.js')

const base = (flags, { who = { ok: true, id: 'me@x.io', name: 'Me' }, users = [] } = {}) =>
  resolveListAssignee({
    flags,
    config: {},
    env: {},
    adapter: { searchUsers: async () => ({ users }) },
    resolveIdentity: async () => who,
    displayNameOf: (u) => u.name,
    tracker: 'Demo',
    prog: 'spec-sync',
  })

test('no filter asks nothing', async () => {
  assert.deepStrictEqual(await base({}), { assignee: null })
})

test('--mine resolves to who you are', async () => {
  assert.deepStrictEqual(await base({ mine: true }), { assignee: { id: 'me@x.io', name: 'Me' } })
})

// STAYS-SILENT: an unknown identity lists nothing rather than everyone.
test('--mine with an unknown identity stops at exit 0 and says why', async () => {
  const r = await base({ mine: true }, { who: { ok: false, reason: 'no token' } })
  assert.strictEqual(r.code, 0)
  assert.match(r.lines[0], /--mine needs to know who you are, and it does not \(no token\)/)
  assert.strictEqual(r.assignee, undefined)
})

test('--by with exactly one match filters to them', async () => {
  const r = await base({ by: 'priya' }, { users: [{ id: 'priya@x.io', name: 'Priya' }] })
  assert.deepStrictEqual(r, { assignee: { id: 'priya@x.io', name: 'Priya' } })
})

test('--by with no match, or several, refuses at exit 1', async () => {
  assert.strictEqual((await base({ by: 'nobody' })).code, 1)
  const two = await base({ by: 'p' }, { users: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] })
  assert.strictEqual(two.code, 1)
  assert.match(two.lines[0], /2 users match/)
})

test('--mine with --by refuses', async () => {
  const r = await base({ mine: true, by: 'x' })
  assert.strictEqual(r.code, 1)
  assert.match(r.lines[0], /cannot be combined/)
})
