'use strict'

/**
 * `spec-sync verify` — the read-back check. The engine is offline, so
 * `/spec-push` fetches each stored description over MCP and hands it over in a
 * file, mirroring the `--workspace-states` split.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-verify-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')

  const folder = path.join(dir, 'specs', 'in-progress', 'feat-checked')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(
    path.join(folder, '00-overview.md'),
    '# Checked\n\n## Problem\n\nThe header is `X-Extraction-Key` and it matters.\n',
    'utf-8',
  )
  fs.writeFileSync(path.join(folder, '01-engine.md'), '# Phase 1 — Engine ⬜\n\n**Goal:** go.\n', 'utf-8')
  return dir
}

function storedFile(dir, obj) {
  const file = path.join(dir, 'stored.json')
  fs.writeFileSync(file, JSON.stringify(obj), 'utf-8')
  return file
}

function run(argv, cwd) {
  const out = []
  const io = { cwd, out: { write: (s) => out.push(s), isTTY: true }, err: { write: () => {} } }
  return specSync(argv, io).then((code) => ({ code, out: out.join('') }))
}

// What the projection actually sends, so the fixture compares like for like.
function sentDescription(dir) {
  const out = []
  return specSync(['normalize', 'feat-checked'], {
    cwd: dir,
    out: { write: (s) => out.push(s), isTTY: false },
    err: { write: () => {} },
  }).then(() => JSON.parse(out.join('')).description)
}

test('an intact round-trip reports clean', async () => {
  const dir = fixtureRepo()
  const sent = await sentDescription(dir)
  const r = await run(['verify', 'feat-checked', '--stored', storedFile(dir, { issue: sent })], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /round-tripped intact/)
})

test('a dropped character is reported with both sides', async () => {
  const dir = fixtureRepo()
  const sent = await sentDescription(dir)
  const damaged = sent.replace('X-Extraction-Key', 'Extraction-Key')
  const r = await run(['verify', 'feat-checked', '--stored', storedFile(dir, { issue: damaged })], dir)
  assert.strictEqual(r.code, 0, 'warns, never fails')
  assert.match(r.out, /stored different text/)
  assert.match(r.out, /sent:/)
  assert.match(r.out, /stored:/)
  assert.match(r.out, /repo is unchanged/, 'says the source of truth is fine')
})

test('a sub-issue is checked against its phase goal by ref', async () => {
  const dir = fixtureRepo()
  const r = await run(
    ['verify', 'feat-checked', '--stored', storedFile(dir, { subIssues: { '01-engine': '**Goal:** go.' } })],
    dir,
  )
  assert.match(r.out, /round-tripped intact/)
})

test('a stored ref with no matching phase is flagged, not ignored', async () => {
  const dir = fixtureRepo()
  const r = await run(
    ['verify', 'feat-checked', '--stored', storedFile(dir, { subIssues: { '09-ghost': 'whatever' } })],
    dir,
  )
  assert.match(r.out, /no such phase/)
})

test('it refuses without --stored rather than passing silently', async () => {
  const dir = fixtureRepo()
  const r = await run(['verify', 'feat-checked'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /--stored/)
  assert.ok(!/intact/.test(r.out), 'no clean bill of health without evidence')
})

test('a malformed --stored file fails clearly', async () => {
  const dir = fixtureRepo()
  const file = path.join(dir, 'bad.json')
  fs.writeFileSync(file, '{ not json', 'utf-8')
  const r = await run(['verify', 'feat-checked', '--stored', file], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /cannot read --stored/)
})
