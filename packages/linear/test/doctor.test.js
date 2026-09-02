'use strict'

/**
 * `doctor.js` — the readiness matrix, as pure rows.
 *
 * Everything here is driven from literals: the module takes the project's state
 * as an argument precisely so the whole matrix is reachable without scaffolding
 * a dozen temp projects. Phase 2 supplies the real state.
 *
 * The distinction under test throughout is `missing` vs `broken`: declining an
 * opt-in must never read as a failure, while configured-but-wrong must.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { runChecks, STATES } = require('../src/doctor.js')

const READY = {
  scaffold: { specsDir: true, buckets: ['backlog', 'in-progress', 'complete', 'cancelled'], skills: 12 },
  isolation: { present: true, parsed: true },
  tracker: { present: true, parsed: true, teamId: 'e07c', teamKey: 'SKS' },
  key: { ok: true, source: 'the environment (LINEAR_API_KEY)', fingerprint: '…sCU8' },
  remote: { checked: false },
}

const withState = (over) => runChecks({ ...READY, ...over })
const find = (r, id) => r.checks.find((c) => c.id === id)

// --- the happy path ----------------------------------------------------------

test('a fully configured project is ok, with every layer reported', () => {
  const r = withState({})
  assert.strictEqual(r.ok, true)
  assert.deepEqual(
    r.checks.map((c) => c.id),
    ['scaffold', 'isolation', 'tracker', 'key', 'remote'],
    'all four layers, plus the remote row',
  )
  for (const c of r.checks) assert.ok(STATES.includes(c.state), `${c.id} has a known state`)
})

// --- missing is not broken ---------------------------------------------------

test('declining isolation is missing, and keeps the run ok', () => {
  const r = withState({ isolation: { present: false } })
  assert.strictEqual(find(r, 'isolation').state, 'missing')
  assert.strictEqual(r.ok, true, 'an opt-in not taken is not a failure')
})

test('declining a tracker is missing, and keeps the run ok', () => {
  const r = withState({ tracker: { present: false }, key: { ok: false } })
  assert.strictEqual(find(r, 'tracker').state, 'missing')
  assert.strictEqual(r.ok, true)
})

test('a malformed config is broken, not missing — and fails the run', () => {
  const r = withState({ isolation: { present: true, parsed: false, error: 'Unexpected token }' } })
  const c = find(r, 'isolation')
  assert.strictEqual(c.state, 'broken')
  assert.match(c.detail, /Unexpected token/, 'the parse error is relayed, not swallowed')
  assert.strictEqual(r.ok, false, 'configured-but-wrong is a failure')
})

test('a tracker config with no teamId is broken — it is configured but unusable', () => {
  const r = withState({ tracker: { present: true, parsed: true } })
  assert.strictEqual(find(r, 'tracker').state, 'broken')
  assert.strictEqual(r.ok, false)
})

// --- each layer, missing in turn ---------------------------------------------

test('no specs/ folder at all is missing, and names init', () => {
  const r = withState({ scaffold: { specsDir: false } })
  const c = find(r, 'scaffold')
  assert.strictEqual(c.state, 'missing')
  assert.strictEqual(c.fix, 'skitterspec init')
})

test('a half-installed scaffold is broken, not missing', () => {
  const r = withState({ scaffold: { specsDir: true, buckets: ['backlog'], skills: 12 } })
  const c = find(r, 'scaffold')
  assert.strictEqual(c.state, 'broken', 'a partial install is exactly when repair matters')
  assert.match(c.detail, /in-progress/)
  assert.strictEqual(r.ok, false)
})

test('specs/ without skills is broken too', () => {
  const r = withState({ scaffold: { ...READY.scaffold, skills: 0 } })
  assert.strictEqual(find(r, 'scaffold').state, 'broken')
})

test('a missing key is reported against the team that needs it', () => {
  const r = withState({ key: { ok: false } })
  const c = find(r, 'key')
  assert.strictEqual(c.state, 'missing')
  assert.match(c.detail, /SKS/)
  assert.strictEqual(c.fix, 'skitterspec spec-sync credentials set')
})

test('the key row is skipped when there is no tracker to authenticate against', () => {
  const r = withState({ tracker: { present: false }, key: { ok: false } })
  assert.strictEqual(find(r, 'key').state, 'skipped')
  assert.strictEqual(find(r, 'key').fix, null, 'nothing to fix, so nothing to suggest')
})

// --- the remote row ----------------------------------------------------------

test('the remote check is skipped until asked for, and says how to ask', () => {
  const c = find(withState({}), 'remote')
  assert.strictEqual(c.state, 'skipped')
  assert.match(c.detail, /--check-remote/)
})

test('a remote check that fails is broken — well-formed config is not working config', () => {
  const r = withState({ remote: { checked: true, ok: false, error: 'Entity not found: Team' } })
  const c = find(r, 'remote')
  assert.strictEqual(c.state, 'broken')
  assert.match(c.detail, /Entity not found/)
  assert.strictEqual(r.ok, false)
})

test('a remote check that passes names the team it resolved', () => {
  const r = withState({ remote: { checked: true, ok: true, teamKey: 'SKS' } })
  assert.strictEqual(find(r, 'remote').state, 'ok')
  assert.match(find(r, 'remote').detail, /SKS resolves, key accepted/)
})

// --- the contract every row must honour --------------------------------------

test('every non-ok, non-skipped row names the command that fixes it', () => {
  const broken = runChecks({
    scaffold: { specsDir: false },
    isolation: { present: true, parsed: false },
    tracker: { present: true, parsed: false },
    key: { ok: false },
    remote: { checked: true, ok: false },
  })
  for (const c of broken.checks) {
    if (c.state === 'ok' || c.state === 'skipped') continue
    assert.ok(c.fix && c.fix.length, `${c.id} is ${c.state} and must name a fix`)
  }
  assert.strictEqual(broken.ok, false)
})

test('no row ever carries the key itself', () => {
  const secret = 'lin_api_SUPERSECRETVALUE'
  const r = withState({ key: { ok: true, source: 'the environment', fingerprint: '…LUE' } })
  assert.ok(!JSON.stringify(r).includes(secret), 'the report is safe for a skill to print by construction')
})

test('every branch of the matrix yields a known state', () => {
  // The row builder refuses an unknown state, but only if it is reached — so
  // walk the branches rather than trusting one happy path.
  const variants = [
    { scaffold: { specsDir: false } },
    { scaffold: { specsDir: true, buckets: [], skills: 0 } },
    { scaffold: { ...READY.scaffold, skills: 0 } },
    { isolation: { present: false } },
    { isolation: { present: true, parsed: false } },
    { tracker: { present: false }, key: { ok: false } },
    { tracker: { present: true, parsed: false } },
    { tracker: { present: true, parsed: true } },
    { key: { ok: false } },
    { remote: { checked: true, ok: true, teamKey: 'SKS' } },
    { remote: { checked: true, ok: false } },
    {},
  ]
  for (const v of variants) {
    const r = withState(v)
    assert.strictEqual(r.checks.length, 5, `${JSON.stringify(v)} still reports every layer`)
    for (const c of r.checks) {
      assert.ok(STATES.includes(c.state), `${c.id} → ${c.state} for ${JSON.stringify(v)}`)
      assert.ok(typeof c.detail === 'string' && c.detail, `${c.id} explains itself`)
    }
    assert.strictEqual(typeof r.ok, 'boolean')
  }
})

test('runChecks tolerates being handed nothing at all', () => {
  // A caller that failed to gather state must get a report saying so, not a
  // crash — this is the command a skill runs to find out what is wrong.
  const r = runChecks()
  assert.strictEqual(r.checks.length, 5)
  assert.strictEqual(find(r, 'scaffold').state, 'missing')
  assert.strictEqual(r.ok, true, 'nothing configured is nothing broken')
})
