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
  // `init` always writes the config templates and the manifest into `.core`, so
  // a scaffolded repo has it — and unlike an empty bucket, git keeps it.
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '.core', '.skitterspec-manifest.json'), '{}', 'utf-8')
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

function run(argv, cwd, env = {}, io = {}) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env,
    ...io,
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

// --- --check-remote: proving the config actually works -----------------------
//
// Well-formed config is not working config: the team id may not resolve and the
// key may be revoked. The invariant across every path below is that neither the
// key nor Linear's own error text reaches the output.

const linearThat = (behaviour) => ({
  async readTeam(id) {
    if (typeof behaviour === 'function') return behaviour(id)
    return behaviour
  },
})

test('--check-remote confirms the team resolves and the key is accepted', async () => {
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat({ id: 'T1', key: 'SKS', name: 'Skitterspec' }),
  })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /remote\s+ok\s+team SKS resolves, key accepted/)
  assert.ok(!r.out.includes(SECRET))
})

test('a rejected key is broken, and never echoes what Linear said', async () => {
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat(() => {
      throw new Error(`Linear rejected the API key (HTTP 401) — sent ${SECRET}`)
    }),
  })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /remote\s+broken/)
  assert.match(r.out, /revoked or for another workspace/, 'our wording')
  assert.ok(!r.out.includes(SECRET), 'even though the API error contained it')
  assert.doesNotMatch(r.out, /HTTP 401/, 'the raw message is not relayed')
})

test('a team that does not resolve is broken, and points at setup', async () => {
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat(() => {
      throw new Error('Linear API error: Entity not found: Team')
    }),
  })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /no team with that id/)
  assert.match(r.out, /spec-linear-setup/)
  assert.doesNotMatch(r.out, /Entity not found/, 'classified, not relayed')
})

test('an unreachable Linear is reported without a fix to offer', async () => {
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat(() => {
      throw new Error('Linear API unreachable: getaddrinfo ENOTFOUND api.linear.app')
    }),
  })
  assert.match(r.out, /could not be reached/)
  assert.doesNotMatch(r.out, /ENOTFOUND/, 'no transport detail leaks')
})

test('an unrecognised failure degrades to a generic line rather than leaking it', async () => {
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat(() => {
      throw new Error(`something odd happened involving ${SECRET}`)
    }),
  })
  assert.match(r.out, /Linear did not accept the request/)
  assert.ok(!r.out.includes(SECRET))
  assert.doesNotMatch(r.out, /something odd/)
})

test('with no key, the remote check is skipped rather than failed', async () => {
  const r = await run(['doctor', '--check-remote'], configuredRepo(), {}, {
    adapter: linearThat(() => {
      throw new Error('should never be called')
    }),
  })
  assert.strictEqual(r.code, 0, 'the key row already owns that problem')
  assert.match(r.out, /remote\s+skipped\s+no key/)
})

test('a renamed team is caught here, and points at retarget', async () => {
  // The config records SKS; Linear now says the team is SKZ. Every stamped
  // identifier in the repo is stale — which is exactly feat-team-key-retarget.
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat({ id: 'T1', key: 'SKZ', name: 'Skitterspec' }),
  })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /the team was renamed/)
  assert.match(r.out, /spec-sync retarget/)
})

test('--check-remote --json carries the remote row and leaks nothing', async () => {
  const r = await run(['doctor', '--check-remote', '--json'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat({ id: 'T1', key: 'SKS' }),
  })
  const got = JSON.parse(r.out)
  assert.strictEqual(got.checks.find((c) => c.id === 'remote').state, 'ok')
  assert.ok(!r.out.includes(SECRET))
})

test('a repo with no spec in progress is not reported as broken', () => {
  // The bug: git does not track empty directories, so `specs/in-progress/`
  // vanishes whenever nothing is in progress. doctor called that broken and
  // exited 1 on a healthy repo.
  const dir = scaffoldedRepo()
  fs.rmdirSync(path.join(dir, 'specs', 'in-progress'))
  return run(['doctor'], dir).then((r) => {
    assert.strictEqual(r.code, 0, 'a healthy repo must not fail the run')
    assert.match(r.out, /scaffold\s+ok/)
    assert.doesNotMatch(r.out, /missing in-progress/)
  })
})

test('a scaffold with no .core is still caught', () => {
  const dir = scaffoldedRepo()
  fs.rmSync(path.join(dir, 'specs', '.core'), { recursive: true, force: true })
  return run(['doctor'], dir).then((r) => {
    assert.strictEqual(r.code, 1)
    assert.match(r.out, /scaffold\s+broken/)
    assert.match(r.out, /\.core/)
  })
})
