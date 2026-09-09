'use strict'

/**
 * `spec-sync list` — the read-only listing of what Linear holds.
 *
 * The behaviours that matter here are the ones that keep the listing HONEST:
 *   - a phase sub-issue is not a spec, and is excluded structurally;
 *   - an issue with no local spec file is REPORTED, not hidden — the local file
 *     is absent for the very reasons this command exists (a spec in flight on
 *     its own branch, a teammate's spec that has not landed);
 *   - a capped listing says what it did not show;
 *   - `transport = mcp` degrades without touching Linear.
 *
 * A fake adapter stands in for Linear, so the whole path runs offline.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const STATES = [
  { id: 's-backlog', name: 'Backlog' },
  { id: 's-progress', name: 'In Progress' },
  { id: 's-done', name: 'Done' },
  { id: 's-cancel', name: 'Canceled' },
]

function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-list-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')

  const spec = (bucket, name, identifier) => {
    const folder = path.join(dir, 'specs', bucket, name)
    fs.mkdirSync(folder, { recursive: true })
    const front = identifier ? `---\nlinear_identifier: "${identifier}"\n---\n\n` : ''
    fs.writeFileSync(path.join(folder, '00-overview.md'), `${front}# ${name}\n`, 'utf-8')
  }

  spec('in-progress', 'feat-linked', 'SKS-1')
  spec('backlog', 'feat-other', 'SKS-2')
  spec('backlog', 'feat-unlinked', null)
  return dir
}

const issue = (identifier, title, stateName, extra = {}) => ({
  id: `uuid-${identifier}`,
  identifier,
  url: `https://linear.app/x/issue/${identifier}`,
  title,
  description: '',
  priority: 0,
  sortOrder: 0,
  state: { id: 's-x', name: stateName },
  assignee: null,
  parent: null,
  ...extra,
})

/** A stand-in Linear that records every call, so "no Linear call" is assertable. */
function fakeLinear(nodes, { hasNextPage = false, children = {}, subIssuesThrow = false } = {}) {
  const log = []
  return {
    log,
    // Keyed by the PARENT's uuid, so a test can give one spec phases and leave
    // every other row without any — which is the shape decision 8 describes.
    async listSubIssues(parentId) {
      log.push({ op: 'listSubIssues', parentId })
      if (subIssuesThrow) throw new Error('Linear said no')
      return children[parentId] || []
    },
    async listIssueStates(teamId) {
      log.push({ op: 'listIssueStates', teamId })
      return STATES
    },
    async listIssues(args) {
      log.push({ op: 'listIssues', args })
      return { nodes, pageInfo: { hasNextPage, endCursor: null } }
    },
  }
}

function run(argv, cwd, io = {}) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env: { LINEAR_API_KEY: 'lin_api_test' },
    ...io,
  }).then((code) => ({ code, out: out.join('') }))
}

// --- the live listing --------------------------------------------------------

test('it lists live spec issues with the local spec name against each', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([
    issue('SKS-1', 'The linked one', 'In Progress'),
    issue('SKS-2', 'The other one', 'Backlog'),
  ])
  const r = await run(['list'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.match(r.out, /transport = api, live \(Backlog, In Progress\) — showing 2 of 2/)
  assert.match(r.out, /SKS-1 {2}In Progress {2}feat-linked/)
  assert.match(r.out, /SKS-2 {2}Backlog {6}feat-other/)
  assert.match(r.out, /The linked one/)
})

test('the default scope is the two live buckets, read from config.states', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([])
  await run(['list'], dir, { adapter: linear })

  const call = linear.log.find((c) => c.op === 'listIssues')
  assert.deepStrictEqual(call.args.stateIds, ['s-backlog', 's-progress'])
  assert.strictEqual(call.args.teamId, 'T1')
})

test('--all drops the state filter rather than naming every state', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([])
  const r = await run(['list', '--all', '--json'], dir, { adapter: linear })

  const call = linear.log.find((c) => c.op === 'listIssues')
  assert.strictEqual(call.args.stateIds, null)
  // `--all` is a bare boolean here, so the flag after it must survive: an
  // `--all` that swallowed `--json` would print the human listing instead.
  assert.strictEqual(JSON.parse(r.out).scope, 'all states')
})

