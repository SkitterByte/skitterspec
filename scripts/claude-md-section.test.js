'use strict'

/**
 * This repo's CLAUDE.md carries the shipped workflow section word for word.
 *
 * `skitterspec update` rewrites everything between the `skitterspec:start` and
 * `skitterspec:end` markers from `packages/common/assets/claude-md-section.md`.
 * The two drifted: paragraphs were written into CLAUDE.md and never into the
 * template, so the next update here deleted them — and every adopter had never
 * had them at all. Whichever side gains a paragraph, the other must gain it in
 * the same commit, or this fails.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test("CLAUDE.md's managed section is the shipped template, exactly", () => {
  const claude = read('CLAUDE.md')
  const start = claude.indexOf('<!-- skitterspec:start -->')
  const end = claude.indexOf('<!-- skitterspec:end -->')
  assert.ok(start !== -1 && end > start, 'CLAUDE.md has both skitterspec markers')
  const managed = claude.slice(start + '<!-- skitterspec:start -->'.length, end).trim()
  const template = read('packages/common/assets/claude-md-section.md').trim()
  assert.strictEqual(
    managed,
    template,
    'CLAUDE.md and claude-md-section.md disagree — edit the template, then run `skitterspec update`',
  )
})
