'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { dialect, canonicalizeMarkdown, assertBodyFits, MAX_BODY_CHARS } = require('../src/dialect.js')
const { dialectOf } = require('@skitterbyte/skitterspec-sync-core/src/dialect.js')

test('canonicalize unifies bullets and collapses whitespace, nothing more', () => {
  assert.strictEqual(canonicalizeMarkdown('* a  \n+ b\n\n\n\n- [ ] c'), '- a\n- b\n\n- [ ] c')
  assert.strictEqual(canonicalizeMarkdown(null), null)
})

test('task lists and emphasis pass through untouched', () => {
  const text = '- [x] **done** thing\n- [ ] _open_ `code` thing'
  assert.strictEqual(canonicalizeMarkdown(text), text)
})

test('the dialect leaves tables alone: the identity flattenTables applies', () => {
  const d = dialectOf({ dialect })
  const nested = '- item\n\n  | a | b |\n  |---|---|\n  | 1 | 2 |'
  assert.strictEqual(d.flattenTables(nested), nested)
})

test('a ticked box on GitHub reads as a difference, so it is reported as drift', () => {
  const d = dialectOf({ dialect })
  assert.notStrictEqual(d.canonicalForCompare('- [ ] a'), d.canonicalForCompare('- [x] a'))
})

test('a body over the cap is refused, naming the document', () => {
  assert.doesNotThrow(() => assertBodyFits('x'.repeat(MAX_BODY_CHARS), 'spec'))
  assert.throws(() => assertBodyFits('x'.repeat(MAX_BODY_CHARS + 1), '"Big spec"'), /"Big spec" is 65537 characters/)
  assert.doesNotThrow(() => assertBodyFits(null))
})
