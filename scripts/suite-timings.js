'use strict'

// Which test files cost the most time (chore-fast-windows-suite, phase 1).
//
// NOT named test-*.js: `node --test`'s default glob runs every `test-*.js` as a
// test file, and this one would run as one and fail.
//
// Two uses, one file:
//
//   node --test --test-reporter=./scripts/suite-timings.js \
//               --test-reporter-destination=timings.json
//     a `node --test` reporter. It writes one JSON document: every test file
//     with the summed duration of its top-level tests, slowest first.
//
//   node scripts/suite-timings.js timings.json [--top 30]
//     prints that ranking as a table.
//
// WHAT IT MEASURES: the time inside each file's top-level tests, which is
// where a per-test `git init` scaffold lands. Module-level setup outside any
// test is not counted, and files run concurrently, so the per-file numbers do
// not add up to the suite's wall-clock time. What it is for is the ranking.

const fs = require('node:fs')
const path = require('node:path')

/**
 * Fold `test:pass` / `test:fail` events into per-file totals. Only nesting 0
 * counts: a subtest's duration is already inside its parent's.
 *
 * @returns {{ files: Array<{ file: string, ms: number, tests: number }>, totalMs: number }}
 */
function rank(events, cwd = process.cwd()) {
  const byFile = new Map()
  for (const { type, data: d } of events) {
    if (type !== 'test:pass' && type !== 'test:fail') continue
    if (!d || d.nesting !== 0 || !d.file || !d.details) continue
    const file = path.relative(cwd, d.file).split(path.sep).join('/')
    const row = byFile.get(file) || { file, ms: 0, tests: 0 }
    row.ms += Number(d.details.duration_ms) || 0
    row.tests += 1
    byFile.set(file, row)
  }
  const files = [...byFile.values()]
    .map((r) => ({ ...r, ms: Math.round(r.ms) }))
    .sort((a, b) => b.ms - a.ms || a.file.localeCompare(b.file))
  return { files, totalMs: files.reduce((n, r) => n + r.ms, 0) }
}

/** The ranking as aligned text lines, the top `n` only. */
function table(result, n = 30) {
  const rows = result.files.slice(0, n)
  const lines = [`${result.files.length} files · ${(result.totalMs / 1000).toFixed(1)}s in tests`]
  for (const r of rows) {
    lines.push(`${(r.ms / 1000).toFixed(1).padStart(8)}s  ${String(r.tests).padStart(4)} tests  ${r.file}`)
  }
  return lines
}

module.exports = async function* testTimings(source) {
  const events = []
  for await (const event of source) events.push(event)
  yield JSON.stringify(rank(events), null, 2) + '\n'
}
module.exports.rank = rank
module.exports.table = table

if (require.main === module) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--top')
  const top = at !== -1 ? Number(args[at + 1]) : 30
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--top')
  if (!file) {
    process.stderr.write('usage: node scripts/suite-timings.js <timings.json> [--top N]\n')
    process.exitCode = 2
  } else {
    process.stdout.write(table(JSON.parse(fs.readFileSync(file, 'utf8')), top).join('\n') + '\n')
  }
}
