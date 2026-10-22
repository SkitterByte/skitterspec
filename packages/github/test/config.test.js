'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  loadGithubConfig,
  mergeConfig,
  defaults,
  closeReasonFor,
  closeReasonForBucket,
  markersFor,
  CONFIG_FILE,
} = require('../src/config.js')

function repoWith(json) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-config-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), typeof json === 'string' ? json : JSON.stringify(json))
  return dir
}

test('an absent config opts out, but still carries the runtime contract', () => {
  const { config, present } = loadGithubConfig(fs.mkdtempSync(path.join(os.tmpdir(), 'gh-none-')))
  assert.strictEqual(present, false)
  assert.strictEqual(typeof config.dialect.canonicalize, 'function')
  assert.strictEqual(config.provider.teamKey, '', 'GitHub refs carry no team key')
  assert.strictEqual(config.fields.identifier, 'github_identifier')
})

test('a full config merges over the defaults', () => {
  const dir = repoWith({
    github: { owner: 'SkitterByte', repo: 'skitterspec', project: 7, statusField: 'State', labels: { phase: 'step' } },
    states: { complete: 'Shipped' },
    intake: { label: 'triage', hotfixLabels: ['prod'] },
    auth: { tokenEnv: 'MY_TOKEN' },
  })
  const { config, present } = loadGithubConfig(dir)
  assert.strictEqual(present, true)
  assert.strictEqual(config.github.project, 7)
  assert.strictEqual(config.github.statusField, 'State')
  assert.deepStrictEqual(config.github.labels, { spec: 'spec', phase: 'step' })
  assert.strictEqual(config.states.complete, 'Shipped')
  assert.strictEqual(config.states.backlog, 'Backlog', 'unnamed buckets keep their defaults')
  assert.deepStrictEqual(config.intake.bugLabels, ['bug'])
  assert.deepStrictEqual(config.intake.hotfixLabels, ['prod'])
  assert.strictEqual(config.auth.tokenEnv, 'MY_TOKEN')
})

test('the board number may be pasted as a string, and is refused when it is not one', () => {
  assert.strictEqual(mergeConfig(defaults(), { github: { project: '12' } }).github.project, 12)
  assert.strictEqual(mergeConfig(defaults(), { github: { project: null } }).github.project, null)
  assert.throws(() => mergeConfig(defaults(), { github: { project: 'PVT_kwHO' } }), /board number/)
  assert.throws(() => mergeConfig(defaults(), { github: { project: 0 } }), /board number/)
})

test('an invalid transport or task mapping is a named refusal', () => {
  assert.throws(() => mergeConfig(defaults(), { apply: { transport: 'gh' } }), /apply\.transport/)
  assert.throws(() => mergeConfig(defaults(), { mapping: { tasks: 'bullets' } }), /mapping\.tasks/)
})

test('unparseable JSON names the file', () => {
  assert.throws(() => loadGithubConfig(repoWith('{ nope')), /github\.config\.json/)
})

test('terminal buckets close the issue, others leave it open', () => {
  const { config } = loadGithubConfig(repoWith({ states: { complete: 'Shipped' } }))
  assert.strictEqual(closeReasonFor(config, 'Shipped'), 'completed')
  assert.strictEqual(closeReasonFor(config, 'shipped'), 'completed', 'case-insensitive, like the board')
  assert.strictEqual(closeReasonFor(config, 'Cancelled'), 'not_planned')
  assert.strictEqual(closeReasonFor(config, 'In Progress'), null)
  assert.strictEqual(closeReasonFor(config, ''), null)
  assert.strictEqual(closeReasonForBucket('cancelled'), 'not_planned')
  assert.strictEqual(closeReasonForBucket('backlog'), null)
})

test('spec and phase markers: a label always, an issue type only when configured', () => {
  const plain = defaults()
  assert.deepStrictEqual(markersFor(plain, 'spec'), { labels: ['spec'], type: null })
  const org = mergeConfig(defaults(), { github: { labels: { phase: '' }, issueTypes: { phase: 'Task' } } })
  assert.deepStrictEqual(markersFor(org, 'phase'), { labels: [], type: 'Task' })
})

test('the remote readers take the board Status, not open/closed', () => {
  const { config } = loadGithubConfig(repoWith({ github: { owner: 'o', repo: 'r', project: 7 } }))
  assert.strictEqual(config.remote.stateName({ state: { name: 'In Progress' } }), 'In Progress')
  const raw = {
    state: 'OPEN',
    projectItems: { nodes: [{ project: { number: 3 }, fieldValueByName: { name: 'Other' } }, { project: { number: 7 }, fieldValueByName: { name: 'Done' } }] },
  }
  // A raw GraphQL issue has `state: "OPEN"` — a string, not the board's value.
  assert.strictEqual(config.remote.stateName({ ...raw, state: undefined }), 'Done')
  assert.strictEqual(config.remote.stateName({ projectItems: { nodes: [] } }), null, 'off the board is no state')
  assert.strictEqual(config.remote.stateName({}), undefined, 'nothing to read is a cannot-tell')
  assert.strictEqual(config.remote.description({ body: null }), '', 'a cleared body is an answer')
  assert.strictEqual(config.remote.description({}), undefined)
})
