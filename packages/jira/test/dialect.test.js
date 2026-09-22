'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { dialect, canonicalizeMarkdown } = require('../src/dialect.js')

test('canonicalize unifies bullets, trims trailing space, collapses blank runs', () => {
  assert.strictEqual(canonicalizeMarkdown('* a  \n+ b\n\n\n\n- c\n'), '- a\n- b\n\n- c')
})

test('canonicalize leaves emphasis alone — ADF has no straddle mangle', () => {
  const s = '**bold\nacross lines**'
  assert.strictEqual(canonicalizeMarkdown(s), s)
})

test('a table nested in a list item is flattened before the renderer sees it', () => {
  const md = '- item\n  | K | V |\n  |---|---|\n  | X-Key | v |'
  const out = dialect.flattenTables(md)
  assert.doesNotMatch(out, /^\s+\|/m, 'no indented table rows survive')
  assert.match(out, /X-Key/)
})

test('canonicalForCompare makes the reducer’s respellings invisible', () => {
  const sent = '* first\n1. one\n5. five\n- [X] done\n| a | b |\n|-----|-----|'
  const stored = '- first\n1. one\n2. five\n- [x] done\n| a | b |\n| -- |'
  assert.strictEqual(dialect.canonicalForCompare(sent), dialect.canonicalForCompare(stored))
})
