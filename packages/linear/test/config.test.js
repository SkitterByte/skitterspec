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
} = require('../src/config.js')

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
  assert.strictEqual(config.mapping.specFolder, 'issue')
  assert.strictEqual(config.mapping.phases, 'subissue')
  assert.strictEqual(config.mapping.tasks, 'checklist')
  assert.strictEqual(config.snapshot.overviewFile, '00-overview.md')
  assert.strictEqual(config.sync.baseDir, 'specs/.core/linear-base')
  assert.strictEqual(config.sync.fieldOwnership.description, 'push')
  assert.strictEqual(config.sync.fieldOwnership.workflowState, 'push')
  // One-way: the projection is the spec issue's description + its sub-issues +
  // workflow state. Tasks/priority/labels are not in the set.
  assert.deepStrictEqual(Object.keys(config.sync.fieldOwnership), [
    'description',
    'subIssues',
    'workflowState',
  ])
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
  assert.strictEqual(config.mapping.phases, 'subissue')
  assert.strictEqual(config.sync.fieldOwnership.subIssues, 'push')
})

test('linear.projectId is an optional grouping key (default empty, merges)', () => {
  const dir = tmpDir()
  const { config: def } = loadLinearConfig(dir)
  assert.strictEqual(def.linear.projectId, '')
  assert.strictEqual('initiativeId' in def.linear, false)
  writeConfig(dir, { linear: { projectId: 'proj_abc' } })
  const { config } = loadLinearConfig(dir)
  assert.strictEqual(config.linear.projectId, 'proj_abc')
})

test('fieldOwnership overrides merge onto defaults and add new fields', () => {
  const dir = tmpDir()
  writeConfig(dir, { sync: { fieldOwnership: { description: 'push', customField: 'pull' } } })
  const { config } = loadLinearConfig(dir)
  assert.strictEqual(config.sync.fieldOwnership.description, 'push') // overridden
  assert.strictEqual(config.sync.fieldOwnership.customField, 'pull') // added
  assert.strictEqual(config.sync.fieldOwnership.workflowState, 'push') // default kept
})

test('keyedFields default empty; merge adds keyed collection fields', () => {
  const dir = tmpDir()
  const { config: def } = loadLinearConfig(dir)
  assert.deepStrictEqual(def.sync.keyedFields, {})
  writeConfig(dir, { sync: { keyedFields: { milestones: 'id', tasks: 'id' } } })
  const { config } = loadLinearConfig(dir)
  assert.strictEqual(config.sync.keyedFields.milestones, 'id')
  assert.strictEqual(config.sync.keyedFields.tasks, 'id')
})

test('invalid keyedFields value (not a string id key) → clear throw', () => {
  const dir = tmpDir()
  writeConfig(dir, { sync: { keyedFields: { milestones: true } } })
  assert.throws(
    () => loadLinearConfig(dir),
    /keyedFields\.milestones.*item id property name/,
  )
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
  assert.strictEqual(DEFAULT_CONFIG.sync.fieldOwnership.description, 'push')
})

// --- intake (issue intake: `/spec <ISSUE-REF>`, `/spec --from-issue`) --------

test('absent config → intake defaults to no inbox and no bug routing', () => {
  const { config } = loadLinearConfig(tmpDir())
  assert.strictEqual(config.intake.label, '')
  assert.deepStrictEqual(config.intake.bugLabels, [])
})

test('intake defaults are a fresh copy — mutating one load cannot leak', () => {
  const a = loadLinearConfig(tmpDir()).config
  a.intake.bugLabels.push('leaked')
  const b = loadLinearConfig(tmpDir()).config
  assert.deepStrictEqual(b.intake.bugLabels, [])
  assert.deepStrictEqual(DEFAULT_CONFIG.intake.bugLabels, [])
})

test('intake merges label + bugLabels over the defaults', () => {
  const dir = tmpDir()
  writeConfig(dir, { intake: { label: 'web-app', bugLabels: ['bug', 'defect'] } })
  const { config } = loadLinearConfig(dir)
  assert.strictEqual(config.intake.label, 'web-app')
  assert.deepStrictEqual(config.intake.bugLabels, ['bug', 'defect'])
})

test('intake.bugLabels drops non-strings and trims — never throws', () => {
  const dir = tmpDir()
  writeConfig(dir, { intake: { bugLabels: ['  bug  ', '', 3, null, 'defect'] } })
  const { config } = loadLinearConfig(dir)
  assert.deepStrictEqual(config.intake.bugLabels, ['bug', 'defect'])
})

test('intake.label accepts an explicit empty string (string?), unlike `string`', () => {
  const dir = tmpDir()
  writeConfig(dir, { intake: { label: '' } })
  assert.strictEqual(loadLinearConfig(dir).config.intake.label, '')
})

test('a config with no intake block leaves the defaults intact', () => {
  const dir = tmpDir()
  writeConfig(dir, { linear: { teamId: 'T' } })
  const { config } = loadLinearConfig(dir)
  assert.strictEqual(config.intake.label, '')
  assert.deepStrictEqual(config.intake.bugLabels, [])
})

test('linear.projectId is the picker default — still merged, semantics only', () => {
  const dir = tmpDir()
  writeConfig(dir, { linear: { projectId: 'proj-uuid' } })
  assert.strictEqual(loadLinearConfig(dir).config.linear.projectId, 'proj-uuid')
})

test('mapping.tasks accepts checklist and none', () => {
  for (const mode of ['checklist', 'none']) {
    const dir = tmpDir()
    writeConfig(dir, { mapping: { tasks: mode } })
    assert.strictEqual(loadLinearConfig(dir).config.mapping.tasks, mode)
  }
})

test('an unknown mapping.tasks throws rather than degrading to none', () => {
  // A typo that quietly became `none` would strip every sub-issue's checklist
  // and look deliberate — the same silent degradation the phase-status lint
  // exists to stamp out. Fail loudly, as sync.fieldOwnership already does.
  const dir = tmpDir()
  writeConfig(dir, { mapping: { tasks: 'checklists' } })
  assert.throws(() => loadLinearConfig(dir), /mapping\.tasks/)
})
