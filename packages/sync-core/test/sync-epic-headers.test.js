'use strict'

// A member spec's `Epic:` and `Waits on:` headers, and an epic's `Lanes:`, read
// off the overview beside `Severity:` and `Incident:`. They are push-time
// extras like those two: never keys on the synced field set, so a spec that
// gains one projects exactly as it did before.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specHeaders, parseWaitsOn, normalizeLocal } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

function writeSpec(name, headerLines) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-epic-')), 'specs', 'backlog', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), ['# A spec', '', ...headerLines, '', '## Problem', '', 'P.', ''].join('\n'))
  return dir
}

test('specHeaders reads Epic and Waits on off a member', () => {
  const dir = writeSpec('feat-gen', [
    '> **Type:** Feature',
    '> **Epic:** epic-library',
    '> **Waits on:** feat-schema, feat-loader phase 1',
  ])
  const h = specHeaders(dir, neutralConfig())
  assert.strictEqual(h.epic, 'epic-library')
  assert.deepStrictEqual(h.waitsOn, [
    { spec: 'feat-schema', phase: null, raw: 'feat-schema' },
    { spec: 'feat-loader', phase: 1, raw: 'feat-loader phase 1' },
  ])
  assert.strictEqual(h.lanes, null)
})

test('specHeaders reads Lanes off an epic', () => {
  const dir = writeSpec('epic-library', ['> **Type:** Epic', '> **Lanes:** 2'])
  assert.strictEqual(specHeaders(dir, neutralConfig()).lanes, 2)
})

test('backticked names are read as the name', () => {
  const dir = writeSpec('feat-gen', ['> **Epic:** `epic-library`', '> **Waits on:** `feat-schema` phase 2'])
  const h = specHeaders(dir, neutralConfig())
  assert.strictEqual(h.epic, 'epic-library')
  assert.deepStrictEqual(h.waitsOn, [{ spec: 'feat-schema', phase: 2, raw: '`feat-schema` phase 2' }])
})

test('Waits on: none and the placeholder are an empty list', () => {
  assert.deepStrictEqual(parseWaitsOn('none'), [])
  assert.deepStrictEqual(parseWaitsOn('None'), [])
  assert.deepStrictEqual(parseWaitsOn('—'), [])
  assert.deepStrictEqual(parseWaitsOn(null), [])
})

// A wait nobody can read must never look like no wait: dropped, it would let
// `epic status` call the member ready. Kept with `spec: null`, it is cannot-tell.
test('a malformed Waits on entry is kept as cannot-tell, never dropped', () => {
  assert.deepStrictEqual(parseWaitsOn('feat-a, the loader once it is done, feat-b phase two'), [
    { spec: 'feat-a', phase: null, raw: 'feat-a' },
    { spec: null, phase: null, raw: 'the loader once it is done' },
    { spec: null, phase: null, raw: 'feat-b phase two' },
  ])
})

test('an unreadable Lanes is no cap, never a guessed one', () => {
  for (const bad of ['0', 'two', '-1', '2.5']) {
    const dir = writeSpec('epic-x', [`> **Lanes:** ${bad}`])
    assert.strictEqual(specHeaders(dir, neutralConfig()).lanes, null, bad)
  }
})

// STAYS-SILENT: the headers are extras, so a member's projection is unchanged
// by carrying them.
test('a member projects exactly as it would without the headers', () => {
  const plain = writeSpec('feat-gen', ['> **Type:** Feature'])
  const member = writeSpec('feat-gen', [
    '> **Type:** Feature',
    '> **Epic:** epic-library',
    '> **Waits on:** feat-schema phase 1',
  ])
  const strip = (d) => d.replace(/^>.*$/gm, '')
  assert.strictEqual(
    strip(normalizeLocal(member, neutralConfig()).description),
    strip(normalizeLocal(plain, neutralConfig()).description),
  )
})

test('an epic with no phase files projects with no sub-issues', () => {
  const dir = writeSpec('epic-library', ['> **Type:** Epic'])
  const local = normalizeLocal(dir, neutralConfig())
  assert.ok(Array.isArray(local.subIssues))
  assert.strictEqual(local.subIssues.length, 0)
})
