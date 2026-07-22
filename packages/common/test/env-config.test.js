'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { loadEnvConfig, DEFAULT_CONFIG, CONFIG_FILE } = require('../src/env/config.js')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-envcfg-'))
}

function writeEnvConfig(dir, obj) {
  const file = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj), 'utf-8')
}

test('absent config → defaults with present:false (opt-out, no throw)', () => {
  const dir = tmpDir()
  const { config, present } = loadEnvConfig(dir)
  assert.strictEqual(present, false)
  assert.strictEqual(config.docker.portBase, 3000)
  assert.strictEqual(config.docker.portsPerSpec, 10)
  assert.strictEqual(config.worktree.root, '../{repo}-wt')
  assert.strictEqual(config.registry, '.spec-env/registry.json')
  assert.strictEqual(config.branch.pattern, '{type}/{slug}')
  assert.strictEqual(config.branch.identifierField, '')
  assert.strictEqual(config.baseBranch, '')
  assert.strictEqual(config.guards.refuseTeardownIfDirty, true)
})

test('baseBranch defaults to empty and accepts an override', () => {
  const dir = tmpDir()
  assert.strictEqual(loadEnvConfig(dir).config.baseBranch, '')
  writeEnvConfig(dir, { baseBranch: 'develop' })
  assert.strictEqual(loadEnvConfig(dir).config.baseBranch, 'develop')
})

test('present config → present:true and merged over defaults', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    docker: { portBase: 4000 },
    branch: { pattern: '{identifier}-{slug}', identifierField: 'tracker_id' },
  })
  const { config, present } = loadEnvConfig(dir)
  assert.strictEqual(present, true)
  // overridden
  assert.strictEqual(config.docker.portBase, 4000)
  assert.strictEqual(config.branch.pattern, '{identifier}-{slug}')
  assert.strictEqual(config.branch.identifierField, 'tracker_id')
  // untouched defaults
  assert.strictEqual(config.docker.portsPerSpec, 10)
  assert.strictEqual(config.docker.composeFile, 'docker-compose.yml')
})

test('backupCommand accepts an explicit empty string', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { docker: { backupCommand: '' } })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.docker.backupCommand, '')
})

test('open.command defaults to empty and accepts an override', () => {
  const dir = tmpDir()
  assert.strictEqual(loadEnvConfig(dir).config.open.command, '')
  writeEnvConfig(dir, { open: { command: 'code {worktreePath}' } })
  assert.strictEqual(loadEnvConfig(dir).config.open.command, 'code {worktreePath}')
})

test('nested guards merge field-by-field', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { guards: { refuseTeardownIfUnpushed: false } })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.guards.refuseTeardownIfUnpushed, false)
  assert.strictEqual(config.guards.refuseTeardownIfDirty, true)
})

test('ignores unknown keys for forward-compat', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { wibble: true, docker: { unknown: 'x', portBase: 5000 } })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.docker.portBase, 5000)
  assert.strictEqual(config.wibble, undefined)
  assert.strictEqual(config.docker.unknown, undefined)
})

test('wrong-typed values are ignored (keep the default)', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { docker: { portBase: 'nope', enabled: 'yes' } })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.docker.portBase, 3000)
  assert.strictEqual(config.docker.enabled, true)
})

test('throws a clear error on malformed JSON', () => {
  const dir = tmpDir()
  const file = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{ not valid json', 'utf-8')
  assert.throws(() => loadEnvConfig(dir), /Invalid .*env\.config\.json/)
})

test('dev defaults to an empty array', () => {
  const dir = tmpDir()
  assert.deepStrictEqual(loadEnvConfig(dir).config.dev, [])
})

test('dev entries normalise; required fields kept, optionals passed through', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    dev: [
      {
        name: '  api ',
        command: ' pnpm --filter api dev ',
        portVar: 'API_PORT',
        health: ' http://localhost:{API_PORT}/health ',
        frontPort: 8080,
      },
      { name: 'ui', command: 'pnpm --filter ui dev', portVar: 'PORT' },
    ],
  })
  const { config } = loadEnvConfig(dir)
  assert.deepStrictEqual(config.dev, [
    {
      name: 'api',
      command: 'pnpm --filter api dev',
      portVar: 'API_PORT',
      health: 'http://localhost:{API_PORT}/health',
      frontPort: 8080,
    },
    { name: 'ui', command: 'pnpm --filter ui dev', portVar: 'PORT' },
  ])
})

test('dev drops malformed entries (missing required fields / wrong types)', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    dev: [
      { name: 'ok', command: 'run', portVar: 'PORT' },
      { name: 'no-command', portVar: 'PORT' },
      { command: 'orphan', portVar: 'PORT' },
      { name: 'bad-front', command: 'run', portVar: 'PORT', frontPort: 'nope' },
      'not-an-object',
    ],
  })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.dev.length, 2)
  assert.strictEqual(config.dev[0].name, 'ok')
  // frontPort of wrong type is simply omitted, entry otherwise kept
  assert.strictEqual(config.dev[1].name, 'bad-front')
  assert.ok(!('frontPort' in config.dev[1]))
})

test('proxy defaults and merges field-by-field', () => {
  const dir = tmpDir()
  assert.deepStrictEqual(loadEnvConfig(dir).config.proxy, { enabled: true, host: '127.0.0.1' })
  writeEnvConfig(dir, { proxy: { enabled: false } })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.proxy.enabled, false)
  assert.strictEqual(config.proxy.host, '127.0.0.1') // untouched default
})

test('DEFAULT_CONFIG is exported and frozen', () => {
  assert.ok(Object.isFrozen(DEFAULT_CONFIG))
  assert.ok(Object.isFrozen(DEFAULT_CONFIG.docker))
})

test('merging does not mutate DEFAULT_CONFIG', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { docker: { portBase: 9000 } })
  loadEnvConfig(dir)
  assert.strictEqual(DEFAULT_CONFIG.docker.portBase, 3000)
})
