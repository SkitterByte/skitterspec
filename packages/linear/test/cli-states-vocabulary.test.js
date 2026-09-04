'use strict'

/**
 * `spec-sync states` shows the whole configured vocabulary, not just what the
 * workspace has.
 *
 * The bucket map and the deployment ladder both name Linear states, and Linear
 * silently ignores one it does not recognise. Keeping the ladder only in a
 * config file nobody re-reads is how a renamed column goes unnoticed until a
 * deploy quietly moves nothing — so one command prints both, marked against the
 * live workspace.
 *
 * `--json` is deliberately NOT widened: every caller pipes it into
 * `--workspace-states`, which takes a bare array.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const WORKSPACE = ['Backlog', 'In Progress', 'Done', 'Canceled', 'On Test']

function fixtureRepo(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-vocab-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' }, ...extra }), 'utf-8')
  return dir
}

const fakeLinear = (names = WORKSPACE) => ({
  listIssueStates: async () => names.map((name, i) => ({ id: `s${i}`, name, type: 'started' })),
})

function run(argv, cwd, io = {}) {
  const out = []
  const err = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: (s) => err.push(s) },
    env: { LINEAR_API_KEY: 'lin_api_test' },
    ...io,
  }).then((code) => ({ code, out: out.join(''), err: err.join('') }))
}

test('states lists the declared ladder in order, alongside the bucket map', async () => {
  const dir = fixtureRepo({
    release: { stages: [{ key: 'test', state: 'On Test' }, { key: 'prod', state: 'Done' }] },
  })
  const r = await run(['states'], dir, { adapter: fakeLinear() })

  assert.strictEqual(r.code, 0)
  assert.match(r.out, /states\.complete: Done/)
  assert.match(r.out, /release\.stages: 2 rung\(s\), in order/)
  assert.match(r.out, /1\. test -> On Test/)
  assert.match(r.out, /2\. prod -> Done/)
  assert.ok(r.out.indexOf('1. test') < r.out.indexOf('2. prod'), 'declared order is preserved')
})

test('states marks a rung the workspace does not have', async () => {
  const dir = fixtureRepo({ release: { stages: [{ key: 'demo', state: 'Ready for Demo' }] } })
  const r = await run(['states'], dir, { adapter: fakeLinear() })

  assert.strictEqual(r.code, 0, 'a report, not a refusal — push is where this is fatal')
  assert.match(r.out, /demo -> Ready for Demo\s+<- not in the workspace/)
})

// The STAYS-SILENT case: a project with no ladder must see no mention of one.
test('states says nothing about a ladder that was never declared', async () => {
  const dir = fixtureRepo()
  const r = await run(['states'], dir, { adapter: fakeLinear() })

  assert.strictEqual(r.code, 0)
  assert.match(r.out, /states\.backlog: Backlog/, 'the bucket map still shows')
  assert.ok(!/release\.stages/.test(r.out), 'no empty ladder heading')
  assert.ok(!/rung/.test(r.out))
})

test('--json stays a bare array so it still pipes into --workspace-states', async () => {
  const dir = fixtureRepo({ release: { stages: [{ key: 'test', state: 'On Test' }] } })
  const r = await run(['states', '--json'], dir, { adapter: fakeLinear() })

  assert.strictEqual(r.code, 0)
  assert.deepStrictEqual(JSON.parse(r.out), WORKSPACE)
})
