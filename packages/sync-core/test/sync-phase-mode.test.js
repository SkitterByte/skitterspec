'use strict'

// `phaseModeFor(bucket, config)` — the single place a spec's phase mode is
// decided, so the projection and the description's `## Phases` index can never
// disagree about one spec.
//
// `mapping.phases` is either a scalar (one mode for the whole repo — what every
// config was before) or a map keyed by lifecycle bucket, because a repo can
// legitimately want assignable sub-issues for work in flight and something else
// for 250 specs that finished long ago.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, phaseModeFor, phasesWithheld } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

const BUCKETS = ['backlog', 'in-progress', 'complete', 'cancelled']

function config(phases, tasks = 'none') {
  const c = neutralConfig()
  c.mapping = { ...c.mapping, phases, tasks }
  return c
}

// A two-phase spec in `bucket`, matching sync-deferred-phases.test.js so the two
// files describe the same shape.
function specTree(bucket) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phasemode-'))
  const dir = path.join(root, 'specs', bucket, 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    '# Demo\n\n## Problem\n\nBody prose.\n\n## Phases\n\n' +
      '| # | Phase | Status | File |\n|---|-------|--------|------|\n' +
      '| 1 | Outbox | ⬜ | [01-outbox.md](01-outbox.md) |\n' +
      '| 2 | Api | ⬜ | [02-api.md](02-api.md) |\n',
  )
  for (const [file, name] of [['01-outbox', 'Outbox'], ['02-api', 'Api']]) {
    fs.writeFileSync(path.join(dir, `${file}.md`), `# Phase — ${name} ⬜\n\n**Goal:** do ${name}.\n`)
  }
  return { root, dir }
}

test('a scalar resolves identically for every bucket — the compatibility guarantee', () => {
  // Every config that exists today is a scalar. Whatever per-bucket resolution
  // adds, a scalar must keep meaning exactly what it meant: one mode, repo-wide.
  for (const mode of ['subissue', 'deferred']) {
    for (const bucket of BUCKETS) {
      assert.strictEqual(phaseModeFor(bucket, config(mode)), mode, `${mode} @ ${bucket}`)
    }
  }
})

test('a map resolves per bucket', () => {
  const cfg = config({ backlog: 'deferred', 'in-progress': 'subissue', complete: 'deferred' })
  assert.strictEqual(phaseModeFor('backlog', cfg), 'deferred')
  assert.strictEqual(phaseModeFor('in-progress', cfg), 'subissue')
  assert.strictEqual(phaseModeFor('complete', cfg), 'deferred')
})

test('a bucket the map omits defaults to subissue — a partial map is additive', () => {
  // The alternative, defaulting to the first named mode or to "withhold", would
  // make naming ONE bucket silently change the other three.
  const cfg = config({ complete: 'deferred' })
  assert.strictEqual(phaseModeFor('complete', cfg), 'deferred')
  for (const bucket of ['backlog', 'in-progress', 'cancelled']) {
    assert.strictEqual(phaseModeFor(bucket, cfg), 'subissue', bucket)
  }
})

test('an absent or malformed mapping.phases resolves to subissue', () => {
  // The engine takes config as plain data from whichever provider loaded it, so
  // it must not throw on a shape its own loader would have rejected.
  assert.strictEqual(phaseModeFor('backlog', {}), 'subissue')
  assert.strictEqual(phaseModeFor('backlog', { mapping: {} }), 'subissue')
  assert.strictEqual(phaseModeFor('backlog', config(['deferred'])), 'subissue')
  assert.strictEqual(phaseModeFor('backlog', config(null)), 'subissue')
})

test('a status outside the lifecycle buckets falls back to subissue under a map', () => {
  // `spec_status` frontmatter can pin any string; an unrecognised one is not a
  // key in the map, and must not be read as "the map said nothing, withhold".
  const cfg = config({ backlog: 'deferred' })
  assert.strictEqual(phaseModeFor('shipped', cfg), 'subissue')
})

test('the projection reads the resolver: a map defers only the buckets it names', () => {
  const cfg = config({ backlog: 'deferred' })
  const { dir: backlog } = specTree('backlog')
  assert.deepStrictEqual(normalizeLocal(backlog, cfg).subIssues, [], 'named bucket defers')
  assert.strictEqual(phasesWithheld(backlog, cfg), 2)

  const { dir: cancelled } = specTree('cancelled')
  assert.strictEqual(normalizeLocal(cancelled, cfg).subIssues.length, 2, 'unnamed bucket does not')
  assert.strictEqual(phasesWithheld(cancelled, cfg), 0)
})

test('deferred in a started bucket still withholds nothing — its meaning is unchanged', () => {
  // Per-bucket resolution picks the MODE; it does not redefine `deferred`, whose
  // whole point is "not until the work starts". Naming `complete: deferred` is
  // therefore a no-op, exactly as scalar `deferred` is for a complete spec.
  const cfg = config({ complete: 'deferred' })
  const { dir } = specTree('complete')
  assert.strictEqual(normalizeLocal(dir, cfg).subIssues.length, 2)
  assert.strictEqual(phasesWithheld(dir, cfg), 0)
})

test('the description index follows the map, because withholding does', () => {
  const cfg = config({ backlog: 'deferred' })
  const { dir: backlog } = specTree('backlog')
  const { dir: inProgress } = specTree('in-progress')
  assert.match(normalizeLocal(backlog, cfg).description, /## Phases/, 'the only place they appear')
  assert.doesNotMatch(normalizeLocal(inProgress, cfg).description, /## Phases/, 'sub-issues carry them')
})
