'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const reporter = require('./suite-timings.js')

const CWD = path.resolve('/repo')
const ev = (type, file, nesting, ms) => ({ type, data: { file: path.join(CWD, file), nesting, details: { duration_ms: ms } } })

test('files are ranked by the summed time of their top-level tests, slowest first', () => {
  const r = reporter.rank(
    [
      ev('test:pass', 'a.test.js', 0, 100),
      ev('test:pass', 'b.test.js', 0, 300),
      ev('test:fail', 'a.test.js', 0, 250),
    ],
    CWD,
  )
  assert.deepStrictEqual(r.files, [
    { file: 'a.test.js', ms: 350, tests: 2 },
    { file: 'b.test.js', ms: 300, tests: 1 },
  ])
  assert.strictEqual(r.totalMs, 650)
})

// STAYS SILENT: a subtest's time is already inside its parent's, and events
// that are not results say nothing about time.
test('subtests and non-result events add nothing', () => {
  const r = reporter.rank(
    [ev('test:pass', 'a.test.js', 0, 100), ev('test:pass', 'a.test.js', 1, 90), { type: 'test:diagnostic', data: { message: 'x' } }],
    CWD,
  )
  assert.deepStrictEqual(r.files, [{ file: 'a.test.js', ms: 100, tests: 1 }])
})

test('the reporter yields one JSON document', async () => {
  async function* source() {
    yield ev('test:pass', path.relative(process.cwd(), path.join(process.cwd(), 'x.test.js')), 0, 5)
  }
  let out = ''
  for await (const chunk of reporter(source())) out += chunk
  assert.deepStrictEqual(JSON.parse(out).files.map((f) => f.ms), [5])
})

test('the table shows the top N with a total line', () => {
  const lines = reporter.table({ files: [{ file: 'a.test.js', ms: 1500, tests: 3 }, { file: 'b.test.js', ms: 500, tests: 1 }], totalMs: 2000 }, 1)
  assert.deepStrictEqual(lines, ['2 files · 2.0s in tests', '     1.5s     3 tests  a.test.js'])
})