test('--state names states directly and is repeatable', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([])
  const r = await run(['list', '--state', 'Done', '--state', 'Canceled', '--json'], dir, { adapter: linear })

  const call = linear.log.find((c) => c.op === 'listIssues')
  assert.deepStrictEqual(call.args.stateIds, ['s-done', 's-cancel'])
  assert.strictEqual(JSON.parse(r.out).scope, 'states (Done, Canceled)')
})

// --- what counts as a spec ---------------------------------------------------

test('a phase sub-issue is excluded — it carries a parent, a spec issue does not', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([
    issue('SKS-1', 'The spec', 'In Progress'),
    issue('SKS-9', 'Phase 1 — Engine', 'In Progress', { parent: { id: 'uuid-SKS-1' } }),
  ])
  const r = await run(['list'], dir, { adapter: linear })

  assert.match(r.out, /showing 1 of 1/)
  assert.doesNotMatch(r.out, /SKS-9/)
  // Asked for by the query too, not merely filtered after the fact.
  assert.strictEqual(linear.log.find((c) => c.op === 'listIssues').args.parentless, true)
})

// STAYS SILENT: a healthy issue this checkout has no local record of must still
// appear. Its absence from `listSpecs` is not evidence it is not a spec — the
// spec may be in flight on its own branch, or belong to a teammate and not have
// landed. See .claude/rules/negative-checks.md.
test('an issue with no local spec is reported and marked, never hidden', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([
    issue('SKS-1', 'The linked one', 'In Progress'),
    issue('SKS-99', "A teammate's unlanded spec", 'Backlog'),
  ])
  const r = await run(['list'], dir, { adapter: linear })

  assert.match(r.out, /showing 2 of 2/)
  assert.match(r.out, /SKS-99 {2}Backlog {6}— \(not linked here\)/)
  assert.match(r.out, /A teammate's unlanded spec/)
})

// --- no silent caps ----------------------------------------------------------

test('a capped listing says how many it did not show', async () => {
  const dir = fixtureRepo()
  const many = Array.from({ length: 23 }, (_, i) => issue(`SKS-${i + 1}`, `Spec ${i + 1}`, 'Backlog'))
  const r = await run(['list', '--limit', '5'], dir, { adapter: fakeLinear(many) })

  assert.match(r.out, /showing 5 of 23/)
  assert.match(r.out, /18 more not shown/)
  assert.doesNotMatch(r.out, /SKS-6 /)
})

test('archived issues are excluded, and the listing says so', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')])
  const r = await run(['list'], dir, { adapter: linear })

  assert.match(r.out, /archived issues excluded \(--archived to include\)/)
  assert.strictEqual(linear.log.find((c) => c.op === 'listIssues').args.includeArchived, false)
})

test('--archived includes them and says that instead', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')])
  const r = await run(['list', '--archived'], dir, { adapter: linear })

  assert.match(r.out, /archived issues included/)
  assert.strictEqual(linear.log.find((c) => c.op === 'listIssues').args.includeArchived, true)
})

test('a page Linear says it truncated is flagged, not passed off as complete', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')], { hasNextPage: true })
  const r = await run(['list'], dir, { adapter: linear })

  assert.match(r.out, /Linear reported further pages/)
})

// --- the machine-readable shape ----------------------------------------------

test('--json carries the rows, the scope and both counts', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([
    issue('SKS-1', 'The linked one', 'In Progress'),
    issue('SKS-99', 'Unlinked', 'Backlog'),
  ])
  const r = await run(['list', '--json'], dir, { adapter: linear })
  const got = JSON.parse(r.out)

  assert.strictEqual(got.transport, 'api')
  assert.strictEqual(got.scope, 'live (Backlog, In Progress)')
  assert.strictEqual(got.archived, false)
  assert.strictEqual(got.showing, 2)
  assert.strictEqual(got.total, 2)
  assert.deepStrictEqual(got.specs[0], {
    identifier: 'SKS-1',
    title: 'The linked one',
    state: 'In Progress',
    spec: 'feat-linked',
    bucket: 'in-progress',
    assignee: null,
    // Present and null rather than absent: the shape must not vary by state.
    phase: null,
    url: 'https://linear.app/x/issue/SKS-1',
  })
  assert.strictEqual(got.specs[1].spec, null)
})

// --- degradation -------------------------------------------------------------

