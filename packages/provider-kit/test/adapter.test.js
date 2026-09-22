'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { adapterOps, missingOps } = require('../src/adapter.js')

test('missingOps names exactly what the extended adapter lacks', () => {
  const base = { readIssue: () => {}, createIssue: () => {} }
  assert.deepStrictEqual(missingOps(adapterOps(base), { readIssue: () => {} }), ['createIssue'])
  assert.deepStrictEqual(missingOps(adapterOps(base), { ...base, extra: () => {} }), [])
})

test('non-function keys are not ops', () => {
  assert.deepStrictEqual(adapterOps({ a: 1, b: () => {} }), ['b'])
})
