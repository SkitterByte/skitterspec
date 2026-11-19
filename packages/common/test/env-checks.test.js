'use strict'

// `complete.checks` and `spec-env checks`: the project's own end-of-spec
// commands, run in the spec's worktree for `/spec-complete` to relay. Advisory:
// a failure is reported, never fatal, and never stops the next check.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { runChecks, formatChecks } = require('../src/env/checks.js')
const { loadEnvConfig, CONFIG_FILE } = require('../src/env/config.js')

function tmpDir() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-checks-')))
}

const node = (code) => `"${process.execPath}" -e "${code}"`

test('runChecks runs each command in the given cwd and captures its output', () => {
  const dir = tmpDir()
  try {
    const [r] = runChecks([node('console.log(process.cwd())')], { cwd: dir })
    assert.strictEqual(r.status, 'ok')
    assert.strictEqual(r.exit, 0)
    assert.strictEqual(fs.realpathSync.native(r.output), dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a failing check is reported and the next still runs', () => {
  const dir = tmpDir()
  try {
    const results = runChecks([node('console.error(\'boom\'); process.exit(3)'), node('console.log(\'after\')')], { cwd: dir })
    assert.deepStrictEqual(
      results.map((r) => [r.status, r.exit, r.output]),
      [
        ['failed', 3, 'boom'],
        ['ok', 0, 'after'],
      ],
    )
    const text = formatChecks('feat-x', results)
    assert.match(text, /2 check\(s\), 1 failed \(advisory — never blocks a land\)/)
    assert.match(text, /failed \(exit 3\) · /)
    assert.match(text, /\n {4}boom/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('stays silent: nothing configured says so in one line', () => {
  assert.deepStrictEqual(runChecks([], { cwd: os.tmpdir() }), [])
  assert.strictEqual(formatChecks('feat-x', []), 'spec-env checks: feat-x — no completion checks configured')
})

function withConfig(obj, fn) {
  const dir = tmpDir()
  try {
    fs.mkdirSync(path.join(dir, path.dirname(CONFIG_FILE)), { recursive: true })
    fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify(obj))
    fn(loadEnvConfig(dir).config)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('complete.checks is read as a list of command strings', () => {
  withConfig({ complete: { checks: ['node scripts/docs-freshness.js impact', 'npm run lint'] } }, (c) => {
    assert.deepStrictEqual(c.complete.checks, ['node scripts/docs-freshness.js impact', 'npm run lint'])
  })
})

test('stays silent: no key, or a malformed one, means no checks — never a throw', () => {
  withConfig({}, (c) => assert.deepStrictEqual(c.complete.checks, []))
  withConfig({ complete: { checks: 'npm test' } }, (c) => assert.deepStrictEqual(c.complete.checks, []))
  withConfig({ complete: { checks: ['ok', 42, '', null] } }, (c) => assert.deepStrictEqual(c.complete.checks, ['ok']))
})
