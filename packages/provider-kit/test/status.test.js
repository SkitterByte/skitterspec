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

// --- spec-sync ownership -----------------------------------------------------

const { specSyncOwnership } = require('../src/status.js')

const sink = () => {
  const s = { text: '', write: (t) => (s.text += t) }
  return s
}

test('ownership answers both fields, in text and JSON, and always exits 0', () => {
  const config = PROVIDERS[0].config()
  config.sync.fieldOwnership.workflowState = 'pull'
  config.sync.fieldOwnership.assignee = 'none'
  const text = sink()
  assert.strictEqual(specSyncOwnership(config, {}, text), 0)
  assert.strictEqual(text.text, 'spec-sync ownership: status pull · assignee none\n')
  const json = sink()
  assert.strictEqual(specSyncOwnership(config, { json: true }, json), 0)
  assert.deepStrictEqual(JSON.parse(json.text), { workflowState: 'pull', assignee: 'none' })
})

test('ownership reads both as pull under the shipped defaults of every provider', () => {
  for (const p of PROVIDERS) {
    const out = sink()
    specSyncOwnership(p.config(), { json: true }, out)
    assert.deepStrictEqual(JSON.parse(out.text), { workflowState: 'pull', assignee: 'pull' }, p.name)
  }
})

// --- spec-sync board ---------------------------------------------------------

const { specSyncBoard } = require('../src/status.js')

// A GitHub-shaped spec in `bucket`, linked unless told otherwise.
function boardSpec(bucket, { linked = true } = {}) {
  const dir = path.join(empty(), 'specs', bucket, 'feat-demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), `${linked ? '---\ngithub_identifier: "#7"\n---\n\n' : ''}# Demo\n`)
  return dir
}

async function board(snapshotDir, credential, flags = {}) {
  const out = sink()
  const config = PROVIDERS[0].config()
  const code = await specSyncBoard({ snapshotDir, config, credential, flags, out, tracker: 'GitHub' })
  return { code, text: out.text }
}

const reads = (state) => ({ ok: true, adapter: adapterReturning({ state: { name: state }, assignee: null }) })

test('board says one line when the issue is finished and the spec is in flight', async () => {
  const r = await board(boardSpec('in-progress'), reads('Cancelled'))
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.text, 'spec-sync board: #7 is Cancelled on GitHub, but feat-demo is in-progress here — /spec-cancel closes it\n')
  const done = await board(boardSpec('in-progress'), reads('Done'))
  assert.match(done.text, /\/spec-complete closes it/)
})

test('board --json answers every case, so a caller can tell them apart', async () => {
  const r = await board(boardSpec('in-progress'), reads('Done'), { json: true })
  const body = JSON.parse(r.text)
  assert.strictEqual(body.disagrees, true)
  assert.strictEqual(body.cleanup, '/spec-complete')
  assert.strictEqual(body.reading.bucket, 'complete')
  const quiet = JSON.parse((await board(boardSpec('backlog', { linked: false }), reads('Done'), { json: true })).text)
  assert.deepStrictEqual([quiet.reading, quiet.reason], [null, 'not linked'])
})

// STAYS SILENT: healthy or cannot-tell, every one of them, exit 0 and no output.
test('board is silent on agreement, re-planning, and every cannot-tell', async () => {
  const cases = [
    [boardSpec('in-progress'), reads('In Progress')],
    [boardSpec('backlog'), reads('In Progress')],
    [boardSpec('in-progress'), reads('Waiting on legal')],
    [boardSpec('complete'), reads('Done')],
    [boardSpec('in-progress', { linked: false }), reads('Done')],
    [boardSpec('in-progress'), { ok: false, error: 'no token\nset GITHUB_TOKEN' }],
    [boardSpec('in-progress'), { ok: true, adapter: { readIssue: async () => { throw new Error('offline') } } }],
    [boardSpec('in-progress'), { ok: true, adapter: adapterReturning(null) }],
  ]
  for (const [dir, credential] of cases) {
    const r = await board(dir, credential)
    assert.deepStrictEqual(r, { code: 0, text: '' })
  }
})