test('transport = mcp degrades and makes no Linear call', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')])
  const r = await run(['list', '--via', 'mcp'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.match(r.out, /transport = mcp/)
  assert.match(r.out, /list issues over MCP instead/)
  assert.deepStrictEqual(linear.log, [])
})

test('with no API key it degrades rather than failing', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([])
  const r = await run(['list'], dir, { adapter: linear, env: {} })

  assert.strictEqual(r.code, 0)
  assert.match(r.out, /no Linear API key/)
  assert.deepStrictEqual(linear.log, [])
})

test('Linear being unreachable degrades rather than throwing', async () => {
  const dir = fixtureRepo()
  const adapter = {
    async listIssueStates() {
      return STATES
    },
    async listIssues() {
      throw new Error('unreachable')
    },
  }
  const r = await run(['list'], dir, { adapter })

  assert.strictEqual(r.code, 0)
  assert.match(r.out, /could not list issues \(unreachable\)/)
})

// --- the accusation, and its stays-silent counterpart ------------------------

test('a state name the workspace lacks is refused, naming the real ones', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([])
  const r = await run(['list', '--state', 'Shipped'], dir, { adapter: linear })

  assert.strictEqual(r.code, 1)
  assert.match(r.out, /unknown state "Shipped"/)
  assert.match(r.out, /the workspace has: Backlog, In Progress, Done, Canceled/)
  // It refused BEFORE querying — an unknown state is silently ignored by
  // Linear, which would return an empty listing that reads as "no specs".
  assert.strictEqual(linear.log.filter((c) => c.op === 'listIssues').length, 0)
})

test('a state name that differs only in case is accepted, not accused', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([])
  const r = await run(['list', '--state', 'in progress'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0)
  assert.doesNotMatch(r.out, /unknown state/)
  assert.deepStrictEqual(linear.log.find((c) => c.op === 'listIssues').args.stateIds, ['s-progress'])
})

// --- --next N and Linear's backlog order --------------------------------------

/** The identifiers in the order the listing printed them. */
const printedOrder = (out) =>
  out
    .split('\n')
    .map((l) => /^ {2}(SKS-\d+)\s/.exec(l))
    .filter(Boolean)
    .map((m) => m[1])

const backlogIssue = (identifier, { priority = 0, sortOrder = 0 } = {}) =>
  issue(identifier, `Spec ${identifier}`, 'Backlog', { priority, sortOrder })

test('--next orders by priority, with unprioritised last rather than first', async () => {
  const dir = fixtureRepo()
  // Priority is an enum — 1=Urgent … 4=Low, 0=none. Sorting the raw number would
  // put SKS-1 on top, which is the bug this ordering exists to avoid.
  const linear = fakeLinear([
    backlogIssue('SKS-1', { priority: 0 }),
    backlogIssue('SKS-2', { priority: 3 }),
    backlogIssue('SKS-3', { priority: 1 }),
    backlogIssue('SKS-4', { priority: 2 }),
  ])
  const r = await run(['list', '--next', '4'], dir, { adapter: linear })

  assert.deepStrictEqual(printedOrder(r.out), ['SKS-3', 'SKS-4', 'SKS-2', 'SKS-1'])
})

test('--next orders by sortOrder within one priority, lower sorting higher', async () => {
  const dir = fixtureRepo()
  // sortOrder is a float and lower sorts higher — the position Linear stores
  // when a card is dragged. Negatives are ordinary; dragging to the top mints one.
  const linear = fakeLinear([
    backlogIssue('SKS-1', { priority: 2, sortOrder: 12.5 }),
    backlogIssue('SKS-2', { priority: 2, sortOrder: -3 }),
    backlogIssue('SKS-3', { priority: 2, sortOrder: 0.25 }),
  ])
  const r = await run(['list', '--next', '3'], dir, { adapter: linear })

  assert.deepStrictEqual(printedOrder(r.out), ['SKS-2', 'SKS-3', 'SKS-1'])
})

test('--next breaks a sortOrder tie on the identifier, so a run is reproducible', async () => {
  const dir = fixtureRepo()
  // Two issues nobody ever dragged apart share a sortOrder. Without the
  // tie-break the rows reorder between runs on nothing but Linear's return
  // order, and no test could assert them.
  const nodes = [
    backlogIssue('SKS-10'),
    backlogIssue('SKS-2'),
    backlogIssue('SKS-9'),
  ]
  const first = await run(['list', '--next', '3'], dir, { adapter: fakeLinear(nodes) })
  const again = await run(['list', '--next', '3'], dir, { adapter: fakeLinear(nodes.slice().reverse()) })

  // Numeric-aware, so SKS-9 precedes SKS-10 rather than sorting as text.
  assert.deepStrictEqual(printedOrder(first.out), ['SKS-2', 'SKS-9', 'SKS-10'])
  assert.deepStrictEqual(printedOrder(again.out), printedOrder(first.out))
})

