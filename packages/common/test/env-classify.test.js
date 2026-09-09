'use strict'

/**
 * `classifyDirtyTree` decides whether `/spec-start` may commit the tree it found
 * or must refuse it, so getting it wrong in one direction commits a file the
 * operator never staged. Most of what follows is therefore the STAYS-SILENT half
 * (`.claude/rules/negative-checks.md` §3): healthy-but-unusual inputs where the
 * right answer is "foreign, refuse" rather than "owned, commit".
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { classifyDirtyTree } = require('../src/env/classify.js')

const SNAPSHOT = 'specs/.core/linear-base/{identifier}.base.json'

// A spec on disk, so the frontmatter reader has something real to read.
function makeSpec({ bucket = 'backlog', folder = 'feat-x', identifier = 'SKS-92' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-'))
  const dir = path.join(root, 'specs', bucket, folder)
  fs.mkdirSync(dir, { recursive: true })
  const fm = identifier ? `---\nlinear_identifier: "${identifier}"\n---\n\n` : ''
  fs.writeFileSync(path.join(dir, '00-overview.md'), `${fm}# Spec\n`)
  return { folder, bucket, path: dir, type: 'feat', slug: folder.replace(/^feat-/, '') }
}

const config = (companionPaths = [], identifierField = 'linear_identifier') => ({
  branch: { pattern: '{type}/{slug}', identifierField },
  spec: { companionPaths },
})

test('a clean tree classifies as nothing at all', () => {
  const r = classifyDirtyTree(makeSpec(), [], config())
  assert.deepStrictEqual(r, { owned: [], foreign: [] })
})

test("the spec's own folder is owned", () => {
  const r = classifyDirtyTree(
    makeSpec(),
    ['specs/backlog/feat-x/00-overview.md', 'specs/backlog/feat-x/01-a.md'],
    config(),
  )
  assert.deepStrictEqual(r.foreign, [])
  assert.strictEqual(r.owned.length, 2)
})

test('an untracked folder entry, trailing slash and all, is owned', () => {
  const r = classifyDirtyTree(makeSpec(), ['specs/backlog/feat-x/'], config())
  assert.deepStrictEqual(r, { owned: ['specs/backlog/feat-x'], foreign: [] })
})

test('a resolved companion path is owned alongside the folder', () => {
  const r = classifyDirtyTree(
    makeSpec(),
    ['specs/backlog/feat-x/00-overview.md', 'specs/.core/linear-base/SKS-92.base.json'],
    config([SNAPSHOT]),
  )
  assert.deepStrictEqual(r.foreign, [])
  assert.strictEqual(r.owned.length, 2)
})

test('a spec mid-move is owned in both buckets at once', () => {
  // `/spec-start` moves backlog → in-progress, so a tree caught mid-move is dirty
  // in two buckets and both halves are the same spec's.
  const r = classifyDirtyTree(
    makeSpec(),
    ['specs/backlog/feat-x/00-overview.md', 'specs/in-progress/feat-x/00-overview.md'],
    config(),
  )
  assert.deepStrictEqual(r.foreign, [])
  assert.strictEqual(r.owned.length, 2)
})

// --- stays silent: the cases that must NOT be swept into a commit -----------

test('one unrelated file makes the whole tree refusable', () => {
  const r = classifyDirtyTree(
    makeSpec(),
    ['specs/backlog/feat-x/00-overview.md', 'src/app.js'],
    config(),
  )
  assert.deepStrictEqual(r.foreign, ['src/app.js'])
})

test("another spec's folder is foreign, however similar the name", () => {
  const r = classifyDirtyTree(
    makeSpec({ folder: 'feat-x' }),
    ['specs/backlog/feat-xylophone/00-overview.md'],
    config(),
  )
  assert.deepStrictEqual(r.owned, [])
  assert.strictEqual(r.foreign.length, 1)
})

test('a companion pattern is foreign when the spec has no identifier', () => {
  // A spec deliberately kept local has no ticket id. The snapshot named by the
  // pattern is therefore some OTHER spec's file, and must never be committed here.
  const r = classifyDirtyTree(
    makeSpec({ identifier: null }),
    ['specs/.core/linear-base/SKS-92.base.json'],
    config([SNAPSHOT]),
  )
  assert.deepStrictEqual(r.owned, [])
  assert.strictEqual(r.foreign.length, 1)
})

test('a companion pattern is foreign when the project set no identifierField', () => {
  const r = classifyDirtyTree(
    makeSpec(),
    ['specs/.core/linear-base/SKS-92.base.json'],
    config([SNAPSHOT], ''),
  )
  assert.deepStrictEqual(r.owned, [])
  assert.strictEqual(r.foreign.length, 1)
})

test("another spec's snapshot is foreign even when ours resolves", () => {
  const r = classifyDirtyTree(
    makeSpec({ identifier: 'SKS-92' }),
    ['specs/.core/linear-base/SKS-97.base.json'],
    config([SNAPSHOT]),
  )
  assert.deepStrictEqual(r.owned, [])
  assert.strictEqual(r.foreign.length, 1)
})

test('with no companionPaths configured, only the folder is owned', () => {
  const r = classifyDirtyTree(
    makeSpec(),
    ['specs/.core/linear-base/SKS-92.base.json'],
    config([]),
  )
  assert.deepStrictEqual(r.owned, [])
  assert.strictEqual(r.foreign.length, 1)
})
