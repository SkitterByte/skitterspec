'use strict'

/**
 * `spec-sync doctor` — the command half, over real directories.
 *
 * `doctor.test.js` covers the matrix from literals; this covers what only a real
 * project can show: that the probes read what is actually on disk, that the
 * command survives a repo whose config is broken (the one it most needs to
 * diagnose), and that a key never reaches the output.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const SECRET = 'lin_api_SUPERSECRETVALUE'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-doctor-cli-'))

// A bare directory — nothing installed at all.
const bareRepo = () => tmp()

// specs/ + skills, but no tracker and no isolation.
function scaffoldedRepo() {
  const dir = tmp()
  for (const b of ['backlog', 'in-progress', 'complete', 'cancelled']) {
    fs.mkdirSync(path.join(dir, 'specs', b), { recursive: true })
  }
  for (const s of ['spec', 'spec-go', 'spec-complete']) {
    fs.mkdirSync(path.join(dir, '.claude', 'skills', s), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude', 'skills', s, 'SKILL.md'), `---\nname: ${s}\n---\n`, 'utf-8')
  }
  return dir
}

// Everything: scaffold, isolation, tracker.
function configuredRepo({ trackerJson = null } = {}) {
  const dir = scaffoldedRepo()
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), JSON.stringify({ worktree: {} }), 'utf-8')
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    trackerJson !== null ? trackerJson : JSON.stringify({ linear: { teamId: 'T1', teamKey: 'SKS' } }),
    'utf-8',
  )
  return dir
}

function run(argv, cwd, env = {}) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env,
  }).then((code) => ({ code, out: out.join('') }))
}

// --- what a real directory shows ---------------------------------------------

test('a bare directory reports every layer missing, and exits 0', async () => {
  const r = await run(['doctor'], bareRepo())
  assert.strictEqual(r.code, 0, 'nothing installed is nothing broken')
  assert.match(r.out, /scaffold\s+missing/)
  assert.match(r.out, /isolation\s+missing/)
  assert.match(r.out, /tracker\s+missing/)
  assert.match(r.out, /skitterspec init/, 'and names the command that starts you off')
})

test('a scaffolded repo counts the skills actually on disk', async () => {
  const r = await run(['doctor'], scaffoldedRepo())
  assert.match(r.out, /scaffold\s+ok\s+specs\/ \+ 3 skills installed/)
  assert.match(r.out, /tracker\s+missing/, 'sync is opt-in and not taken')
  assert.strictEqual(r.code, 0)
})

test('a configured repo reports the team it files into', async () => {
  const r = await run(['doctor'], configuredRepo())
  assert.match(r.out, /isolation\s+ok/)
  assert.match(r.out, /tracker\s+ok\s+.*team T1 \(SKS\)/)
  assert.strictEqual(r.code, 0)
})

// --- the case it most needs to survive ---------------------------------------

test('a malformed tracker config is reported, not thrown', async () => {
  // loadLinearConfig throws on bad JSON and the dispatcher short-circuits when
  // no config exists — so doctor is dispatched ahead of both. Without that this
  // is a stack trace on exactly the repo that needs diagnosing.
  const r = await run(['doctor'], configuredRepo({ trackerJson: '{ not json' }))
  assert.strictEqual(r.code, 1, 'configured-but-wrong fails the run')
  assert.match(r.out, /tracker\s+broken/)
  assert.match(r.out, /spec-linear-setup/, 'and names the fix')
})

test('a malformed isolation config is reported too', async () => {
  const dir = configuredRepo()
  fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), '{ oops', 'utf-8')
  const r = await run(['doctor'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /isolation\s+broken/)
})

test('a tracker config with no teamId is broken, not ok', async () => {
  const r = await run(['doctor'], configuredRepo({ trackerJson: JSON.stringify({ linear: {} }) }))
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /tracker\s+broken/)
})

// --- the key ------------------------------------------------------------------

test('a key is reported masked, with its source, and never printed', async () => {
  const r = await run(['doctor'], configuredRepo(), { LINEAR_API_KEY: SECRET })
  assert.match(r.out, /key\s+ok/)
  assert.match(r.out, /…ALUE/, 'the last four characters, not the key')
  assert.match(r.out, /LINEAR_API_KEY/, 'and where it came from')
  assert.ok(!r.out.includes(SECRET), 'the key itself never reaches the output')
})

test('a missing key names the team and the command, without failing the run', async () => {
  const r = await run(['doctor'], configuredRepo())
  assert.strictEqual(r.code, 0, 'a missing opt-in exits 0')
  assert.match(r.out, /key\s+missing/)
  assert.match(r.out, /credentials set/)
  assert.match(r.out, /1 check\(s\) need attention/, 'still reported, though')
})

test('the key row is skipped when there is no tracker at all', async () => {
  const r = await run(['doctor'], scaffoldedRepo(), { LINEAR_API_KEY: SECRET })
  assert.match(r.out, /key\s+skipped/)
})

// --- machine-readable ---------------------------------------------------------

test('--json parses, carries every row, and leaks no key', async () => {
  const r = await run(['doctor', '--json'], configuredRepo(), { LINEAR_API_KEY: SECRET })
  const got = JSON.parse(r.out)
  assert.strictEqual(got.ok, true)
  assert.deepEqual(got.checks.map((c) => c.id), ['scaffold', 'isolation', 'tracker', 'key', 'remote'])
  assert.ok(!r.out.includes(SECRET), 'not in the machine payload either')
})

test('--json exits non-zero on a broken layer, so a skill can branch on it', async () => {
  const r = await run(['doctor', '--json'], configuredRepo({ trackerJson: '{ nope' }))
  assert.strictEqual(r.code, 1)
  assert.strictEqual(JSON.parse(r.out).ok, false)
})

test('doctor runs without a tracker config, where every other subcommand opts out', async () => {
  // Every other spec-sync verb prints "Linear sync not enabled" and returns.
  // doctor has to work there — reporting that IS its job.
  const dir = scaffoldedRepo()
  const other = await run(['linked'], dir)
  assert.match(other.out, /Linear sync not enabled/)
  const r = await run(['doctor'], dir)
  assert.doesNotMatch(r.out, /Linear sync not enabled/, 'doctor reports rather than opting out')
  assert.match(r.out, /scaffold\s+ok/)
  assert.match(r.out, /tracker\s+missing/, 'and says so as a row')
})
