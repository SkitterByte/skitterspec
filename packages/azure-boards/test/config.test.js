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
  assert.strictEqual(merged.releases.workItemType, 'Deployment')
  assert.deepStrictEqual(merged.releases.series, [{ tagPrefix: 'v', envs: { staged: 'Staged' } }])
})

test('a releases.series that is not a list of objects is a named config error', () => {
  assert.throws(
    () => mergeConfig(defaults(), { releases: { series: ['v1'] } }),
    /releases\.series must be a list of objects/,
  )
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