test('--next caps and says what it did not show, naming its own flag', async () => {
  const dir = fixtureRepo()
  const many = Array.from({ length: 23 }, (_, i) =>
    backlogIssue(`SKS-${i + 1}`, { priority: 2, sortOrder: i }),
  )
  const r = await run(['list', '--next', '5'], dir, { adapter: fakeLinear(many) })

  assert.match(r.out, /showing 5 of 23 in backlog/)
  assert.match(r.out, /18 more not shown — --next 23 for all of them/)
  assert.strictEqual(printedOrder(r.out).length, 5)
})

test('--next lists the backlog only, whatever the live default would include', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([backlogIssue('SKS-1')])
  await run(['list', '--next', '3'], dir, { adapter: linear })

  // One state id, and it is Backlog's — not the two the live default resolves.
  const call = linear.log.find((c) => c.op === 'listIssues')
  assert.deepStrictEqual(call.args.stateIds, ['s-backlog'])
})

test('all-unprioritised says the order is a drag-order, not a ranking', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([
    backlogIssue('SKS-1', { sortOrder: 1 }),
    backlogIssue('SKS-2', { sortOrder: 2 }),
  ])
  const r = await run(['list', '--next', '5'], dir, { adapter: linear })

  assert.match(r.out, /every candidate is unprioritised/)
  assert.match(r.out, /manual Backlog order, not a ranking/)
})

// The stays-silent half (.claude/rules/negative-checks.md rule 3): the caveat
// must NOT appear where a priority genuinely was set, or it stops being read.
test('stays silent: one prioritised candidate is enough to drop the caveat', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([
    backlogIssue('SKS-1', { priority: 0 }),
    backlogIssue('SKS-2', { priority: 4 }),
  ])
  const r = await run(['list', '--next', '5'], dir, { adapter: linear })

  assert.doesNotMatch(r.out, /unprioritised/)
})

test('stays silent: a plain listing carries no backlog-order caveat at all', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')])
  const r = await run(['list'], dir, { adapter: linear })

  assert.doesNotMatch(r.out, /unprioritised|not a ranking/)
})

test('--next with --state or --all is refused rather than silently overridden', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([backlogIssue('SKS-1')])

  for (const argv of [['list', '--next', '5', '--all'], ['list', '--next', '5', '--state', 'Done']]) {
    const r = await run(argv, dir, { adapter: linear })
    assert.strictEqual(r.code, 1, `${argv.join(' ')} exits non-zero`)
    assert.match(r.out, /each pick the scope, so they cannot be combined/)
  }
  // And it refused BEFORE reaching Linear — the scope was never half-applied.
  assert.deepStrictEqual(linear.log, [])
})

test('--json names the next scope and carries the unprioritised flag', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([backlogIssue('SKS-2'), backlogIssue('SKS-1')])
  const r = await run(['list', '--next', '5', '--json'], dir, { adapter: linear })
  const got = JSON.parse(r.out)

  assert.strictEqual(got.scope, 'next 5')
  assert.strictEqual(got.unprioritised, true)
  assert.deepStrictEqual(got.specs.map((s) => s.identifier), ['SKS-1', 'SKS-2'])
})

// --- the current phase, on in-progress rows only ------------------------------

const sub = (identifier, title, stateName, sortOrder) =>
  issue(identifier, title, stateName, { sortOrder, parent: { id: 'uuid-SKS-1' } })

/**
 * A spec issue in progress, with five phases of which the second is live.
 *
 * The `sortOrder` values are the REAL shape, taken from this repo's own SKS-115:
 * Linear's sub-issue sortOrder is a Backlog-view position and tracks nothing
 * about phase order — here it would sort the live phase LAST. A fixture whose
 * sortOrder happened to agree with phase order let exactly that bug through to
 * a live run, which is why these disagree on purpose.
 */
