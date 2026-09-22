'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { loadJiraConfig, defaults, mergeConfig, CONFIG_FILE } = require('../src/config.js')

function repoWith(configBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-config-'))
  if (configBody !== undefined) {
    const file = path.join(dir, CONFIG_FILE)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, typeof configBody === 'string' ? configBody : JSON.stringify(configBody))
  }
  return dir
}

test('an absent config is present:false and still carries the runtime contract', () => {
  const { config, present } = loadJiraConfig(repoWith())
  assert.strictEqual(present, false)
  assert.strictEqual(typeof config.dialect.canonicalForCompare, 'function')
  assert.strictEqual(config.fields.identifier, 'jira_identifier')
  assert.strictEqual(config.provider.configFile, CONFIG_FILE)
  assert.strictEqual(config.sync.baseDir, 'specs/.core/jira-base')
})

test('site, project and types merge; a trailing slash on the site is trimmed', () => {
  const { config, present } = loadJiraConfig(
    repoWith({ jira: { siteUrl: 'https://acme.atlassian.net/', projectKey: 'PROJ', issueType: 'Story' } }),
  )
  assert.strictEqual(present, true)
  assert.strictEqual(config.jira.siteUrl, 'https://acme.atlassian.net')
  assert.strictEqual(config.jira.projectKey, 'PROJ')
  assert.strictEqual(config.jira.issueType, 'Story')
  assert.strictEqual(config.jira.subtaskType, 'Subtask', 'unset keys keep their defaults')
  assert.strictEqual(config.provider.teamKey, 'PROJ', 'the project key is the identifier prefix')
})

test('states merge onto the four buckets; cancelled defaults to Done', () => {
  const { config } = loadJiraConfig(repoWith({ states: { complete: 'Shipped' } }))
  assert.strictEqual(config.states.complete, 'Shipped')
  assert.strictEqual(config.states.cancelled, 'Done')
})

test('a bad transport is loud, not a silent fallback', () => {
  assert.throws(
    () => loadJiraConfig(repoWith({ apply: { transport: 'carrier-pigeon' } })),
    /apply\.transport = "carrier-pigeon"/,
  )
})

test('a bad mapping.tasks is loud', () => {
  assert.throws(() => mergeConfig(defaults(), { mapping: { tasks: 'sub-tasks' } }), /mapping\.tasks/)
})

test('fieldOwnership validates through the kit helpers', () => {
  assert.throws(() => mergeConfig(defaults(), { sync: { fieldOwnership: { assignee: 'sometimes' } } }), /fieldOwnership\.assignee/)
  const merged = mergeConfig(defaults(), { sync: { fieldOwnership: { assignee: 'none' } } })
  assert.strictEqual(merged.sync.fieldOwnership.assignee, 'none')
})

test('malformed JSON names the file the user edits', () => {
  assert.throws(() => loadJiraConfig(repoWith('{ nope')), new RegExp(CONFIG_FILE.replace(/[/.]/g, '\\$&')))
})

test('fields are not user-configurable — the stamp vocabulary is the contract', () => {
  const merged = mergeConfig(defaults(), { fields: { identifier: 'custom_id' } })
  assert.strictEqual(merged.fields.identifier, 'jira_identifier')
})
