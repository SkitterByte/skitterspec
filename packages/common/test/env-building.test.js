'use strict'

// The primary-checkout leak guard's pure core.
//
// This check ACCUSES — it exits non-zero and tells you your work went to the
// wrong tree — so `.claude/rules/negative-checks.md` applies in full. The
// stays-silent tests below are the load-bearing half: a guard that fires on the
// leak is easy, and a guard that fires on everyone else is worse than nothing.

const { test } = require('node:test')
const assert = require('node:assert')

const { mergePaths, buildBaseline, compare, sameTree } = require('../src/env/building.js')

const WT = '/repo-wt/thing'
const PRIMARY = '/repo'
const at = (overrides = {}) => ({ spec: 'feat-thing', worktreePath: WT, primary: PRIMARY, ...overrides })
const baselineOf = (paths, overrides = {}) =>
  buildBaseline({ spec: 'feat-thing', worktreePath: WT, primary: PRIMARY, paths, ...overrides })

// --- mergePaths --------------------------------------------------------------

test('mergePaths merges, dedupes, sorts and drops blanks', () => {
  assert.deepStrictEqual(mergePaths('b.js\na.js\n', 'a.js\n\nc.js'), ['a.js', 'b.js', 'c.js'])
  assert.deepStrictEqual(mergePaths('', null, undefined), [])
})

// REGRESSION: the first implementation read `git status --porcelain` and sliced
// off two status columns plus a space. The repo's gitReader TRIMS its stdout, so
// the first line lost its leading space and the slice ate the first character —
// the guard reported `ackages/common/...` and told you to go move a file that
// does not exist. Nothing here may take a fixed number of characters off a path.
test('mergePaths never strips characters from a path', () => {
  assert.deepStrictEqual(mergePaths('packages/common/test/a.test.js'), [
    'packages/common/test/a.test.js',
  ])
  assert.deepStrictEqual(mergePaths(' leading-space-name.md'), ['leading-space-name.md'])
})

test('sameTree compares resolved paths, not strings', () => {
  assert.ok(sameTree('/repo', '/repo/'))
  assert.ok(sameTree('/repo/x/..', '/repo'))
  assert.ok(!sameTree('/repo', '/repo-wt/thing'))
})

// --- it fires ----------------------------------------------------------------

test('a path that appeared since the baseline is named, and only that path', () => {
  const r = compare(baselineOf(['already-open.md']), ['already-open.md', 'leaked.js'], at())
  assert.strictEqual(r.verdict, 'leaked')
  assert.deepStrictEqual(r.paths, ['leaked.js'])
})

test('several leaked paths come back sorted, so the message is stable', () => {
  const r = compare(baselineOf([]), ['z.js', 'a.js'], at())
  assert.strictEqual(r.verdict, 'leaked')
  assert.deepStrictEqual(r.paths, ['a.js', 'z.js'])
})

// --- it stays silent ---------------------------------------------------------
//
// One test per healthy-but-unusual input (rule 3). Each of these is a real
// situation someone can be in while doing nothing wrong whatsoever.

test('stays silent: the primary checkout is clean and was clean', () => {
  assert.strictEqual(compare(baselineOf([]), [], at()).verdict, 'clean')
})

test('stays silent: a path dirty BEFORE the build is not a leak', () => {
  // Someone left an unrelated edit open in another window. A bare "the primary
  // must be clean" check would accuse them; that is why a baseline exists.
  const r = compare(baselineOf(['notes.md']), ['notes.md'], at())
  assert.strictEqual(r.verdict, 'clean')
  assert.deepStrictEqual(r.paths, [])
})

test('stays silent: no baseline was recorded — cannot tell, so does not accuse', () => {
  const r = compare(null, ['anything.js'], at())
  assert.strictEqual(r.verdict, 'unknown')
  assert.match(r.reason, /no baseline/)
})

test('stays silent: the baseline belongs to a different spec', () => {
  const r = compare(baselineOf([], { spec: 'feat-other' }), ['x.js'], at())
  assert.strictEqual(r.verdict, 'unknown')
  assert.match(r.reason, /feat-other/)
})

test('stays silent: the baseline records a different worktree for this spec', () => {
  const r = compare(baselineOf([], { worktreePath: '/repo-wt/stale' }), ['x.js'], at())
  assert.strictEqual(r.verdict, 'unknown')
  assert.match(r.reason, /different worktree/)
})

test('stays silent: checkout mode, where the worktree IS the primary checkout', () => {
  // There is no second tree, so every file the build writes is in the primary by
  // design. Firing here would refuse every checkout-mode build there has ever
  // been — and it is checked FIRST, before the baseline, because a recorded
  // baseline would otherwise make it accuse.
  const r = compare(baselineOf([]), ['built.js'], at({ worktreePath: PRIMARY }))
  assert.strictEqual(r.verdict, 'unknown')
  assert.match(r.reason, /no second tree/)
})

test('buildBaseline sorts its paths, so two recordings of one state match', () => {
  assert.deepStrictEqual(baselineOf(['b', 'a']).paths, ['a', 'b'])
})
