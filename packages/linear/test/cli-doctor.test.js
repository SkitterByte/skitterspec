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
function configuredRepo({ trackerJson = null, projectId = 'p1' } = {}) {
  const dir = scaffoldedRepo()
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), JSON.stringify({ worktree: {} }), 'utf-8')
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    trackerJson !== null
      ? trackerJson
      : JSON.stringify({ linear: { teamId: 'T1', teamKey: 'SKS', ...(projectId ? { projectId } : {}) } }),
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
  assert.deepEqual(got.checks.map((c) => c.id), ['scaffold', 'isolation', 'tracker', 'project', 'key', 'remote', 'ladder', 'mcp'])
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

const linearThat = (behaviour, project) => ({
  async readTeam(id) {
    if (typeof behaviour === 'function') return behaviour(id)
    return behaviour
  },
  // Only when a test supplies one: an adapter WITHOUT `readProject` is itself a
  // case worth covering (the project stays unexamined rather than accused).
  ...(project === undefined
    ? {}
    : {
        async readProject(id) {
          if (typeof project === 'function') return project(id)
          return project
        },
      }),
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

// --- stays silent on a healthy project ---------------------------------------
//
// doctor EXITS NON-ZERO and skills branch on that, so a false `broken` fails
// other people's automation rather than merely printing a wrong line. Every case
// below is a project with nothing wrong with it.
// See `.claude/rules/negative-checks.md`.

// A credentials store at $XDG_CONFIG_HOME, owner-only as readStore demands.
function storeWith(teams) {
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-doctor-xdg-'))
  const file = path.join(xdg, 'skitterspec', 'credentials.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ teams }), { mode: 0o600 })
  fs.chmodSync(file, 0o600)
  return xdg
}

test('a key from a keyCommand is ok, not missing', async () => {
  // The env var is the FIRST source, not the only one: a key can come from the
  // store or from a command the store runs for a password manager. Reading "env
  // var unset" as "no key" would tell a fully-configured project to set one.
  const xdg = storeWith({ T1: { keyCommand: `printf ${SECRET}` } })
  const r = await run(['doctor'], configuredRepo(), { XDG_CONFIG_HOME: xdg })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /key\s+ok/)
  assert.ok(!r.out.includes(SECRET), 'and still never prints it')
})

test('a keyCommand that fails is reported as failing, not as never set', async () => {
  // Still `missing` — there IS no usable key — but the detail must say why.
  // `no key for SKS` alone sends the user to set a key they already set.
  const xdg = storeWith({ T1: { keyCommand: 'echo nope >&2; exit 3' } })
  const r = await run(['doctor'], configuredRepo(), { XDG_CONFIG_HOME: xdg })
  assert.match(r.out, /key\s+missing/)
  assert.match(r.out, /keyCommand failed/, 'names the real problem')
})

test('an unreachable Linear does not make the project broken', async () => {
  // No answer is not a NO. The setup is unexamined, not wrong — and a laptop off
  // the network must not fail every skill that branches on doctor's exit code.
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat(() => {
      throw new Error('Linear API unreachable: getaddrinfo ENOTFOUND api.linear.app')
    }),
  })
  assert.strictEqual(r.code, 0, 'a network failure is not a setup failure')
  assert.match(r.out, /remote\s+skipped/)
  assert.match(r.out, /could not be reached/, 'still says what happened')
})

test('a rate-limited check is skipped rather than called broken', async () => {
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat(() => {
      throw new Error('Linear rate-limited the request and did not recover')
    }),
  })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /remote\s+skipped/)
})

test('an answered refusal is still broken — the fix did not mute the check', async () => {
  // The counterweight: Linear ANSWERED and refused. That is evidence, and it
  // must still exit 1.
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat(() => {
      throw new Error('Linear rejected the API key')
    }),
  })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /remote\s+broken/)
})

// --- the project row ----------------------------------------------------------
//
// Where specs get FILED. A false positive here either fails a healthy repo's run
// or, worse, says nothing while specs land in another team's project.
// See `.claude/rules/negative-checks.md`.

test('no project configured is missing, not broken, and keeps the run ok', async () => {
  // The live case: a repo that files to the team and picks a project each push
  // (skitterload runs this way). It must never fail the run.
  const r = await run(['doctor'], configuredRepo({ projectId: '' }))
  assert.strictEqual(r.code, 0, 'a declined opt-in exits 0')
  assert.match(r.out, /project\s+missing/)
  assert.match(r.out, /picker asks each push/, 'says what happens instead')
})

test('a configured project is not called ok-against-Linear until it is checked', async () => {
  const r = await run(['doctor'], configuredRepo())
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /project\s+ok/)
  assert.match(r.out, /not checked against Linear/, 'claims only what it established')
})

