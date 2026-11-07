'use strict'

/**
 * `readStatus` across all four providers, each through its own loaded config —
 * so the state mapping is the provider's (`config.remote.stateName`, its own
 * `states` names), and the issue shape is the one its adapter's `readIssue`
 * actually returns.
 *
 * Most of these are cannot-tell and unmapped cases, because those are what a
 * caller could wrongly accuse on (`.claude/rules/negative-checks.md` rule 3).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { readStatus } = require('../src/status.js')

const empty = () => fs.mkdtempSync(path.join(os.tmpdir(), 'read-status-'))

// What each provider's adapter `readIssue` returns for a ticket in the state
// its default config calls `complete`, assigned to someone.
const PROVIDERS = [
  {
    name: 'github',
    config: () => require('../../github/src/config.js').loadGithubConfig(empty()).config,
    issue: (state) => ({ identifier: '#1', state: { name: state }, assignee: { id: 'octo', name: 'Octo Cat' }, open: true }),
  },
  {
    name: 'linear',
    config: () => require('../../linear/src/config.js').loadLinearConfig(empty()).config,
    issue: (state) => ({ identifier: 'ENG-1', state: { id: 's1', name: state }, assignee: { id: 'u1', name: 'Una' } }),
  },
  {
    name: 'jira',
    config: () => require('../../jira/src/config.js').loadJiraConfig(empty()).config,
    issue: (state) => ({ identifier: 'PROJ-1', state: { name: state }, assignee: { id: 'acc-1', name: 'Jo' } }),
  },
  {
    name: 'azure-boards',
    config: () => require('../../azure-boards/src/config.js').loadAzureConfig(empty()).config,
    issue: (state) => ({ identifier: 'AB#1', state: { name: state }, assignee: { id: 'guid-1', name: 'Az', email: 'az@x' } }),
  },
]

const adapterReturning = (issue) => ({ readIssue: async () => issue })

for (const p of PROVIDERS) {
  test(`${p.name}: a mapped state reads as its bucket, with the assignee`, async () => {
    const config = p.config()
    const done = config.states.complete
    const issue = p.issue(done)
    const r = await readStatus({ adapter: adapterReturning(issue), ref: 'X', config })
    const { id, name } = issue.assignee
    assert.deepStrictEqual(r, { ok: true, state: done, bucket: 'complete', assignee: { id, name } })
  })

  test(`${p.name}: an unmapped state reads with bucket null — somewhere the repo does not manage`, async () => {
    const config = p.config()
    const r = await readStatus({ adapter: adapterReturning(p.issue('Blocked by legal')), ref: 'X', config })
    assert.strictEqual(r.ok, true)
    assert.strictEqual(r.state, 'Blocked by legal')
    assert.strictEqual(r.bucket, null)
  })
}

test('cannot-tell: no adapter, no ref, a throw, a missing ticket — never a reading', async () => {
  const config = PROVIDERS[0].config()
  const cases = [
    { adapter: null, ref: '#1' },
    { adapter: adapterReturning({}), ref: '' },
    { adapter: { readIssue: async () => { throw new Error('ECONNRESET\nstack') } }, ref: '#1' },
    { adapter: adapterReturning(null), ref: '#1' },
  ]
  for (const c of cases) {
    const r = await readStatus({ ...c, config })
    assert.strictEqual(r.ok, false)
    assert.ok(r.reason && !r.reason.includes('\n'), 'one line, for a one-line report')
  }
})

test('an unassigned ticket reads assignee null, not a half-empty object', async () => {
  const config = PROVIDERS[0].config()
  const r = await readStatus({ adapter: adapterReturning({ state: { name: 'Backlog' }, assignee: null }), ref: '#1', config })
  assert.strictEqual(r.assignee, null)
  assert.strictEqual(r.bucket, 'backlog')
})