const fiveP2 = {
  'uuid-SKS-1': [
    sub('SKS-11', 'Phase one', 'Done', -105486),
    // The live phase carries the sortOrder that sorts LAST, so ordering on it
    // would print "5/5" for a spec on phase 2 — the exact miss a live run
    // caught. Ordering on the identifier gives 2/5.
    sub('SKS-12', 'Wire the toggle', 'In Progress', -5066),
    sub('SKS-13', 'Phase three', 'Backlog', -109484),
    sub('SKS-14', 'Phase four', 'Backlog', -108489),
    sub('SKS-15', 'Phase five', 'Backlog', -10982),
  ],
}

test('an in-progress row says which phase is live, and how many there are', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')], { children: fiveP2 })
  const r = await run(['list'], dir, { adapter: linear })

  assert.match(r.out, /2\/5 — Wire the toggle/)
})

test('the phase number follows the identifier, never Linear\'s sortOrder', async () => {
  const dir = fixtureRepo()
  const shuffled = { 'uuid-SKS-1': fiveP2['uuid-SKS-1'].slice().reverse() }
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')], { children: shuffled })
  const r = await run(['list'], dir, { adapter: linear })

  assert.match(r.out, /2\/5 — Wire the toggle/)
})

// A spec can sit in progress between phases — one just finished, the next has
// not started. That is a real state, not a missing phase, so the row says
// nothing extra rather than inventing a position.
test('stays silent: no phase in progress prints no phase at all', async () => {
  const dir = fixtureRepo()
  const between = {
    'uuid-SKS-1': [sub('SKS-11', 'Phase one', 'Done', 0), sub('SKS-12', 'Phase two', 'Backlog', 1)],
  }
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')], { children: between })
  const r = await run(['list'], dir, { adapter: linear })

  assert.doesNotMatch(r.out, /\d+\/\d+ —/)
  assert.match(r.out, /SKS-1/, 'the row itself is still listed')
})

test('two phases in progress reports the first and says there are more', async () => {
  const dir = fixtureRepo()
  const both = {
    'uuid-SKS-1': [
      sub('SKS-11', 'Phase one', 'In Progress', 0),
      sub('SKS-12', 'Phase two', 'In Progress', 1),
      sub('SKS-13', 'Phase three', 'Backlog', 2),
    ],
  }
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')], { children: both })
  const r = await run(['list'], dir, { adapter: linear })

  assert.match(r.out, /1\/3 — Phase one \(\+1 more in progress\)/)
})

test('a backlog-only listing makes no sub-issue call at all', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([backlogIssue('SKS-2'), backlogIssue('SKS-3')], { children: fiveP2 })
  await run(['list', '--state', 'Backlog'], dir, { adapter: linear })

  assert.strictEqual(linear.log.filter((c) => c.op === 'listSubIssues').length, 0)
})

test('the lookup runs once per in-progress row and not for the others', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear(
    [issue('SKS-1', 'Live', 'In Progress'), backlogIssue('SKS-2'), issue('SKS-4', 'Done one', 'Done')],
    { children: fiveP2 },
  )
  await run(['list', '--all'], dir, { adapter: linear })

  const calls = linear.log.filter((c) => c.op === 'listSubIssues')
  assert.deepStrictEqual(calls.map((c) => c.parentId), ['uuid-SKS-1'])
})

// `inline` mode keeps the phases in the spec issue's own description, so there
// are no children to read. Asking anyway would report "no phase in progress"
// for a spec that is mid-build — an absence that means nothing.
test('an inline-mode spec skips the lookup rather than reporting no phase', async () => {
  const dir = fixtureRepo()
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ linear: { teamId: 'T1' }, mapping: { phases: 'inline' } }),
    'utf-8',
  )
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')], { children: fiveP2 })
  const r = await run(['list'], dir, { adapter: linear })

  assert.strictEqual(linear.log.filter((c) => c.op === 'listSubIssues').length, 0)
  assert.doesNotMatch(r.out, /\d+\/\d+ —/)
})

test('a per-bucket phase map is resolved, not assumed to be subissue', async () => {
  const dir = fixtureRepo()
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ linear: { teamId: 'T1' }, mapping: { phases: { 'in-progress': 'inline' } } }),
    'utf-8',
  )
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')], { children: fiveP2 })
  await run(['list'], dir, { adapter: linear })

  assert.strictEqual(linear.log.filter((c) => c.op === 'listSubIssues').length, 0)
})