test('a project that resolves inside the team reports ok, named', async () => {
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat({ id: 'T1', key: 'SKS' }, { id: 'p1', name: 'Platform', teams: [{ id: 'T1', key: 'SKS' }] }),
  })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /project\s+ok\s+"Platform"/)
})

test('a project spanning several teams still belongs to ours', async () => {
  // Membership, not equality: a Linear project can span teams, and treating the
  // first one as THE team would accuse a healthy shared project.
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat({ id: 'T1', key: 'SKS' }, { id: 'p1', name: 'Shared', teams: [{ id: 'T9' }, { id: 'T1' }] }),
  })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /project\s+ok/)
})

test('an unreachable Linear leaves the project unexamined, not broken', async () => {
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat({ id: 'T1', key: 'SKS' }, () => {
      throw new Error('Linear API unreachable: getaddrinfo ENOTFOUND api.linear.app')
    }),
  })
  assert.strictEqual(r.code, 0, 'no answer is not a wrong answer')
  assert.match(r.out, /project\s+ok\s+p1 — configured, not checked/)
})

test('an adapter that cannot read projects leaves the row unexamined', async () => {
  // The gap would be OURS, not the config's. Dressing a missing operation up as
  // Linear refusing the request would accuse the user of our bug.
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat({ id: 'T1', key: 'SKS' }),
  })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /project\s+ok\s+p1 — configured, not checked/)
})

test('a project belonging to another team is broken, and says specs would leave', async () => {
  // The counterweight: this is the case the row exists for, and it must exit 1.
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat({ id: 'T1', key: 'SKS' }, { id: 'p1', name: 'Someone Else', teams: [{ id: 'T9', key: 'OTH' }] }),
  })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /project\s+broken/)
  assert.match(r.out, /not a project of team SKS/)
  assert.match(r.out, /file out of the team/)
})

test('a project id that resolves to nothing is broken', async () => {
  const r = await run(['doctor', '--check-remote'], configuredRepo(), { LINEAR_API_KEY: SECRET }, {
    adapter: linearThat({ id: 'T1', key: 'SKS' }, null),
  })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /project\s+broken/)
  assert.match(r.out, /does not resolve/)
})

// --- --mcp: the two transports must point at the same place --------------------

// The file a skill writes from get_workspace / get_team / get_project.
function mcpFile(dir, facts) {
  const file = path.join(dir, 'mcp.json')
  fs.writeFileSync(file, JSON.stringify(facts), 'utf-8')
  return file
}

test('without --mcp the row is skipped and says how to ask', async () => {
  const r = await run(['doctor'], configuredRepo())
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /mcp\s+skipped/)
  assert.match(r.out, /--mcp <file>/)
})

test('a matching --mcp file reports ok against the config', async () => {
  const dir = configuredRepo()
  const file = mcpFile(dir, { team: { id: 'T1', key: 'SKS' }, project: { id: 'p1', name: 'Platform' } })
  const r = await run(['doctor', '--mcp', file], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /mcp\s+ok/)
})

test('a team the MCP server does not share is broken, naming both', async () => {
  const dir = configuredRepo()
  const file = mcpFile(dir, { team: { id: 'T9', key: 'OTH' } })
  const r = await run(['doctor', '--mcp', file], dir)
  assert.strictEqual(r.code, 1, 'a skill branching on the code must not proceed')
  assert.match(r.out, /mcp\s+broken/)
  assert.match(r.out, /"OTH" \(T9\)/)
  assert.match(r.out, /T1/)
})

test('the API workspace and the MCP workspace are compared under --check-remote', async () => {
  const dir = configuredRepo()
  const file = mcpFile(dir, { workspace: { id: 'org9', name: 'Acme' }, team: { id: 'T1', key: 'SKS' } })
  const r = await run(['doctor', '--check-remote', '--mcp', file], dir, { LINEAR_API_KEY: SECRET }, {
    adapter: {
      async readTeam() {
        return { id: 'T1', key: 'SKS' }
      },
      async readOrganization() {
        return { id: 'org1', name: 'Skitterbyte' }
      },
      async readProject() {
        return { id: 'p1', name: 'Platform', teams: [{ id: 'T1' }] }
      },
    },
  })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /workspace mismatch/)
  assert.ok(!r.out.includes(SECRET), 'and no key in the diagnostic')
})

test('a malformed --mcp file is refused, not guessed at', async () => {
  const dir = configuredRepo()
  const file = path.join(dir, 'mcp.json')
  fs.writeFileSync(file, '{ not json', 'utf-8')
  const r = await run(['doctor', '--mcp', file], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /cannot read --mcp/)
})

test('an --mcp file that is a JSON array is refused with the shape it wants', async () => {
  const dir = configuredRepo()
  const file = mcpFile(dir, ['nope'])
  const r = await run(['doctor', '--mcp', file], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /workspace \/ team \/ project/)
})
