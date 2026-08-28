'use strict'

/**
 * `mapping.phases: "deferred"` as the CLI reports it.
 *
 * A spec mirrored with no sub-issues has two readings — deliberate deferral, or
 * phase files that failed to parse. `push` and `status` say which, and the JSON
 * plan carries the count so the skill applying it knows too (warnings go to
 * stderr under `--json`, which is exactly the consumer that would miss them).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

// A linked-config repo with one two-phase spec in `bucket`.
function fixtureRepo(phasesMode, bucket = 'backlog') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-defer-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' }, mapping: { phases: phasesMode } }), 'utf-8')

  const folder = path.join(dir, 'specs', bucket, 'feat-phased')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(
    path.join(folder, '00-overview.md'),
    '# Deferred\n\n## Problem\n\nProse.\n\n## Phases\n\n| # | Phase | Status | File |\n|---|-------|--------|------|\n' +
      '| 1 | Engine | ⬜ | [01-engine.md](01-engine.md) |\n| 2 | Cli | ⬜ | [02-cli.md](02-cli.md) |\n',
    'utf-8',
  )
  fs.writeFileSync(path.join(folder, '01-engine.md'), '# Phase 1 — Engine ⬜\n\n**Goal:** go.\n', 'utf-8')
  fs.writeFileSync(path.join(folder, '02-cli.md'), '# Phase 2 — Cli ⬜\n\n**Goal:** print.\n', 'utf-8')
  return dir
}

function statesFile(dir) {
  const file = path.join(dir, 'states.json')
  fs.writeFileSync(file, JSON.stringify(['Backlog', 'In Progress', 'Done', 'Canceled']), 'utf-8')
  return file
}

function run(argv, cwd, isTTY = true) {
  const out = []
  const err = []
  const io = { cwd, out: { write: (s) => out.push(s), isTTY }, err: { write: (s) => err.push(s) } }
  return specSync(argv, io).then((code) => ({ code, out: out.join(''), err: err.join('') }))
}

test('push reports the deferral instead of silently omitting the sub-issues', async () => {
  const dir = fixtureRepo('deferred')
  const r = await run(['push', 'feat-phased', '--workspace-states', statesFile(dir)], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /2 phase\(s\) deferred/, 'says how many and why')
  assert.match(r.out, /has not started/)
  assert.match(r.out, /\/spec-go/, 'says when they arrive')
  assert.match(r.out, /issue: description\/state/, 'the spec issue still pushes')
  assert.ok(!/sub-issues create/.test(r.out), 'and no sub-issue is planned')
})

test('the default mode says nothing about deferral and plans every phase', async () => {
  const dir = fixtureRepo('subissue')
  const r = await run(['push', 'feat-phased', '--workspace-states', statesFile(dir)], dir)
  assert.strictEqual(r.code, 0)
  assert.ok(!/phase\(s\) deferred/.test(r.out), 'no line for a mode that defers nothing')
  assert.match(r.out, /sub-issues create: Engine, Cli/)
})

test('--json carries phasesDeferred on the plan, not in a stderr warning', async () => {
  const dir = fixtureRepo('deferred')
  const r = await run(['push', 'feat-phased', '--workspace-states', statesFile(dir), '--json'], dir, false)
  const plan = JSON.parse(r.out)
  assert.strictEqual(plan.phasesDeferred, 2)
  assert.deepStrictEqual(plan.subIssues.create, [])
  assert.ok(plan.issue, 'the issue is still in the plan')
})

test('status agrees with push about the deferral', async () => {
  const dir = fixtureRepo('deferred')
  const r = await run(['status', 'feat-phased'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /2 phase\(s\) deferred/)
})

test('a started spec defers nothing and plans both phases', async () => {
  const dir = fixtureRepo('deferred', 'in-progress')
  const r = await run(['push', 'feat-phased', '--workspace-states', statesFile(dir)], dir)
  assert.ok(!/phase\(s\) deferred/.test(r.out), 'the deferral is over')
  assert.match(r.out, /sub-issues create: Engine, Cli/)
})
