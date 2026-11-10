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
  }
  const out = []
  for await (const line of reporter(events())) out.push(line)
  assert.deepStrictEqual(out, [])
})

test('every failure is listed with the first line of its error', async () => {
  async function* events() {
    yield { type: 'test:pass', data: { name: 'ok' } }
    for (let i = 1; i <= 3; i++) yield { type: 'test:fail', data: failure(`boom ${i}\nstack`, { name: `t${i}`, line: i }) }
  }
  const out = []
  for await (const line of reporter(events())) out.push(line)
  assert.strictEqual(out.length, 1)
  assert.match(out[0], /^::error title=3 failing test\(s\) — part 1 of 1::/)
  for (const n of [1, 2, 3]) assert.match(out[0], new RegExp(`a\\.test\\.js:${n} t${n} — boom ${n}`))
})

test('many failures are packed into at most ten annotations, the overflow counted', () => {
  const lines = Array.from({ length: 400 }, (_, i) => `packages/x/test/f.test.js:${i} a fairly long test name number ${i} — ${'x'.repeat(200)}`)
  const { bodies, dropped } = reporter.pack(lines)
  assert.strictEqual(bodies.length, 10, 'GitHub keeps ten per step')
  for (const b of bodies) assert.ok(Buffer.byteLength(b.join('\n')) <= 3800, 'each fits under the message cap')
  assert.strictEqual(bodies.reduce((n, b) => n + b.length, 0) + dropped, 400, 'nothing is lost silently')
})
