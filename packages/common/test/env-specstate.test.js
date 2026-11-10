'use strict'

/**
 * `readSpecState` — a spec's bucket, progress and any legacy header, read from
 * the checkout it is given. Every shape returns rather than throws, and the
 * `pull`-era spec with no headers is a healthy answer, never `unknown`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { readSpecState } = require('../src/env/specstate.js')

const ROOT = '/wt'

// An in-memory tree: `{ 'specs/in-progress/feat-x/00-overview.md': '…' }`.
// A directory is any prefix of a file path; anything else throws, as fs does.
function memIo(files) {
  const abs = Object.fromEntries(Object.entries(files).map(([p, c]) => [path.join(ROOT, p), c]))
  return {
    readdir(dir) {
      const prefix = dir + path.sep
      const names = Object.keys(abs)
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length).split(path.sep)[0])
      if (!names.length) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return [...new Set(names)]
    },
    readFile(file) {
      if (typeof abs[file] !== 'string') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return abs[file]
    },
  }
}

const LEGACY_HEADER = '# X\n\n> **Type:** Feature\n> **Status:** In Progress — Phase 2 (started 2026-11-01)\n> **Developer:** Reuben Greaves\n'
const PULL_HEADER = '# X\n\n> **Type:** Feature\n> **Tracker:** https://example.invalid/1\n'
const phase = (n, emoji) => `# Phase ${n} — Thing ${emoji}\n\n> Spec: [00-overview.md](00-overview.md)\n`

test('a normal folder spec: bucket, progress and its headers', () => {
  const io = memIo({
    'specs/in-progress/feat-x/00-overview.md': LEGACY_HEADER,
    'specs/in-progress/feat-x/01-a.md': phase(1, '✅'),
    'specs/in-progress/feat-x/02-b.md': phase(2, '🔄'),
    'specs/in-progress/feat-x/03-c.md': phase(3, '⬜'),
  })
  assert.deepStrictEqual(readSpecState(ROOT, 'feat-x', io), {
    found: true,
    bucket: 'in-progress',
    legacy: false,
    phasesDone: 1,
    phasesTotal: 3,
    currentPhase: 2,
    status: 'In Progress — Phase 2 (started 2026-11-01)',
    developer: 'Reuben Greaves',
    epic: null,
  })
})

test('stays silent: a pull-era spec with no Status or Developer is found, not unknown', () => {
  const io = memIo({
    'specs/in-progress/feat-x/00-overview.md': PULL_HEADER,
    'specs/in-progress/feat-x/01-a.md': phase(1, '🔄'),
  })
  const s = readSpecState(ROOT, 'feat-x', io)
  assert.strictEqual(s.found, true)
  assert.strictEqual('reason' in s, false, 'no diagnostic of any kind')
  assert.strictEqual(s.status, null)
  assert.strictEqual(s.developer, null)
  assert.deepStrictEqual([s.phasesDone, s.phasesTotal, s.currentPhase], [0, 1, 1])
})

test('the — placeholder and an empty value are no developer and no status', () => {
  const io = memIo({ 'specs/backlog/feat-x/00-overview.md': '# X\n\n> **Status:**\n> **Developer:** —\n' })
  const s = readSpecState(ROOT, 'feat-x', io)
  assert.strictEqual(s.status, null)
  assert.strictEqual(s.developer, null)
})

test('a malformed header returns rather than throws', () => {
  const io = memIo({ 'specs/backlog/feat-x/00-overview.md': '# X\n\n> Status: Ready\n> **Developer:**' })
  const s = readSpecState(ROOT, 'feat-x', io)
  assert.strictEqual(s.found, true)
  assert.strictEqual(s.status, null)
})

test('no phase files and no inline phases: progress is null, not zero', () => {
  const io = memIo({ 'specs/backlog/feat-x/00-overview.md': PULL_HEADER })
  const s = readSpecState(ROOT, 'feat-x', io)
  assert.deepStrictEqual([s.phasesDone, s.phasesTotal, s.currentPhase], [null, null, null])
})

test('a legacy overview with inline phases counts them', () => {
  const io = memIo({
    'specs/in-progress/feat-x/00-overview.md': `${LEGACY_HEADER}\n## Phase 1 — A ✅\n\n- [x] a\n\n## Phase 2 — B 🔄\n`,
  })
  const s = readSpecState(ROOT, 'feat-x', io)
  assert.deepStrictEqual([s.phasesDone, s.phasesTotal, s.currentPhase], [1, 2, 2])
})

test('a bare legacy .md is found and marked legacy', () => {
  const io = memIo({ 'specs/in-progress/feat-x.md': `${LEGACY_HEADER}\n## Phase 1 — A ✅\n` })
  const s = readSpecState(ROOT, 'feat-x', io)
  assert.strictEqual(s.found, true)
  assert.strictEqual(s.legacy, true)
  assert.strictEqual(s.bucket, 'in-progress')
  assert.strictEqual(s.phasesDone, 1)
})

test('a missing spec is not found, with a reason, and never throws', () => {
  const s = readSpecState(ROOT, 'feat-x', memIo({}))
  assert.strictEqual(s.found, false)
  assert.match(s.reason, /no spec named feat-x/)
})

test('a folder with no readable overview is not found, naming where', () => {
  const io = memIo({ 'specs/in-progress/feat-x/01-a.md': phase(1, '🔄') })
  const s = readSpecState(ROOT, 'feat-x', io)
  assert.strictEqual(s.found, false)
  assert.match(s.reason, /in-progress\/feat-x has no readable 00-overview\.md/)
})

test('mid git mv the destination bucket wins', () => {
  const io = memIo({
    'specs/backlog/feat-x/00-overview.md': PULL_HEADER,
    'specs/in-progress/feat-x/00-overview.md': PULL_HEADER,
  })
  assert.strictEqual(readSpecState(ROOT, 'feat-x', io).bucket, 'in-progress')
})

test('the real filesystem: reads the root it is given, not anywhere else', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'specstate-'))
  const dir = path.join(root, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), PULL_HEADER)
  fs.writeFileSync(path.join(dir, '01-a.md'), phase(1, '✅'))
  const s = readSpecState(root, 'feat-x')
  assert.strictEqual(s.bucket, 'in-progress')
  assert.strictEqual(s.phasesDone, 1)
})
