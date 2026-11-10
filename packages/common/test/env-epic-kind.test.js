'use strict'

// The `epic-` kind: a spec of specs, an overview with no phase files of its
// own. The prefix is the positive signal — the absence of phase files is what
// a legacy inline-phase spec looks like too, so it must never decide anything.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { resolveSpec, splitPrefix, isEpic, readPhases } = require('../src/env/resolve.js')
const { readSpecState } = require('../src/env/specstate.js')

const config = {
  worktree: { root: '../{repo}-wt', folderPattern: '{slug}' },
  docker: { projectNamePattern: '{repoSlug}_{slug}', portBase: 3000, portsPerSpec: 10 },
  branch: { pattern: '{type}/{slug}', identifierField: '' },
}

function scaffold(folder, { bucket = 'backlog', overview = null, phases = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-epic-'))
  const dir = path.join(root, 'specs', bucket, folder)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), overview || `# ${folder}\n\n> **Type:** Epic\n`)
  for (const [name, text] of phases) fs.writeFileSync(path.join(dir, name), text)
  return { root, dir }
}

test('splitPrefix round-trips the epic- prefix', () => {
  assert.deepStrictEqual(splitPrefix('epic-library-and-sessions'), { type: 'epic', slug: 'library-and-sessions' })
  const { type, slug } = splitPrefix('epic-library-and-sessions')
  assert.strictEqual(`${type}-${slug}`, 'epic-library-and-sessions')
})

// STAYS-SILENT: a near-miss prefix is a healthy legacy name, not an epic.
test('splitPrefix: epics- and an embedded epic stay feat, whole name as slug', () => {
  assert.deepStrictEqual(splitPrefix('epics-foo'), { type: 'feat', slug: 'epics-foo' })
  assert.deepStrictEqual(splitPrefix('feat-epics'), { type: 'feat', slug: 'epics' })
  assert.strictEqual(isEpic('feat-epics'), false)
  assert.strictEqual(isEpic('epics-foo'), false)
})

test('isEpic reads the folder name off a path or a bare name', () => {
  assert.strictEqual(isEpic('epic-x'), true)
  assert.strictEqual(isEpic('/repo/specs/backlog/epic-x'), true)
  assert.strictEqual(isEpic(''), false)
  assert.strictEqual(isEpic(undefined), false)
})

test('resolveSpec: an epic derives an epic/{slug} branch', () => {
  const { root } = scaffold('epic-library-and-sessions')
  const spec = resolveSpec('epic-library-and-sessions', root, config)
  assert.strictEqual(spec.type, 'epic')
  assert.strictEqual(spec.slug, 'library-and-sessions')
  assert.strictEqual(spec.branch, 'epic/library-and-sessions')
})

test('readPhases: an epic with no phase files is valid — no phase to build', () => {
  const { dir } = scaffold('epic-x')
  assert.deepStrictEqual(readPhases(dir), { total: 0, done: 0, hasNextPhase: false, live: null })
})

// STAYS-SILENT: the epic exception must not leak to other kinds. A feature
// with no phase files is still a legacy layout this reader cannot see into.
test('readPhases: a non-epic with no phase files stays cannot-tell', () => {
  const { dir } = scaffold('feat-legacy', { overview: '# Legacy\n\n## Phase 1 — Do it ⬜\n' })
  assert.strictEqual(readPhases(dir), null)
})

test('readSpecState: an epic reports zero phases, not unknown', () => {
  const { root } = scaffold('epic-x', { bucket: 'in-progress' })
  const state = readSpecState(root, 'epic-x')
  assert.strictEqual(state.found, true)
  assert.strictEqual(state.phasesTotal, 0)
  assert.strictEqual(state.phasesDone, 0)
  assert.strictEqual(state.currentPhase, null)
})

// STAYS-SILENT: a legacy overview with no phase headings still reads null.
test('readSpecState: a non-epic with nothing countable stays null', () => {
  const { root } = scaffold('feat-bare', { overview: '# Bare\n\nNo phases here.\n' })
  assert.strictEqual(readSpecState(root, 'feat-bare').phasesTotal, null)
})
