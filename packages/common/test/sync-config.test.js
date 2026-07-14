'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  loadLinearConfig,
  DEFAULT_CONFIG,
  CONFIG_FILE,
  OWNERSHIP,
} = require('../src/sync/config.js')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-linearcfg-'))
}

function writeConfig(dir, obj) {
  const file = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj), 'utf-8')
}

test('absent config → defaults with present:false (opt-out, no throw)', () => {
  const dir = tmpDir()
  const { config, present } = loadLinearConfig(dir)
  assert.strictEqual(present, false)
  assert.strictEqual(config.mapping.phases, 'milestone')
  assert.strictEqual(config.snapshot.overviewFile, '00-overview.md')
  assert.strictEqual(config.sync.baseDir, 'specs/.core/linear-base')
  assert.strictEqual(config.sync.fieldOwnership.description, 'both')
  assert.strictEqual(config.sync.fieldOwnership.workflowState, 'pull')
  assert.deepStrictEqual(config.sync.localOnlySections, ['State log', 'Changelog', 'Open questions'])
})

test('present config → present:true and merged over defaults', () => {
  const dir = tmpDir()
  writeConfig(dir, { linear: { teamId: 'team_123' }, branch: { pattern: '{identifier}' } })
  const { config, present } = loadLinearConfig(dir)
  assert.strictEqual(present, true)
  assert.strictEqual(config.linear.teamId, 'team_123')
  assert.strictEqual(config.branch.pattern, '{identifier}')
  // untouched defaults
  assert.strictEqual(config.mapping.phases, 'milestone')
  assert.strictEqual(config.sync.fieldOwnership.priority, 'pull')
})

test('fieldOwnership overrides merge onto defaults and add new fields', () => {
  const dir = tmpDir()
  writeConfig(dir, { sync: { fieldOwnership: { description: 'push', customField: 'pull' } } })
  const { config } = loadLinearConfig(dir)
  assert.strictEqual(config.sync.fieldOwnership.description, 'push') // overridden
  assert.strictEqual(config.sync.fieldOwnership.customField, 'pull') // added
  assert.strictEqual(config.sync.fieldOwnership.milestones, 'both') // default kept
})

test('invalid fieldOwnership enum → clear throw', () => {
  const dir = tmpDir()
  writeConfig(dir, { sync: { fieldOwnership: { description: 'sideways' } } })
  assert.throws(
    () => loadLinearConfig(dir),
    /fieldOwnership\.description.*expected one of both\|pull\|push/,
  )
})

test('OWNERSHIP enum is exactly both|pull|push', () => {
  assert.deepStrictEqual([...OWNERSHIP], ['both', 'pull', 'push'])
})

test('localOnlySections override replaces the default list (strings only)', () => {
  const dir = tmpDir()
  writeConfig(dir, { sync: { localOnlySections: ['Notes', '', 42, '  Log  '] } })
  const { config } = loadLinearConfig(dir)
  assert.deepStrictEqual(config.sync.localOnlySections, ['Notes', 'Log'])
})

test('states merge field-by-field', () => {
  const dir = tmpDir()
  writeConfig(dir, { states: { complete: 'Shipped' } })
  const { config } = loadLinearConfig(dir)
  assert.strictEqual(config.states.complete, 'Shipped')
  assert.strictEqual(config.states.backlog, 'Backlog')
})

test('ignores unknown keys for forward-compat', () => {
  const dir = tmpDir()
  writeConfig(dir, { wibble: true, mapping: { unknown: 'x', phases: 'issue' } })
  const { config } = loadLinearConfig(dir)
  assert.strictEqual(config.mapping.phases, 'issue')
  assert.strictEqual(config.wibble, undefined)
  assert.strictEqual(config.mapping.unknown, undefined)
})

test('throws a clear error on malformed JSON', () => {
  const dir = tmpDir()
  const file = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{ not valid json', 'utf-8')
  assert.throws(() => loadLinearConfig(dir), /Invalid .*linear\.config\.json/)
})

test('DEFAULT_CONFIG is exported and deeply frozen', () => {
  assert.ok(Object.isFrozen(DEFAULT_CONFIG))
  assert.ok(Object.isFrozen(DEFAULT_CONFIG.sync))
  assert.ok(Object.isFrozen(DEFAULT_CONFIG.sync.fieldOwnership))
})

test('merging does not mutate DEFAULT_CONFIG', () => {
  const dir = tmpDir()
  writeConfig(dir, { sync: { fieldOwnership: { description: 'push' } } })
  loadLinearConfig(dir)
  assert.strictEqual(DEFAULT_CONFIG.sync.fieldOwnership.description, 'both')
})
