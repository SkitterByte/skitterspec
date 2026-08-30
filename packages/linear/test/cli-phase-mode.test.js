'use strict'

/**
 * The resolved phase mode as the CLI reports it.
 *
 * `mapping.phases` can now be a per-bucket map, so which mode applied is no
 * longer readable off the config alone — you have to know the spec's bucket too.
 * `push` and `status` say it, and the JSON plan carries it so the skill applying
 * the plan knows as well (warnings go to stderr under `--json`, which is exactly
 * the consumer that would miss them).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

// A linked-config repo with one two-phase spec in `bucket`.
function fixtureRepo(phasesMode, bucket = 'complete') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-phasemode-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' }, mapping: { phases: phasesMode } }), 'utf-8')

  const folder = path.join(dir, 'specs', bucket, 'feat-phased')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(
    path.join(folder, '00-overview.md'),
    '# Phased\n\n## Problem\n\nProse.\n\n## Phases\n\n| # | Phase | Status | File |\n|---|-------|--------|------|\n' +
      '| 1 | Engine | ✅ | [01-engine.md](01-engine.md) |\n| 2 | Cli | ✅ | [02-cli.md](02-cli.md) |\n',
    'utf-8',
  )
  fs.writeFileSync(path.join(folder, '01-engine.md'), '# Phase 1 — Engine ✅\n\n**Goal:** go.\n\n## Tasks\n\n- [x] Ship it\n', 'utf-8')
  fs.writeFileSync(path.join(folder, '02-cli.md'), '# Phase 2 — Cli ✅\n\n**Goal:** print.\n', 'utf-8')
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

test('push names the inline mode, so no sub-issues reads as deliberate', async () => {
  const dir = fixtureRepo('inline')
  const r = await run(['push', 'feat-phased', '--workspace-states', statesFile(dir)], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /phases: inline/)
  assert.match(r.out, /section of this issue's description/, 'says where the phases went')
  assert.match(r.out, /issue: description\/state/, 'the spec issue still pushes')
  assert.ok(!/sub-issues create/.test(r.out), 'and no sub-issue is planned')
  assert.ok(!/phase\(s\) deferred/.test(r.out), 'nothing is being held back')
})

test('status names it too — the read-only report answers the same question', async () => {
  const dir = fixtureRepo('inline')
  const r = await run(['status', 'feat-phased'], dir)
  assert.match(r.out, /phases: inline/)
})

test('the default mode says nothing — the sub-issue lines explain themselves', async () => {
  const dir = fixtureRepo('subissue')
  const r = await run(['push', 'feat-phased', '--workspace-states', statesFile(dir)], dir)
  assert.ok(!/phases: /.test(r.out), 'no line for the mode that needs no explaining')
  assert.match(r.out, /sub-issues create: Engine, Cli/)
})

test('a per-bucket map reports the bucket it resolved through', async () => {
  // The whole reason the line exists: with a map, the config alone no longer
  // tells you which mode a given spec got.
  const map = { backlog: 'subissue', complete: 'inline' }

  const finished = fixtureRepo(map, 'complete')
  const done = await run(['push', 'feat-phased', '--workspace-states', statesFile(finished)], finished)
  assert.match(done.out, /phases: inline/)
  assert.match(done.out, /"complete"/, 'names the bucket that decided it')

  const live = fixtureRepo(map, 'backlog')
  const r = await run(['push', 'feat-phased', '--workspace-states', statesFile(live)], live)
  assert.ok(!/phases: /.test(r.out), 'the same config, the other bucket, the default mode')
  assert.match(r.out, /sub-issues create: Engine, Cli/)
})

test('the JSON plan carries the mode, because --json sends warnings to stderr', async () => {
  const dir = fixtureRepo('inline')
  const r = await run(['push', 'feat-phased', '--json', '--workspace-states', statesFile(dir)], dir)
  const plan = JSON.parse(r.out)
  assert.strictEqual(plan.phaseMode, 'inline')
})

test('the plan always carries a mode — an absent field must not mean subissue', async () => {
  // The skill relaying this should read one field, not learn a default.
  const dir = fixtureRepo('subissue')
  const r = await run(['push', 'feat-phased', '--json', '--workspace-states', statesFile(dir)], dir)
  assert.strictEqual(JSON.parse(r.out).phaseMode, 'subissue')
})

test('deferred still gets its count, and now names the mode as well', async () => {
  const dir = fixtureRepo('deferred', 'backlog')
  const r = await run(['push', 'feat-phased', '--workspace-states', statesFile(dir)], dir)
  assert.match(r.out, /2 phase\(s\) deferred/, 'the existing line is unchanged')
  assert.match(r.out, /phases: deferred/)
  assert.match(r.out, /held back until the spec leaves backlog\/cancelled/)
})