// Rule 4 of .claude/rules/negative-checks.md — route the unknown case to the
// harmless branch. A failed lookup must not take the whole listing down, and
// must not print a phase it never read.
test('a failed phase lookup degrades the row, not the listing', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')], { subIssuesThrow: true })
  const r = await run(['list'], dir, { adapter: linear })

  assert.strictEqual(r.code, 0, 'the listing still succeeds')
  assert.match(r.out, /SKS-1/, 'the row is still printed')
  assert.match(r.out, /could not read the phases of SKS-1/)
  assert.doesNotMatch(r.out, /\d+\/\d+ —/)
})

test('--json carries the phase as a structured field', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKS-1', 'The linked one', 'In Progress')], { children: fiveP2 })
  const r = await run(['list', '--json'], dir, { adapter: linear })
  const got = JSON.parse(r.out)

  assert.deepStrictEqual(got.specs[0].phase, {
    n: 2,
    total: 5,
    title: 'Wire the toggle',
    alsoInProgress: 0,
  })
})

test('the assignee is printed on the row, since who holds it is the question', async () => {
  const dir = fixtureRepo()
  const held = issue('SKS-1', 'The linked one', 'In Progress', {
    assignee: { id: 'u1', name: 'Jane Dev' },
  })
  const linear = fakeLinear([held], { children: fiveP2 })
  const r = await run(['list'], dir, { adapter: linear })

  assert.match(r.out, /Jane Dev · 2\/5 — Wire the toggle/)
})

// --- --mine / --by, and the scope guard ---------------------------------------

/**
 * Every identity path reads the user-level credentials store, which lives under
 * `XDG_CONFIG_HOME` or the real `$HOME`. Point it at a temp dir per test, or
 * `--mine` resolves against whoever happens to be logged in on this machine and
 * the suite passes or fails by accident.
 */
const isolatedEnv = (dir, extra = {}) => ({
  LINEAR_API_KEY: 'lin_api_test',
  XDG_CONFIG_HOME: path.join(dir, 'xdg'),
  ...extra,
})

const JANE = { id: 'u-jane', name: 'Jane Dev', email: 'jane@acme.com', active: true }

/** A fake that can also answer "who am I" and "who is X". */
function fakeLinearWithUsers(nodes, { viewer = null, users = [], ...rest } = {}) {
  const linear = fakeLinear(nodes, rest)
  linear.readViewer = async () => {
    linear.log.push({ op: 'readViewer' })
    if (!viewer) throw new Error('no viewer for this key')
    return viewer
  }
  linear.searchUsers = async (query, opts) => {
    linear.log.push({ op: 'searchUsers', query, opts })
    return { users, nextCursor: null }
  }
  return linear
}

test('--mine filters by the resolved viewer and names them in the heading', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinearWithUsers([issue('SKS-1', 'Mine', 'In Progress', { assignee: JANE })], {
    viewer: JANE,
  })
  const r = await run(['list', '--mine'], dir, { adapter: linear, env: isolatedEnv(dir) })

  assert.strictEqual(linear.log.find((c) => c.op === 'listIssues').args.assigneeId, 'u-jane')
  assert.match(r.out, /assigned to Jane Dev/)
})

// The accusation-shaped bug: showing everyone's work under a heading that
// promises only yours is worse than showing nothing. See the phase notes and
// .claude/rules/negative-checks.md.
test('--mine with no resolvable identity lists NOTHING and drops no filter', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinearWithUsers([issue('SKS-1', 'Somebody else', 'In Progress')], { viewer: null })
  const r = await run(['list', '--mine'], dir, { adapter: linear, env: isolatedEnv(dir) })

  assert.strictEqual(r.code, 0, 'an unknown identity is an ordinary state, not a fault')
  assert.match(r.out, /--mine needs to know who you are/)
  assert.match(r.out, /whoami --set/, 'says how to fix it')
  // The whole point: no rows, and no unfiltered query behind them.
  assert.doesNotMatch(r.out, /SKS-1/)
  assert.strictEqual(linear.log.filter((c) => c.op === 'listIssues').length, 0)
})

test('--by resolves the person through Linear and filters on their id', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinearWithUsers([issue('SKS-1', 'Hers', 'In Progress', { assignee: JANE })], {
    users: [JANE],
  })
  const r = await run(['list', '--by', 'jane'], dir, { adapter: linear, env: isolatedEnv(dir) })

  assert.strictEqual(linear.log.find((c) => c.op === 'listIssues').args.assigneeId, 'u-jane')
  assert.match(r.out, /assigned to Jane Dev/)
  // Never the viewer: --by is about someone else.
  assert.strictEqual(linear.log.filter((c) => c.op === 'readViewer').length, 0)
})

