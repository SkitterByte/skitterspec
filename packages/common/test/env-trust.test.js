'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { ensureWorktreeDirTrusted, settingsPath } = require('../src/env/trust.js')

const ROOT = '/Users/dev/code/proj-wt'

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-trust-'))
}

function readSettings(dir) {
  return JSON.parse(fs.readFileSync(settingsPath(dir), 'utf-8'))
}

function writeSettings(dir, obj) {
  const file = settingsPath(dir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) + '\n')
}

test('creates settings.local.json when absent', () => {
  const dir = tmpDir()
  const res = ensureWorktreeDirTrusted(dir, ROOT)
  assert.deepStrictEqual(res, { changed: true, reason: 'created' })
  assert.deepStrictEqual(readSettings(dir), {
    permissions: { additionalDirectories: [ROOT] },
  })
})

test('merges into an existing file, preserving permissions.allow and other keys', () => {
  const dir = tmpDir()
  writeSettings(dir, {
    model: 'opus',
    permissions: { allow: ['Bash(npm test *)'] },
  })
  const res = ensureWorktreeDirTrusted(dir, ROOT)
  assert.deepStrictEqual(res, { changed: true, reason: 'added' })
  assert.deepStrictEqual(readSettings(dir), {
    model: 'opus',
    permissions: {
      allow: ['Bash(npm test *)'],
      additionalDirectories: [ROOT],
    },
  })
})

test('appends to an existing additionalDirectories array', () => {
  const dir = tmpDir()
  writeSettings(dir, {
    permissions: { additionalDirectories: ['/other/dir'] },
  })
  ensureWorktreeDirTrusted(dir, ROOT)
  assert.deepStrictEqual(readSettings(dir).permissions.additionalDirectories, [
    '/other/dir',
    ROOT,
  ])
})

test('is idempotent — a second call is a no-op when already present', () => {
  const dir = tmpDir()
  ensureWorktreeDirTrusted(dir, ROOT)
  const res = ensureWorktreeDirTrusted(dir, ROOT)
  assert.deepStrictEqual(res, { changed: false, reason: 'present' })
  assert.deepStrictEqual(readSettings(dir).permissions.additionalDirectories, [ROOT])
})

test('malformed JSON is left untouched and reported, never clobbered', () => {
  const dir = tmpDir()
  writeSettings(dir, 'not json {')
  const res = ensureWorktreeDirTrusted(dir, ROOT)
  assert.deepStrictEqual(res, { changed: false, reason: 'malformed' })
  assert.strictEqual(fs.readFileSync(settingsPath(dir), 'utf-8'), 'not json {')
})

test('handles a file that lacks a permissions key without dropping siblings', () => {
  const dir = tmpDir()
  writeSettings(dir, { theme: 'dark' })
  ensureWorktreeDirTrusted(dir, ROOT)
  assert.deepStrictEqual(readSettings(dir), {
    theme: 'dark',
    permissions: { additionalDirectories: [ROOT] },
  })
})
