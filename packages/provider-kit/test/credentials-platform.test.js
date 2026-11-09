'use strict'

// The credentials store's permission check (chore-windows-ci). POSIX mode bits
// mean something on Linux and macOS; on Windows Node reports every file as
// 0o666, so the check once refused every store there and no stored credential
// could be read. Asserted with an injected stat, so both platforms are pinned
// from either.

const { test } = require('node:test')
const assert = require('node:assert')

const { readStore } = require('../src/credentials.js')

const statMode = (mode) => () => ({ mode: 0o100000 | mode })
const read = () => '{"version":2}'

test('a group-readable store is refused off Windows', () => {
  const r = readStore('/home/me/.config/skitterspec/credentials.json', { stat: statMode(0o644), read, platform: 'linux' })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.code, 'permissions')
})

test('STAYS SILENT: on Windows the mode bits are not read as an accusation', () => {
  const r = readStore('C:\\Users\\me\\.config\\skitterspec\\credentials.json', { stat: statMode(0o666), read, platform: 'win32' })
  assert.strictEqual(r.ok, true, r.reason)
})

test('STAYS SILENT: an owner-only store reads everywhere', () => {
  for (const platform of ['linux', 'darwin', 'win32']) {
    assert.strictEqual(readStore('/x', { stat: statMode(0o600), read, platform }).ok, true, platform)
  }
})
