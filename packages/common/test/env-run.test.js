'use strict'

/**
 * Autonomous runs (feat-autonomous-run): mode/ending precedence and the run
 * record's pure transitions.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const {
  parseRunHeader,
  resolveRun,
  openRun,
  currentPhase,
  recordPhase,
  recordStop,
  recordCompaction,
  endRun,
  compactionSummary,
} = require('../src/env/run.js')
const { mergeConfig, defaultConfig } = (() => {
  const c = require('../src/env/config.js')
  return { mergeConfig: c.mergeConfig, defaultConfig: () => c.loadEnvConfig('/nonexistent-skitterspec-dir').config }
})()

const cfg = (auto) => ({ auto: { default: 'supervised', then: 'pause', maxFixAttempts: 3, ...auto } })

test('the Run: header reads auto and supervised, case-insensitively', () => {
  assert.strictEqual(parseRunHeader('# X\n\n> **Run:** auto\n'), 'auto')
  assert.strictEqual(parseRunHeader('> **Run:** Supervised'), 'supervised')
})

test('a Run: header that is not a mode is cannot-tell, never a mode', () => {
  assert.strictEqual(parseRunHeader('> **Run:** autoo'), null)
  assert.strictEqual(parseRunHeader('> **Run:** auto please'), null)
  assert.strictEqual(parseRunHeader('> **Run:**'), null)
  assert.strictEqual(parseRunHeader('# no header here'), null)
})

test('nothing anywhere resolves to supervised and pause — today, unchanged', () => {
  const r = resolveRun({ config: cfg() })
  assert.deepStrictEqual([r.mode, r.modeFrom, r.then, r.thenFrom, r.maxFixAttempts], ['supervised', 'default', 'pause', 'default', 3])
})

test('precedence: flag > active run > header > config', () => {
  const config = cfg({ default: 'auto', then: 'push' })
  assert.deepStrictEqual(pick(resolveRun({ config })), ['auto', 'config', 'push', 'config'])
  assert.deepStrictEqual(pick(resolveRun({ config, header: 'supervised' })), ['supervised', 'header', 'push', 'config'])
  const active = { active: true, mode: 'auto', then: 'pr' }
  assert.deepStrictEqual(pick(resolveRun({ config, header: 'supervised', active })), ['auto', 'run', 'pr', 'run'])
  assert.deepStrictEqual(
    pick(resolveRun({ config, header: 'auto', active, flags: { supervised: true, then: 'pause' } })),
    ['supervised', 'flag', 'pause', 'flag'],
  )
})

test('an ended run does not speak for the next one', () => {
  const r = resolveRun({ config: cfg(), active: { active: false, mode: 'auto', then: 'pr' } })
  assert.deepStrictEqual(pick(r), ['supervised', 'default', 'pause', 'default'])
})

test('contradictory or unknown flags refuse rather than guess', () => {
  assert.strictEqual(resolveRun({ flags: { auto: true, supervised: true } }).ok, false)
  assert.match(resolveRun({ flags: { then: 'merge' } }).reason, /not an ending/)
})

test('config: auto merges its three keys and drops bad values to the default', () => {
  const base = defaultConfig()
  assert.deepStrictEqual(base.auto, { default: 'supervised', then: 'pause', maxFixAttempts: 3 })
  const good = mergeConfig(defaultConfig(), { auto: { default: 'auto', then: 'pr', maxFixAttempts: 5 } })
  assert.deepStrictEqual(good.auto, { default: 'auto', then: 'pr', maxFixAttempts: 5 })
  const bad = mergeConfig(defaultConfig(), { auto: { default: 'Auto', then: 'merge', maxFixAttempts: -1 } })
  assert.deepStrictEqual(bad.auto, { default: 'supervised', then: 'pause', maxFixAttempts: 3 })
})

test('the record: open, phases, stop, compaction, end', () => {
  const resolved = { mode: 'auto', then: 'pause', maxFixAttempts: 3 }
  let r = openRun(null, resolved, { spec: 'feat-x', at: 't0', startPhase: '2' })
  assert.strictEqual(r.active, true)
  assert.strictEqual(currentPhase(r), 2)
  r = recordCompaction(r, { at: 't1' })
  r = recordPhase(r, { n: 2, commit: 'abc', at: 't2' }).record
  assert.strictEqual(currentPhase(r), 3)
  r = recordStop(r, { reason: 'red after 3', at: 't3' })
  assert.deepStrictEqual(r.stops, [{ phase: 3, reason: 'red after 3', at: 't3' }])
  r = recordCompaction(r, { at: 't4' })
  r = recordCompaction(r, { at: 't5' })
  assert.strictEqual(compactionSummary(r), 'compacted 3×, during phases 2 and 3')
  r = endRun(r, { at: 't6' })
  assert.deepStrictEqual([r.active, r.outcome, r.endedAt], [false, 'pause', 't6'])
})

test('reopening an active run keeps its history', () => {
  const resolved = { mode: 'auto', then: 'pause', maxFixAttempts: 3 }
  let r = openRun(null, resolved, { spec: 'feat-x', at: 't0' })
  r = recordPhase(r, { n: 1, at: 't1' }).record
  const again = openRun(r, { ...resolved, then: 'pr' }, { spec: 'feat-x', at: 't2' })
  assert.strictEqual(again.phases.length, 1)
  assert.strictEqual(again.then, 'pr')
  assert.strictEqual(again.startedAt, 't0')
})

test('a phase that is not a number is refused, and a re-recorded phase replaces itself', () => {
  const r = openRun(null, { mode: 'auto', then: 'pause', maxFixAttempts: 3 }, { spec: 'x', at: 't' })
  assert.strictEqual(recordPhase(r, { n: 'two', at: 't' }).ok, false)
  const twice = recordPhase(recordPhase(r, { n: 1, commit: 'a', at: 't' }).record, { n: 1, commit: 'b', at: 't' }).record
  assert.deepStrictEqual(twice.phases.map((p) => p.commit), ['b'])
})

test('no compactions says nothing', () => {
  assert.strictEqual(compactionSummary({ compactions: [] }), '')
  assert.strictEqual(compactionSummary(null), '')
})

function pick(r) {
  return [r.mode, r.modeFrom, r.then, r.thenFrom]
}
