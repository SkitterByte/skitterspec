'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { mkdtempSync, writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const os = require('node:os')

const {
  loadAzureConfig,
  mergeConfig,
  defaults,
  DEFAULT_CONFIG,
  CONFIG_FILE,
  ENV_CONFIG_DEFAULTS,
  IDENTIFIER_FIELD,
} = require('../src/config.js')

function tmpRepo(configJson) {
  const dir = mkdtempSync(join(os.tmpdir(), 'azure-config-'))
  if (configJson !== undefined) {
    mkdirSync(join(dir, 'specs/.core'), { recursive: true })
    writeFileSync(join(dir, CONFIG_FILE), configJson)
  }
  return dir
}

test('absent config loads defaults, reports present: false, and still carries the runtime', () => {
  const { config, present } = loadAzureConfig(tmpRepo())
  assert.strictEqual(present, false)
  assert.strictEqual(config.azure.workItemType, 'Issue')
  assert.strictEqual(config.states.backlog, 'To Do')
  assert.strictEqual(config.auth.tokenEnv, 'AZURE_DEVOPS_EXT_PAT')
  assert.ok(config.dialect && typeof config.dialect.canonicalize === 'function')
  assert.strictEqual(config.provider.teamKey, 'AB')
})

test('merge copies known keys, ignores unknown ones, strips the org trailing slash', () => {
  const merged = mergeConfig(defaults(), {
    azure: { orgUrl: 'https://dev.azure.com/acme///', project: 'web', childType: 'Task', mystery: 1 },
    states: { backlog: 'New', bogusBucket: 'X' },
    intake: { tag: 'inbox', bugTags: ['bug', 'defect'] },
    refs: { foreignPatterns: ['ERQ-\\d+'] },
    releases: { workItemType: 'Deployment', series: [{ tagPrefix: 'v', envs: { staged: 'Staged' } }] },
    unknownTop: true,
  })
  assert.strictEqual(merged.azure.orgUrl, 'https://dev.azure.com/acme')
  assert.strictEqual(merged.azure.project, 'web')
  assert.strictEqual(merged.azure.mystery, undefined)
  assert.strictEqual(merged.states.backlog, 'New')
  assert.strictEqual(merged.states.bogusBucket, undefined)
  assert.strictEqual(merged.intake.tag, 'inbox')
  assert.deepStrictEqual(merged.intake.bugTags, ['bug', 'defect'])
  assert.deepStrictEqual(merged.refs.foreignPatterns, ['ERQ-\\d+'])
  assert.ok(!('releases' in merged), 'a retired key is ignored like any unknown one')
})

test('an unknown apply.transport is a named config error', () => {
  assert.throws(() => mergeConfig(defaults(), { apply: { transport: 'carrier-pigeon' } }), /apply\.transport/)
})

test('an unknown mapping.tasks is a named config error', () => {
  assert.throws(() => mergeConfig(defaults(), { mapping: { tasks: 'telepathy' } }), /mapping\.tasks/)
})

test('invalid JSON in the config file is a named error', () => {
  assert.throws(() => loadAzureConfig(tmpRepo('{nope')), new RegExp(`Invalid ${CONFIG_FILE.replace(/[./]/g, '\\$&')}`))
})

test('the frontmatter vocabulary and isolation defaults are azure_*', () => {
  assert.strictEqual(IDENTIFIER_FIELD, 'azure_identifier')
  assert.strictEqual(DEFAULT_CONFIG.fields.issueId, 'azure_item_id')
  assert.strictEqual(ENV_CONFIG_DEFAULTS.branch.identifierField, 'azure_identifier')
  assert.deepStrictEqual(ENV_CONFIG_DEFAULTS.spec.companionPaths, [
    'specs/.core/azure-base/{identifier}.base.json',
  ])
})

test('remote hooks read the raw REST shape, format-aware, and fall back to flat', () => {
  const { config } = loadAzureConfig(tmpRepo())
  assert.strictEqual(config.remote.stateName({ fields: { 'System.State': 'Doing' } }), 'Doing')
  assert.strictEqual(config.remote.stateName({ state: { name: 'Done' } }), 'Done')
  assert.strictEqual(
    config.remote.description({
      fields: { 'System.Description': '## md' },
      multilineFieldsFormat: { 'System.Description': 'markdown' },
    }),
    '## md',
  )
  assert.strictEqual(
    config.remote.description({ fields: { 'System.Description': '<div>html era</div>' } }),
    'html era',
  )
  // null IS an answer: the field was fetched and the description is empty.
  assert.strictEqual(config.remote.description({ fields: { 'System.Description': null } }), '')
  assert.strictEqual(config.remote.description({ description: 'flat' }), 'flat')
  assert.strictEqual(config.remote.description({}), undefined)
})

// --- the adoption handoff fixes (bug-azure-boards-adoption-fixes) -------------

test('intake routes by work item type as well as tag: bugTypes/hotfixTypes defaults', () => {
  const { config } = loadAzureConfig(tmpRepo(JSON.stringify({ azure: { orgUrl: 'https://dev.azure.com/a', project: 'p' } })))
  // In Agile/Scrum/CMMI a bug is a TYPE, not a tag — the default routes it.
  assert.deepStrictEqual(config.intake.bugTypes, ['Bug'])
  assert.deepStrictEqual(config.intake.hotfixTypes, [])
})

test('intake type lists merge, and an explicit empty list switches type routing off', () => {
  const { config } = loadAzureConfig(
    tmpRepo(
      JSON.stringify({
        azure: { orgUrl: 'https://dev.azure.com/a', project: 'p' },
        intake: { bugTypes: [], hotfixTypes: ['Incident'] },
      }),
    ),
  )
  assert.deepStrictEqual(config.intake.bugTypes, [])
  assert.deepStrictEqual(config.intake.hotfixTypes, ['Incident'])
})

test('azure.workItemTypeByKind merges and defaults empty', () => {
  const plain = loadAzureConfig(tmpRepo(JSON.stringify({ azure: { orgUrl: 'https://dev.azure.com/a', project: 'p' } }))).config
  assert.deepStrictEqual(plain.azure.workItemTypeByKind, {})
  const { config } = loadAzureConfig(
    tmpRepo(
      JSON.stringify({
        azure: { orgUrl: 'https://dev.azure.com/a', project: 'p', workItemTypeByKind: { bug: 'Bug', hotfix: 'Bug', chore: 'Chore', mystery: 'X' } },
      }),
    ),
  )
  assert.deepStrictEqual(config.azure.workItemTypeByKind, { bug: 'Bug', hotfix: 'Bug', chore: 'Chore' })
})
