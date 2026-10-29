'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { prefixOf, rangeFor, issueNumber } = require('./mirror-deployed.cjs')

test('a tag keeps its own series: the prefix runs to the last @', () => {
  assert.strictEqual(prefixOf('skitterspec-github@2.0.0'), 'skitterspec-github@')
  assert.strictEqual(prefixOf('skitterspec@19.0.0'), 'skitterspec@')
  assert.strictEqual(prefixOf('@scope/pkg@1.0.0'), '@scope/pkg@')
})

test('a tag with no series prefix is refused rather than guessed', () => {
  assert.strictEqual(prefixOf('v1.0.0'), null)
  assert.strictEqual(prefixOf('@scope'), null)
})

test('the range runs from the previous tag in the series, or the whole history', () => {
  assert.strictEqual(rangeFor('pkg@1.1.0', 'pkg@1.0.0'), 'pkg@1.0.0..pkg@1.1.0')
  assert.strictEqual(rangeFor('pkg@1.0.0', null), 'pkg@1.0.0')
})

test('only a bare #N is an issue on this repo', () => {
  assert.strictEqual(issueNumber('#12'), 12)
  assert.strictEqual(issueNumber('SKS-12'), null)
  assert.strictEqual(issueNumber('other/repo#12'), null)
})
