'use strict'

/**
 * Linear drops leading characters from every DATA cell of a markdown table that
 * it renders inside a list item. Measured on probe SKI-28: the loss equals the
 * list-content indent Linear renders at (3 per ordered level, 2 per bullet),
 * whatever indent the source used. The header row is never touched, column-0
 * tables never corrupt, and column count is irrelevant.
 *
 * The engine passes the table through byte-identically, so this is Linear's
 * parser — but the projection is the only place that can stop it reaching there.
 * Nested tables are therefore flattened into shapes SKI-28 proved survive
 * nesting: a bullet list (2 columns) or a fenced block (any other count).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal } = require('../src/normalize.js')
const { flattenNestedTables } = require('../src/tables.js')
const { neutralConfig } = require('./_config.js')

function specWith(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tbl-'))
  const dir = path.join(root, 'specs', 'complete', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), body)
  return { root, dir }
}

// The reporter's exact input: decision 6 of an ordered list, table at indent 3.
const REPORTED = `# Data extraction API

## Decisions

6. **Auth is two headers.** The extractor authenticates with:

   | Header | Value |
   |--------|-------|
   | \`X-Extraction-Key\` | shared secret, from Key Vault |
   | \`X-Organisation-Id\` | the tenant to extract |

7. Next decision.
`

test('the reported auth-header table survives the projection intact', () => {
  const { dir } = specWith(REPORTED)
  const out = normalizeLocal(dir, neutralConfig()).description

  // Every character Linear ate on SKI-28 is still here.
  assert.match(out, /X-Extraction-Key/, 'lost `X- on the real push')
  assert.match(out, /shared secret, from Key Vault/, 'lost sha on the real push')
  assert.match(out, /X-Organisation-Id/)
  assert.match(out, /the tenant to extract/)

  // And it no longer reaches Linear as an indented table row, which is the only
  // shape that triggers the bug.
  const indentedRow = out.split('\n').filter((l) => /^\s+\|/.test(l))
  assert.deepStrictEqual(indentedRow, [], 'no indented table rows are sent')
})

test('a 2-column nested table becomes a bullet list at the same indent', () => {
  const md = ['1. Item:', '', '   | Header | Value |', '   |--------|-------|', '   | a | b |', ''].join('\n')
  assert.strictEqual(
    flattenNestedTables(md),
    ['1. Item:', '', '   - **Header** — **Value**', '   - a — b', ''].join('\n'),
  )
})

test('a table with any other column count is fenced verbatim', () => {
  const md = ['1. Item:', '', '   | A | B | C |', '   |---|---|---|', '   | a | b | c |', ''].join('\n')
  const out = flattenNestedTables(md)
  assert.match(out, /^ {3}```$/m, 'fenced at the table indent')
  assert.match(out, /^ {3}\| a \| b \| c \|$/m, 'rows kept verbatim inside the fence')
})

test('a column-0 table is left completely alone', () => {
  // The `## Phases` index and every Impact map are column-0 tables. They must
  // project byte-identically or every linked spec re-pushes for nothing.
  const md = ['## Phases', '', '| # | Phase | Status |', '|---|-------|--------|', '| 1 | Engine | ⬜ |', ''].join('\n')
  assert.strictEqual(flattenNestedTables(md), md)
})

test('a table inside a fenced code block is left alone', () => {
  // A spec DOCUMENTING this bug shows the broken table in a fence. Flattening
  // the example would corrupt the documentation of the corruption.
  const md = ['Example:', '', '```', '   | a | b |', '   |---|---|', '   | c | d |', '```', ''].join('\n')
  assert.strictEqual(flattenNestedTables(md), md)
})

test('a 2-space table under a bullet flattens too, though Linear happens to spare it', () => {
  // SKI-28: source indent 2 in an ORDERED list is dedented out of the item and
  // survives; under a BULLET it stays nested and loses 2. Depending on which
  // container it lands in is not a property worth having (Decision 4).
  const md = ['- Item:', '', '  | Header | Value |', '  |--------|-------|', '  | ab | cd |', ''].join('\n')
  const out = flattenNestedTables(md)
  assert.match(out, /^ {2}- ab — cd$/m)
})

test('an indented block with no separator row is not a table', () => {
  const md = ['1. Item:', '', '   | not | a table |', '   | just | pipes |', ''].join('\n')
  assert.strictEqual(flattenNestedTables(md), md)
})

test('a pipe inside inline code does not split a cell', () => {
  const md = ['1. Item:', '', '   | Op | Meaning |', '   |----|---------|', '   | `a | b` | alternation |', ''].join('\n')
  const out = flattenNestedTables(md)
  assert.match(out, /- `a \| b` — alternation/, 'the code span stays one cell')
})

test('flattening never writes to disk', () => {
  // `push` is a generator: the repo markdown is valid and renders fine
  // everywhere else, so the transform exists only in the projection.
  const { dir } = specWith(REPORTED)
  const file = path.join(dir, '00-overview.md')
  const before = fs.readFileSync(file)
  normalizeLocal(dir, neutralConfig())
  assert.deepStrictEqual(fs.readFileSync(file), before, 'the spec file is untouched')
})
