'use strict'

/**
 * How the phase-status lint reaches a human.
 *
 * Two properties matter more than the wording:
 *
 *   1. Warnings NEVER go to stdout when stdout is a machine-readable payload.
 *      `/spec-push` pipes `push --json` straight into a JSON parser; a warning
 *      line mixed in there breaks the skill instead of informing anyone.
 *   2. Warnings NEVER block. Every legacy spec in an existing repo trips this,
 *      and a push that refuses to run is a worse outcome than a mirror that is
 *      merely visible-wrong. Exit code stays 0.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

// A repo whose one spec reproduces the field failure: the index row and the
// Status line both say done, the heading says nothing.
function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-warn-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')

  const folder = path.join(dir, 'specs', 'in-progress', 'feat-drifted')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(
    path.join(folder, '00-overview.md'),
    [
      '# Drifted',
      '',
      '## Phases',
      '',
      '| # | Phase | Status | File |',
      '|---|-------|--------|------|',
      '| 1 | Engine | ✅ | [01-engine.md](01-engine.md) |',
      '',
    ].join('\n'),
    'utf-8',
  )
  fs.writeFileSync(
    path.join(folder, '01-engine.md'),
    ['# Phase 1 — Engine', '', '> **Status:** ✅ done', '', '**Goal:** ship it.', ''].join('\n'),
    'utf-8',
  )
  return dir
}

// Collect stdout and stderr separately — the whole point is that they differ.
function run(argv, cwd) {
  const out = []
  const err = []
  const io = {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: (s) => err.push(s) },
  }
  return specSync(argv, io).then((code) => ({ code, out: out.join(''), err: err.join('') }))
}

test('human status output carries the warning inline', async () => {
  const dir = fixtureRepo()
  const r = await run(['status', 'feat-drifted'], dir)
  assert.strictEqual(r.code, 0, 'never blocks')
  assert.match(r.out, /warning 01-engine\.md: no ⬜\/🔄\/✅ in the heading/)
  assert.match(r.out, /projecting as not-started/, 'says the consequence, not just the rule')
})

test('push --json keeps stdout pure JSON and warns on stderr', async () => {
  const dir = fixtureRepo()
  const r = await run(['push', 'feat-drifted', '--json', '--skip-state-check'], dir)
  assert.strictEqual(r.code, 0, 'never blocks')
  assert.doesNotThrow(() => JSON.parse(r.out), `stdout must parse as JSON:\n${r.out}`)
  assert.doesNotMatch(r.out, /warning/, 'no warning leaked into the payload')
  assert.match(r.err, /warning 01-engine\.md/, 'the warning still reached a human')
})

test('normalize keeps stdout pure JSON and warns on stderr', async () => {
  const dir = fixtureRepo()
  const r = await run(['normalize', 'feat-drifted'], dir)
  assert.strictEqual(r.code, 0)
  const projection = JSON.parse(r.out)
  assert.strictEqual(projection.subIssues[0].state, 'backlog', 'the warned-about state')
  assert.doesNotMatch(r.out, /warning/)
  assert.match(r.err, /warning 01-engine\.md/)
})

test('human push output carries the warning above the plan summary', async () => {
  const dir = fixtureRepo()
  const r = await run(['push', 'feat-drifted', '--skip-state-check'], dir)
  assert.strictEqual(r.code, 0)
  const warn = r.out.indexOf('warning 01-engine.md')
  const plan = r.out.search(/sub-issues create|nothing to push/)
  assert.notStrictEqual(warn, -1, 'warned')
  assert.ok(warn < plan, 'the warning is not buried under the plan')
  assert.strictEqual(r.err, '', 'human output does not also duplicate onto stderr')
})

test('a clean spec produces no warnings on either stream', async () => {
  const dir = fixtureRepo()
  const phase = path.join(dir, 'specs', 'in-progress', 'feat-drifted', '01-engine.md')
  fs.writeFileSync(phase, fs.readFileSync(phase, 'utf-8').replace('# Phase 1 — Engine', '# Phase 1 — Engine ✅'))

  const r = await run(['status', 'feat-drifted'], dir)
  assert.strictEqual(r.code, 0)
  assert.doesNotMatch(r.out, /warning/)
  assert.strictEqual(r.err, '')
})
