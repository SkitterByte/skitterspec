'use strict'

/**
 * An epic is written WITH its members (`/spec`, "Writing an epic"): one grill,
 * one `--docs` worktree, the epic and every member spec side by side. Read as
 * "this spec's folder and nothing else", the members were foreign, so the tree
 * failed the authoring-page test and the reader was handed an empty epic
 * dashboard with no verdict to press (bug-epic-page-misses-members).
 *
 * A member is owned on a POSITIVE SIGNAL only: its overview, in that same
 * tree, carries `> **Epic:** <this epic>`. Everything else stays foreign — an
 * unreadable overview, another epic's member, and any spec when the subject
 * is not an epic (`.claude/rules/negative-checks.md` rules 1 and 4).
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { classifyDirtyTree } = require('../src/env/classify.js')

const epic = { folder: 'epic-x', bucket: 'backlog', type: 'epic', slug: 'x' }
const config = { branch: { pattern: '{type}/{slug}' }, spec: { companionPaths: [] } }

const overviews = {
  'specs/backlog/feat-a/00-overview.md': '# A\n\n> **Type:** Feature\n> **Epic:** epic-x\n',
  'specs/backlog/feat-b/00-overview.md': '# B\n\n> **Epic:** `epic-x`\n',
  'specs/backlog/feat-other/00-overview.md': '# O\n\n> **Epic:** epic-y\n',
  'specs/backlog/feat-loose/00-overview.md': '# L\n\n> **Type:** Feature\n',
}
const readFile = (p) => (p in overviews ? overviews[p] : null)

const paths = [
  'specs/backlog/epic-x/00-overview.md',
  'specs/backlog/feat-a/00-overview.md',
  'specs/backlog/feat-a/01-one.md',
  'specs/backlog/feat-b/00-overview.md',
]

test('an epic owns the members written beside it in the same tree', () => {
  const r = classifyDirtyTree(epic, paths, config, { readFile })
  assert.deepStrictEqual(r.owned, paths)
  assert.deepStrictEqual(r.foreign, [])
})

test('STAYS SILENT: another epic\'s member and a spec naming no epic stay foreign', () => {
  const more = [...paths, 'specs/backlog/feat-other/00-overview.md', 'specs/backlog/feat-loose/00-overview.md']
  const r = classifyDirtyTree(epic, more, config, { readFile })
  assert.deepStrictEqual(r.foreign, ['specs/backlog/feat-other/00-overview.md', 'specs/backlog/feat-loose/00-overview.md'])
})

test('STAYS SILENT: an overview that cannot be read is cannot-tell, so foreign', () => {
  const r = classifyDirtyTree(epic, ['specs/backlog/feat-gone/01-one.md'], config, { readFile })
  assert.deepStrictEqual(r.foreign, ['specs/backlog/feat-gone/01-one.md'])
})

test('STAYS SILENT: a non-epic spec never claims a member of anything', () => {
  const feat = { folder: 'feat-z', bucket: 'backlog', type: 'feat', slug: 'z' }
  const r = classifyDirtyTree(feat, ['specs/backlog/feat-a/00-overview.md'], config, { readFile })
  assert.deepStrictEqual(r.foreign, ['specs/backlog/feat-a/00-overview.md'])
})

test('STAYS SILENT: code beside the members is still foreign', () => {
  const r = classifyDirtyTree(epic, [...paths, 'src/app.js'], config, { readFile })
  assert.deepStrictEqual(r.foreign, ['src/app.js'])
})

test('without a reader, the old answer: members are foreign', () => {
  const r = classifyDirtyTree(epic, paths, config)
  assert.deepStrictEqual(r.owned, ['specs/backlog/epic-x/00-overview.md'])
})
