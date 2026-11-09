'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const reporter = require('./gh-annotations.js')
const { annotationFor } = reporter

const CWD = path.resolve('/repo')

function failure(message, extra = {}) {
  const cause = new Error(message)
  return {
    name: 'resolve finds the config',
    file: path.join(CWD, 'packages', 'common', 'test', 'a.test.js'),
    line: 40,
    details: { error: { failureType: 'testCodeFailure', cause } },
    ...extra,
  }
}

test('a failing test becomes one ::error line with its file, line and title', () => {
  assert.strictEqual(
    annotationFor(failure('expected x'), CWD),
    '::error file=packages/common/test/a.test.js,line=40,title=resolve finds the config::expected x\n',
  )
})

test('newlines, colons and commas are escaped where GitHub requires', () => {
  const line = annotationFor(failure('a\nb%c', { name: 'x: y, z' }), CWD)
  assert.match(line, /title=x%3A y%2C z::a%0Ab%25c\n$/)
})

test('STAYS SILENT: a parent that failed only because a subtest did adds nothing', () => {
  const d = failure('1 subtest failed')
  d.details.error.failureType = 'subtestsFailed'
  assert.strictEqual(annotationFor(d, CWD), null)
})

test('STAYS SILENT: passing tests and other events print nothing', async () => {
  async function* events() {
    yield { type: 'test:pass', data: { name: 'ok' } }
    yield { type: 'test:diagnostic', data: { message: 'tests 1' } }
    yield { type: 'test:fail', data: failure('boom') }
  }
  const out = []
  for await (const line of reporter(events())) out.push(line)
  assert.strictEqual(out.length, 1)
  assert.match(out[0], /::boom\n$/)
})
