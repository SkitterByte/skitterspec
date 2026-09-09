'use strict'

/**
 * `deleteFrontmatter` — removing a key, which its sibling cannot express.
 *
 * `writeFrontmatter` SKIPS nullish values by design: that is what lets a caller
 * patch one field without clearing the ones it left out. The cost is that
 * "remove this key" is inexpressible there — passing null is indistinguishable
 * from not passing it at all. Releasing an assignment needs the key to actually
 * leave the file, because the projection reads PRESENCE, not emptiness: a
 * blanked field would leave a spec claiming to be assigned to nobody in
 * particular, which is a different and worse thing than being unassigned.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { writeFrontmatter, deleteFrontmatter } = require('../src/write.js')
const { neutralConfig } = require('./_config.js')

function specWith(frontmatter) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-delete-'))
  const head = frontmatter ? `---\n${frontmatter}\n---\n\n` : ''
  fs.writeFileSync(path.join(dir, '00-overview.md'), `${head}# Spec\n\n## Problem\n\nProse.\n`, 'utf-8')
  return dir
}

const read = (dir) => fs.readFileSync(path.join(dir, '00-overview.md'), 'utf-8')

test('the named keys go, and the others stay', () => {
  const dir = specWith('linear_identifier: "SKI-7"\nlinear_assignee_id: "user-1"\nlinear_assignee_name: "Jane"')
  const removed = deleteFrontmatter(dir, neutralConfig(), ['linear_assignee_id', 'linear_assignee_name'])
  assert.deepStrictEqual(removed.sort(), ['linear_assignee_id', 'linear_assignee_name'])
  const text = read(dir)
  assert.match(text, /linear_identifier: "SKI-7"/)
  assert.doesNotMatch(text, /linear_assignee/)
})

test('the body survives untouched', () => {
  const dir = specWith('linear_assignee_id: "user-1"')
  deleteFrontmatter(dir, neutralConfig(), ['linear_assignee_id'])
  assert.match(read(dir), /# Spec\n\n## Problem\n\nProse\./)
})

test('emptying the block removes it rather than leaving ---\\n---', () => {
  // Two consecutive rules render as a horizontal rule in most markdown viewers,
  // which would show up in the pushed description as a stray line.
  const dir = specWith('linear_assignee_id: "user-1"')
  deleteFrontmatter(dir, neutralConfig(), ['linear_assignee_id'])
  assert.doesNotMatch(read(dir), /^---/, 'no empty frontmatter block left behind')
})

// --- stays silent ------------------------------------------------------------

test('a key that is not there is a no-op, not an error', () => {
  const dir = specWith('linear_identifier: "SKI-7"')
  const before = read(dir)
  assert.deepStrictEqual(deleteFrontmatter(dir, neutralConfig(), ['linear_assignee_id']), [])
  assert.strictEqual(read(dir), before, 'the file is not even rewritten')
})

test('a file with no frontmatter at all is a no-op', () => {
  const dir = specWith(null)
  const before = read(dir)
  assert.deepStrictEqual(deleteFrontmatter(dir, neutralConfig(), ['linear_assignee_id']), [])
  assert.strictEqual(read(dir), before)
})

// --- the gap this exists for -------------------------------------------------

test('writeFrontmatter cannot remove a key, which is why this function exists', () => {
  const dir = specWith('linear_assignee_id: "user-1"')
  writeFrontmatter(dir, neutralConfig(), { linear_assignee_id: null })
  assert.match(read(dir), /linear_assignee_id: "user-1"/, 'a null patch is skipped, not applied')
})
