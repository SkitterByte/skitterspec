'use strict'

/**
 * `spec-sync status --remote` reports a deployment stage as position, not drift.
 *
 * The drift line exists to say "Linear disagrees with the repo, and the repo
 * wins next push". Neither half is true of a spec the deploy pipeline has moved
 * on: the repo does not disagree (the spec IS complete), and a finished spec's
 * state no longer re-pushes. Left alone, the line would accuse every deployed
 * spec for as long as it sat in the pipeline.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const LADDER = [{ key: 'test', state: 'On Test' }, { key: 'demo', state: 'Ready for Demo' }]

function fixtureRepo({ stages = null, bucket = 'complete' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-stagestatus-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  const config = { linear: { teamId: 'T1' } }
  if (stages) config.release = { stages }
  fs.writeFileSync(cfg, JSON.stringify(config), 'utf-8')

  const folder = path.join(dir, 'specs', bucket, 'feat-shipped')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(
    path.join(folder, '00-overview.md'),
    '---\nlinear_identifier: "SKI-7"\n---\n\n# Shipped\n\n## Problem\n\nGone.\n\n## Phases\n\n' +
      '| # | Phase | Status | File |\n|---|-------|--------|------|\n| 1 | Engine | ✅ | [01-engine.md](01-engine.md) |\n',
    'utf-8',
  )
  fs.writeFileSync(path.join(folder, '01-engine.md'), '# Phase 1 — Engine ✅\n\n**Goal:** go.\n', 'utf-8')
  return dir
}

function remoteFile(dir, name) {
  const file = path.join(dir, 'remote.json')
  fs.writeFileSync(file, JSON.stringify({ state: { name, type: 'started' } }), 'utf-8')
  return file
}

function run(argv, cwd) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env: {},
  }).then((code) => ({ code, out: out.join('') }))
}

test('a spec sitting on a declared rung reports its stage, not drift', async () => {
  const dir = fixtureRepo({ stages: LADDER })
  const r = await run(['status', 'feat-shipped', '--remote', remoteFile(dir, 'On Test')], dir)

  assert.strictEqual(r.code, 0)
  assert.match(r.out, /stage: Linear is at "On Test" \(release stage "test", past complete\)/)
  assert.ok(!/drift/.test(r.out), 'the deployed spec is not accused')
})

test('a later rung reports too', async () => {
  const dir = fixtureRepo({ stages: LADDER })
  const r = await run(['status', 'feat-shipped', '--remote', remoteFile(dir, 'Ready for Demo')], dir)
  assert.match(r.out, /release stage "demo"/)
})

// The STAYS-SILENT case runs both ways round: a genuinely wrong state must still
// be reported, or this would have replaced an over-eager check with a blind one.
test('a state on no rung is still reported as drift', async () => {
  const dir = fixtureRepo({ stages: LADDER })
  const r = await run(['status', 'feat-shipped', '--remote', remoteFile(dir, 'Blocked')], dir)
  assert.match(r.out, /drift: Linear workflow-state is "blocked"/)
})

test('a matching state still reports no drift', async () => {
  const dir = fixtureRepo({ stages: LADDER })
  const r = await run(['status', 'feat-shipped', '--remote', remoteFile(dir, 'Done')], dir)
  assert.match(r.out, /drift: none/)
})

test('with no ladder declared, the same state reports as drift exactly as before', async () => {
  const dir = fixtureRepo()
  const r = await run(['status', 'feat-shipped', '--remote', remoteFile(dir, 'On Test')], dir)
  assert.match(r.out, /drift: Linear workflow-state is "on test"/)
  assert.ok(!/stage:/.test(r.out))
})
