'use strict'

/**
 * `doctor.js` — the readiness matrix, as pure rows.
 *
 * Everything here is driven from literals: the module takes the project's state
 * as an argument precisely so the whole matrix is reachable without scaffolding
 * a dozen temp projects. Phase 2 supplies the real state.
 *
 * The distinction under test throughout is `missing` vs `broken`: declining an
 * opt-in must never read as a failure, while configured-but-wrong must.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { runChecks, STATES } = require('../src/doctor.js')

const READY = {
  scaffold: { specsDir: true, core: true, buckets: ['backlog', 'in-progress', 'complete', 'cancelled'], skills: 12 },
  isolation: { present: true, parsed: true },
  tracker: { present: true, parsed: true, teamId: 'e07c', teamKey: 'SKS' },
  key: { ok: true, source: 'the environment (LINEAR_API_KEY)', fingerprint: '…sCU8' },
  project: { configured: '71179728-5e8d-4b10-9c44-e6b11cb41eb7' },
  remote: { checked: false },
}

const withState = (over) => runChecks({ ...READY, ...over })
const find = (r, id) => r.checks.find((c) => c.id === id)

// --- the happy path ----------------------------------------------------------

test('a fully configured project is ok, with every layer reported', () => {
  const r = withState({})
  assert.strictEqual(r.ok, true)
  assert.deepEqual(
    r.checks.map((c) => c.id),
    ['scaffold', 'isolation', 'tracker', 'project', 'key', 'remote', 'ladder', 'mcp'],
    'all four layers, plus project, remote and the cross-transport row',
  )
  for (const c of r.checks) assert.ok(STATES.includes(c.state), `${c.id} has a known state`)
})

// --- missing is not broken ---------------------------------------------------

test('declining isolation is missing, and keeps the run ok', () => {
  const r = withState({ isolation: { present: false } })
  assert.strictEqual(find(r, 'isolation').state, 'missing')
  assert.strictEqual(r.ok, true, 'an opt-in not taken is not a failure')
})

test('declining a tracker is missing, and keeps the run ok', () => {
  const r = withState({ tracker: { present: false }, key: { ok: false } })
  assert.strictEqual(find(r, 'tracker').state, 'missing')
  assert.strictEqual(r.ok, true)
})

test('a malformed config is broken, not missing — and fails the run', () => {
  const r = withState({ isolation: { present: true, parsed: false, error: 'Unexpected token }' } })
  const c = find(r, 'isolation')
  assert.strictEqual(c.state, 'broken')
  assert.match(c.detail, /Unexpected token/, 'the parse error is relayed, not swallowed')
  assert.strictEqual(r.ok, false, 'configured-but-wrong is a failure')
})

test('a tracker config with no teamId is broken — it is configured but unusable', () => {
  const r = withState({ tracker: { present: true, parsed: true } })
  assert.strictEqual(find(r, 'tracker').state, 'broken')
  assert.strictEqual(r.ok, false)
})

// --- git cannot keep an empty directory --------------------------------------

test('an empty lifecycle bucket is not a broken scaffold', () => {
  // git does not track empty directories, so `specs/in-progress/` genuinely
  // vanishes whenever no spec is in progress — and reappears the moment one
  // starts, because every lifecycle skill runs `mkdir -p` before it moves a
  // spec. Calling that broken cries wolf on a healthy repo, and exits 1 under
  // any skill branching on the code.
  const r = withState({ scaffold: { specsDir: true, core: true, buckets: ['backlog', 'complete', 'cancelled'], skills: 12 } })
  assert.strictEqual(find(r, 'scaffold').state, 'ok', 'a missing empty bucket is normal, not damage')
  assert.strictEqual(r.ok, true)
})

test('every bucket missing is still fine when the scaffold itself is there', () => {
  // A freshly cloned repo with nothing in progress and nothing cancelled has
  // only the buckets that happen to hold files.
  const r = withState({ scaffold: { specsDir: true, core: true, buckets: [], skills: 12 } })
  assert.strictEqual(find(r, 'scaffold').state, 'ok')
})

test('specs/ without .core IS a broken scaffold — that is the real half-install', () => {
  // `.core` always receives files from init (the config templates and the
  // manifest), so unlike a bucket it is a signal git can actually keep.
  const r = withState({ scaffold: { specsDir: true, core: false, buckets: ['backlog'], skills: 12 } })
  assert.strictEqual(find(r, 'scaffold').state, 'broken')
  assert.match(find(r, 'scaffold').detail, /\.core/)
  assert.strictEqual(r.ok, false)
})

// --- each layer, missing in turn ---------------------------------------------

test('no specs/ folder at all is missing, and names init', () => {
  const r = withState({ scaffold: { specsDir: false } })
  const c = find(r, 'scaffold')
  assert.strictEqual(c.state, 'missing')
  assert.strictEqual(c.fix, 'skitterspec init')
})

test('specs/ without skills is a broken scaffold', () => {
  // Retired the bucket-based version of this: a missing bucket turned out to be
  // normal (git drops empty directories), so it can no longer stand for a
  // half-install. `.core` and the skills are what actually go missing.
  const r = withState({ scaffold: { specsDir: true, core: true, buckets: ['backlog'], skills: 0 } })
  const c = find(r, 'scaffold')
  assert.strictEqual(c.state, 'broken', 'a partial install is exactly when repair matters')
  assert.strictEqual(r.ok, false)
})

test('specs/ without skills is broken too', () => {
  const r = withState({ scaffold: { ...READY.scaffold, skills: 0 } })
  assert.strictEqual(find(r, 'scaffold').state, 'broken')
})

test('a missing key is reported against the team that needs it', () => {
  const r = withState({ key: { ok: false } })
  const c = find(r, 'key')
  assert.strictEqual(c.state, 'missing')
  assert.match(c.detail, /SKS/)
  assert.strictEqual(c.fix, 'skitterspec spec-sync credentials set')
})

test('the key row is skipped when there is no tracker to authenticate against', () => {
  const r = withState({ tracker: { present: false }, key: { ok: false } })
  assert.strictEqual(find(r, 'key').state, 'skipped')
  assert.strictEqual(find(r, 'key').fix, null, 'nothing to fix, so nothing to suggest')
})

// --- the remote row ----------------------------------------------------------

test('the remote check is skipped until asked for, and says how to ask', () => {
  const c = find(withState({}), 'remote')
  assert.strictEqual(c.state, 'skipped')
  assert.match(c.detail, /--check-remote/)
})

test('a remote check that fails is broken — well-formed config is not working config', () => {
  // `reason` is the caller's own classified wording, never the API's message —
  // an error body can echo the request back, and a skill prints this.
  const r = withState({ remote: { checked: true, ok: false, reason: 'no team with that id in this workspace', fix: '/spec-linear-setup' } })
  const c = find(r, 'remote')
  assert.strictEqual(c.state, 'broken')
  assert.match(c.detail, /no team with that id/)
  assert.strictEqual(c.fix, '/spec-linear-setup')
  assert.strictEqual(r.ok, false)
})

test('a remote check asked for with nothing to ask with is skipped, not broken', () => {
  const r = withState({ remote: { checked: true, skipped: true, reason: 'no key, so there is nothing to check with' } })
  assert.strictEqual(find(r, 'remote').state, 'skipped')
  assert.strictEqual(r.ok, true, 'the key row already owns that problem')
})

test('a team that resolves under a different key is a rename, and points at retarget', () => {
  const r = withState({ remote: { checked: true, ok: true, teamKey: 'SKS', recordedKey: 'SKI' } })
  const c = find(r, 'remote')
  assert.strictEqual(c.state, 'broken')
  assert.match(c.detail, /renamed/)
  assert.strictEqual(c.fix, 'skitterspec spec-sync retarget')
  assert.strictEqual(r.ok, false)
})

test('a remote check that passes names the team it resolved', () => {
  const r = withState({ remote: { checked: true, ok: true, teamKey: 'SKS' } })
  assert.strictEqual(find(r, 'remote').state, 'ok')
  assert.match(find(r, 'remote').detail, /SKS resolves, key accepted/)
})

// --- the contract every row must honour --------------------------------------

test('every non-ok, non-skipped row names the command that fixes it', () => {
  const broken = runChecks({
    scaffold: { specsDir: false },
    isolation: { present: true, parsed: false },
    tracker: { present: true, parsed: false },
    key: { ok: false },
    remote: { checked: true, ok: false },
  })
  for (const c of broken.checks) {
    if (c.state === 'ok' || c.state === 'skipped') continue
    assert.ok(c.fix && c.fix.length, `${c.id} is ${c.state} and must name a fix`)
  }
  assert.strictEqual(broken.ok, false)
})

test('no row ever carries the key itself', () => {
  const secret = 'lin_api_SUPERSECRETVALUE'
  const r = withState({ key: { ok: true, source: 'the environment', fingerprint: '…LUE' } })
  assert.ok(!JSON.stringify(r).includes(secret), 'the report is safe for a skill to print by construction')
})

test('a remote check that never got an answer is skipped, not broken', () => {
  // The caller classifies a transport failure as `skipped` (see `checkRemote`);
  // this pins the state machine's half of it — `skipped` keeps `ok` true, so an
  // unexamined layer never fails the run.
  const r = withState({ remote: { checked: true, skipped: true, reason: 'Linear could not be reached' } })
  assert.strictEqual(find(r, 'remote').state, 'skipped')
  assert.match(find(r, 'remote').detail, /could not be reached/, 'it still says what happened')
  assert.strictEqual(r.ok, true, 'we could not tell, so we do not accuse')
})

test('every branch of the matrix yields a known state', () => {
  // The row builder refuses an unknown state, but only if it is reached — so
  // walk the branches rather than trusting one happy path.
  const variants = [
    { scaffold: { specsDir: false } },
    { scaffold: { specsDir: true, core: false, buckets: [], skills: 0 } },
    { scaffold: { specsDir: true, core: true, buckets: [], skills: 12 } },
    { scaffold: { ...READY.scaffold, skills: 0 } },
    { isolation: { present: false } },
    { isolation: { present: true, parsed: false } },
    { tracker: { present: false }, key: { ok: false } },
    { tracker: { present: true, parsed: false } },
    { tracker: { present: true, parsed: true } },
    { key: { ok: false } },
    { remote: { checked: true, ok: true, teamKey: 'SKS' } },
    { remote: { checked: true, ok: false } },
    { project: { configured: '' } },
    { project: { configured: 'p1' }, remote: { checked: true, ok: true, teamKey: 'SKS', project: { resolved: false } } },
    { project: { configured: 'p1' }, remote: { checked: true, ok: true, teamKey: 'SKS', project: { resolved: true, name: 'X', belongsToTeam: false } } },
    { project: { configured: 'p1' }, remote: { checked: true, ok: true, teamKey: 'SKS', project: { resolved: true, name: 'X', belongsToTeam: true } } },
    {},
  ]
  for (const v of variants) {
    const r = withState(v)
    assert.strictEqual(r.checks.length, 8, `${JSON.stringify(v)} still reports every layer`)
    for (const c of r.checks) {
      assert.ok(STATES.includes(c.state), `${c.id} → ${c.state} for ${JSON.stringify(v)}`)
      assert.ok(typeof c.detail === 'string' && c.detail, `${c.id} explains itself`)
    }
    assert.strictEqual(typeof r.ok, 'boolean')
  }
})

test('runChecks tolerates being handed nothing at all', () => {
  // A caller that failed to gather state must get a report saying so, not a
  // crash — this is the command a skill runs to find out what is wrong.
  const r = runChecks()
  assert.strictEqual(r.checks.length, 8)
  assert.strictEqual(find(r, 'scaffold').state, 'missing')
  assert.strictEqual(r.ok, true, 'nothing configured is nothing broken')
})

// --- the cross-transport row --------------------------------------------------
//
// Two transports, configured independently, and nothing made them agree. This
// row accuses only where it holds BOTH halves of a pair.
// See `.claude/rules/negative-checks.md`.

const MCP = { workspace: { id: 'org1', name: 'Skitterbyte' }, team: { id: 'e07c', key: 'SKS' }, project: { id: 'p1', name: 'Platform' } }
const REMOTE_OK = { checked: true, ok: true, teamKey: 'SKS', organization: { id: 'org1', name: 'Skitterbyte' } }

test('no --mcp file skips the row and keeps the run ok', () => {
  const r = withState({})
  assert.strictEqual(find(r, 'mcp').state, 'skipped')
  assert.match(find(r, 'mcp').detail, /--mcp/, 'names how to ask')
  assert.strictEqual(r.ok, true)
})

test('every id agreeing is ok, and names what was compared', () => {
  const r = withState({ mcp: MCP, tracker: { ...READY.tracker, teamId: 'e07c' }, project: { configured: 'p1' }, remote: REMOTE_OK })
  assert.strictEqual(find(r, 'mcp').state, 'ok')
  assert.match(find(r, 'mcp').detail, /workspace, team, project agree/)
  assert.strictEqual(r.ok, true)
})

test('a renamed workspace is not a mismatch — ids are identity', () => {
  // Same id, different name on each side. `retarget` exists because a team KEY
  // is not identity; the same is true of every name here.
  const renamed = { ...MCP, workspace: { id: 'org1', name: 'Skitterbyte Ltd' }, team: { id: 'e07c', key: 'SKZ' } }
  const r = withState({ mcp: renamed, tracker: { ...READY.tracker, teamId: 'e07c' }, project: { configured: 'p1' }, remote: REMOTE_OK })
  assert.strictEqual(find(r, 'mcp').state, 'ok')
})

test('a file naming only the workspace does not accuse over the team', () => {
  // The skill could not fetch the team. Unchecked is not mismatched — a row that
  // read absence as disagreement would fire on every partial fetch.
  const r = withState({ mcp: { workspace: { id: 'org1', name: 'Skitterbyte' } }, remote: REMOTE_OK })
  assert.strictEqual(find(r, 'mcp').state, 'ok')
  assert.match(find(r, 'mcp').detail, /workspace agree/)
})

test('a file with nothing comparable is skipped, not ok', () => {
  // No API organization to compare the workspace against and no team in the
  // file: claiming `ok` here would be a clean bill of health nobody earned.
  const r = withState({ mcp: { workspace: { id: 'org1' } }, remote: { checked: false } })
  assert.strictEqual(find(r, 'mcp').state, 'skipped')
  assert.strictEqual(r.ok, true)
})

test('the config and MCP are still compared with no API key at all', () => {
  // The case skitterload is in. Two sources are enough — the row must not wait
  // for a third that will never arrive.
  const r = withState({
    mcp: { team: { id: 'other', key: 'OTH' } },
    tracker: { ...READY.tracker, teamId: 'e07c' },
    key: { ok: false },
    remote: { checked: false },
  })
  assert.strictEqual(find(r, 'mcp').state, 'broken')
  assert.match(find(r, 'mcp').detail, /team mismatch/)
})

test('a workspace mismatch is broken and names both sides', () => {
  const r = withState({
    mcp: { ...MCP, workspace: { id: 'org9', name: 'Acme' } },
    tracker: { ...READY.tracker, teamId: 'e07c' },
    remote: REMOTE_OK,
  })
  const mcp = find(r, 'mcp')
  assert.strictEqual(mcp.state, 'broken')
  assert.strictEqual(r.ok, false, 'writes would land in the wrong workspace')
  assert.match(mcp.detail, /"Acme" \(org9\)/, 'the MCP side')
  assert.match(mcp.detail, /"Skitterbyte" \(org1\)/, 'and the API side')
  assert.strictEqual(mcp.fix, '/spec-linear-setup')
})

test('a project mismatch is caught too, against the config', () => {
  const r = withState({
    mcp: { ...MCP, project: { id: 'p9', name: 'Elsewhere' } },
    tracker: { ...READY.tracker, teamId: 'e07c' },
    project: { configured: 'p1' },
    remote: REMOTE_OK,
  })
  assert.strictEqual(find(r, 'mcp').state, 'broken')
  assert.match(find(r, 'mcp').detail, /project mismatch/)
})

// --- the deployment ladder row ----------------------------------------------
//
// The check needs the workspace's state TYPES, which only the API transport
// returns. Everything it does when it lacks them is a decision about acting on
// an absence — see `.claude/rules/negative-checks.md`.

const WS = [
  { id: '1', name: 'Backlog', type: 'backlog' },
  { id: '2', name: 'In Progress', type: 'started' },
  { id: '3', name: 'On Test', type: 'started' },
  { id: '4', name: 'Ready for Demo', type: 'started' },
  { id: '5', name: 'Done', type: 'completed' },
]

const ladder = (over) => find(withState({ ladder: over }), 'ladder')

// The STAYS-SILENT case: a project that declared no ladder must never be
// accused of a badly-shaped one.
test('ladder: no ladder declared is skipped, and keeps the run ok', () => {
  for (const state of [undefined, {}, { stages: [] }, { stages: null }]) {
    const c = ladder(state)
    assert.strictEqual(c.state, 'skipped')
    assert.match(c.detail, /no deployment ladder declared/)
    assert.strictEqual(c.fix, null, 'nothing to fix')
  }
  assert.strictEqual(withState({ ladder: {} }).ok, true)
})

test('ladder: without a tracker there is nothing to check against', () => {
  const r = runChecks({ ...READY, tracker: { present: false }, ladder: { stages: [{ key: 'p', state: 'Done' }] } })
  assert.strictEqual(find(r, 'ladder').state, 'skipped')
})

// Not knowing a type is not evidence of a bad one.
test('ladder: declared but unchecked is skipped, and still shows the rungs', () => {
  const c = ladder({ stages: [{ key: 'test', state: 'On Test' }, { key: 'prod', state: 'Done' }] })
  assert.strictEqual(c.state, 'skipped')
  assert.match(c.detail, /2 rung\(s\), unchecked/)
  assert.match(c.detail, /test -> On Test, prod -> Done/)
})

test('ladder: a ladder ending in a completed-type state is ok', () => {
  const c = ladder({
    stages: [{ key: 'test', state: 'On Test' }, { key: 'prod', state: 'Done' }],
    workspaceStates: WS,
  })
  assert.strictEqual(c.state, 'ok')
  assert.match(c.detail, /2 rung\(s\)/)
})

test('ladder: a ladder ending in a started-type state warns, without failing', () => {
  const r = runChecks({
    ...READY,
    ladder: {
      stages: [{ key: 'test', state: 'On Test' }, { key: 'demo', state: 'Ready for Demo' }],
      workspaceStates: WS,
    },
  })
  const c = find(r, 'ladder')
  assert.strictEqual(c.state, 'warn')
  assert.match(c.detail, /ends at "Ready for Demo" \(type: started\)/)
  assert.match(c.detail, /never reaches a completed state/)
  assert.match(c.detail, /ignore this if Linear automation closes them/, 'names what would make the check wrong')
  assert.strictEqual(r.ok, true, 'a warn must not fail the run')
})

test('ladder: a rung the workspace lacks is broken, and fails the run', () => {
  const r = runChecks({
    ...READY,
    ladder: { stages: [{ key: 'test', state: 'Nowhere' }, { key: 'prod', state: 'Done' }], workspaceStates: WS },
  })
  const c = find(r, 'ladder')
  assert.strictEqual(c.state, 'broken')
  assert.match(c.detail, /test -> "Nowhere"/)
  assert.match(c.detail, /silently ignores/)
  assert.strictEqual(c.fix, '/spec-linear-setup')
  assert.strictEqual(r.ok, false)
})

test('ladder: rung names match case-insensitively, like every other state lookup', () => {
  const c = ladder({ stages: [{ key: 'prod', state: 'done' }], workspaceStates: WS })
  assert.strictEqual(c.state, 'ok')
})

test('ladder: a single completed rung is a valid ladder', () => {
  const c = ladder({ stages: [{ key: 'prod', state: 'Done' }], workspaceStates: WS })
  assert.strictEqual(c.state, 'ok')
})

// A lookup that saw nothing is not a workspace missing these states.
test('ladder: an empty or nameless workspace list is unchecked, never an accusation', () => {
  for (const workspaceStates of [[], [null], [{ id: 'x' }], [{ name: 42 }]]) {
    const c = ladder({ stages: [{ key: 'prod', state: 'Done' }], workspaceStates })
    assert.strictEqual(c.state, 'skipped', `${JSON.stringify(workspaceStates)} proves nothing`)
    assert.match(c.detail, /unchecked/)
  }
})

test('ladder: one usable name is enough to start accusing a rung that is absent', () => {
  const c = ladder({
    stages: [{ key: 'prod', state: 'Nowhere' }],
    workspaceStates: [{ id: '1', name: 'Done', type: 'completed' }],
  })
  assert.strictEqual(c.state, 'broken')
})