test('--by with no match says so and lists nothing, never the whole team', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinearWithUsers([issue('SKS-1', 'Somebody', 'In Progress')], { users: [] })
  const r = await run(['list', '--by', 'nobody'], dir, { adapter: linear, env: isolatedEnv(dir) })

  assert.strictEqual(r.code, 1, 'a filter that did not resolve is a fixable input error')
  assert.match(r.out, /no Linear user matches "nobody"/)
  assert.doesNotMatch(r.out, /SKS-1/)
  assert.strictEqual(linear.log.filter((c) => c.op === 'listIssues').length, 0)
})

test('--by that is ambiguous lists the candidates rather than picking one', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinearWithUsers([issue('SKS-1', 'Theirs', 'In Progress')], {
    users: [JANE, { id: 'u-jan', name: 'Jan Other', email: 'jan@acme.com' }],
  })
  const r = await run(['list', '--by', 'jan'], dir, { adapter: linear, env: isolatedEnv(dir) })

  assert.strictEqual(r.code, 1)
  assert.match(r.out, /2 users match "jan"/)
  assert.match(r.out, /jane@acme\.com/, 'shows the emails that disambiguate')
  assert.match(r.out, /jan@acme\.com/)
  assert.strictEqual(linear.log.filter((c) => c.op === 'listIssues').length, 0)
})

test('--mine and --by together are refused rather than one winning', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinearWithUsers([], { viewer: JANE, users: [JANE] })
  const r = await run(['list', '--mine', '--by', 'jane'], dir, { adapter: linear, env: isolatedEnv(dir) })

  assert.strictEqual(r.code, 1)
  assert.match(r.out, /both filter by assignee/)
  assert.deepStrictEqual(linear.log, [], 'refused before any Linear call')
})

test('--in-progress scopes to the in-progress state alone', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinear([issue('SKS-1', 'Live', 'In Progress')])
  const r = await run(['list', '--in-progress'], dir, { adapter: linear })

  assert.deepStrictEqual(linear.log.find((c) => c.op === 'listIssues').args.stateIds, ['s-progress'])
  assert.match(r.out, /in progress \(In Progress\)/)
})

test('the scope flags are alternatives, and every pair of them is refused', async () => {
  const dir = fixtureRepo()
  const pairs = [
    ['--next', '5', '--all'],
    ['--next', '5', '--in-progress'],
    ['--all', '--in-progress'],
    ['--in-progress', '--state', 'Done'],
  ]
  for (const extra of pairs) {
    const linear = fakeLinear([issue('SKS-1', 'x', 'Backlog')])
    const r = await run(['list', ...extra], dir, { adapter: linear })
    assert.strictEqual(r.code, 1, `${extra.join(' ')} is refused`)
    assert.match(r.out, /each pick the scope/)
    assert.deepStrictEqual(linear.log, [], `${extra.join(' ')} refused before any Linear call`)
  }
})

// Stays-silent: a plain listing must not acquire an assignee heading, or the
// filter's absence stops being visible.
test('stays silent: an unfiltered listing names no assignee', async () => {
  const dir = fixtureRepo()
  const r = await run(['list'], dir, { adapter: fakeLinear([issue('SKS-1', 'Any', 'Backlog')]) })

  assert.doesNotMatch(r.out, /assigned to/)
})

test('--json carries who it filtered to, and null when it did not', async () => {
  const dir = fixtureRepo()
  const linear = fakeLinearWithUsers([issue('SKS-1', 'Hers', 'In Progress', { assignee: JANE })], {
    users: [JANE],
  })
  const filtered = await run(['list', '--by', 'jane', '--json'], dir, {
    adapter: linear,
    env: isolatedEnv(dir),
  })
  assert.deepStrictEqual(JSON.parse(filtered.out).assignedTo, { id: 'u-jane', name: 'Jane Dev' })

  const plain = await run(['list', '--json'], dir, { adapter: fakeLinear([issue('SKS-1', 'x', 'Backlog')]) })
  assert.strictEqual(JSON.parse(plain.out).assignedTo, null)
})
