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
function fakeLinear(nodes, { hasNextPage = false } = {}) {
  const log = []
  return {
    log,
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
    assert.match(r.out, /--next is backlog-only/)
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
