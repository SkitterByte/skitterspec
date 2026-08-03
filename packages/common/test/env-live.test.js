'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  receiptPath,
  renderReceipt,
  readReceipt,
  writeReceipt,
  clearReceipt,
  summarizeReceipt,
} = require('../src/env/live.js')
const { assertPrimaryOnMain } = require('../src/env/resolve.js')

const CONFIG = { registry: '.spec-env/registry.json' }

const FIELDS = {
  spec: 'feat-x',
  branch: 'feat/x',
  holder: 'Test',
  heldSince: '2026-08-03T10:00:00Z',
  baseMainCommit: 'abc1234',
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-live-'))
}

// --- receipt: pure + IO ---------------------------------------------------

test('receiptPath is a sibling of the registry (.spec-env/live.json)', () => {
  assert.strictEqual(receiptPath('/repo', CONFIG), path.resolve('/repo', '.spec-env/live.json'))
})

test('renderReceipt normalizes fields and throws on a missing one', () => {
  assert.deepStrictEqual(renderReceipt(FIELDS), { ...FIELDS })
  assert.throws(() => renderReceipt({ ...FIELDS, holder: '' }), /missing holder/)
  assert.throws(() => renderReceipt(null), /missing spec/)
})

test('readReceipt returns null when absent, the object after write', () => {
  const dir = tmpDir()
  assert.strictEqual(readReceipt(dir, CONFIG), null)
  assert.deepStrictEqual(writeReceipt(dir, CONFIG, FIELDS), { ...FIELDS })
  assert.deepStrictEqual(readReceipt(dir, CONFIG), { ...FIELDS })
})

test('readReceipt throws a clear error on malformed JSON', () => {
  const dir = tmpDir()
  const file = receiptPath(dir, CONFIG)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{ not json')
  assert.throws(() => readReceipt(dir, CONFIG), /Invalid live receipt/)
})

test('clearReceipt removes the file and is idempotent', () => {
  const dir = tmpDir()
  writeReceipt(dir, CONFIG, FIELDS)
  clearReceipt(dir, CONFIG)
  assert.strictEqual(readReceipt(dir, CONFIG), null)
  assert.doesNotThrow(() => clearReceipt(dir, CONFIG)) // absent → clean no-op
})

test('summarizeReceipt describes the free state and a held one', () => {
  assert.match(summarizeReceipt(null), /free/)
  assert.match(summarizeReceipt(FIELDS), /feat-x/)
  assert.match(summarizeReceipt(FIELDS), /held by Test/)
})

// --- the guard ------------------------------------------------------------

// Fake git: only answers the current-branch query, like the real reader.
function fakeGit(branch) {
  return (argv) => (argv.join(' ') === 'symbolic-ref --short HEAD' ? branch : null)
}

test('assertPrimaryOnMain reports free when on the base branch', () => {
  const r = assertPrimaryOnMain({ baseBranch: 'main' }, fakeGit('main'))
  assert.deepStrictEqual(r, { onBase: true, branch: 'main', baseBranch: 'main' })
})

test('assertPrimaryOnMain reports a feature in control off base', () => {
  const r = assertPrimaryOnMain({ baseBranch: 'main' }, fakeGit('feat/x'))
  assert.deepStrictEqual(r, { onBase: false, branch: 'feat/x', baseBranch: 'main' })
})

test('assertPrimaryOnMain treats a detached HEAD as not-on-base', () => {
  const r = assertPrimaryOnMain({ baseBranch: 'main' }, fakeGit(null))
  assert.strictEqual(r.onBase, false)
  assert.strictEqual(r.branch, null)
})
