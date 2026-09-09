'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { discoverLinear, makeAdapter, toolNames, REQUIRED } = require('../src/mcp.js')

// The real connected Linear MCP tool list: a single upsert `save_issue`, not
// separate create/update verbs. A spec is an issue; phases are sub-issues.
const LINEAR_TOOLS = [
  'get_issue',
  'save_issue',
  'list_issues',
  'get_project', // present in the workspace, but the sync only needs issue ops
]

test('not connected — empty tool list returns a clean stop error', () => {
  const r = discoverLinear([])
  assert.strictEqual(r.ok, false)
  assert.match(r.error, /not connected/i)
  assert.strictEqual(r.tools, undefined)
})

test('not connected — non-array is treated as empty', () => {
  assert.strictEqual(discoverLinear(undefined).ok, false)
  assert.strictEqual(discoverLinear(null).ok, false)
})

test('discovery resolves the issue ops from the real save_issue name', () => {
  const r = discoverLinear(LINEAR_TOOLS)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.tools.issueRead, 'get_issue')
  assert.strictEqual(r.tools.issueCreate, 'save_issue') // upsert covers create
  assert.strictEqual(r.tools.issueUpdate, 'save_issue') // ...and update
  assert.strictEqual(r.tools.issueList, 'list_issues')
})

test('discovery accepts {name} objects as well as strings', () => {
  const r = discoverLinear(LINEAR_TOOLS.map((name) => ({ name })))
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.tools.issueRead, 'get_issue')
})

test('missing a required op → ok:false with the missing list, no adapter', () => {
  const r = discoverLinear(['get_issue', 'list_issues'])
  assert.strictEqual(r.ok, false)
  assert.deepStrictEqual(r.missing, ['issueCreate'])
  assert.match(r.error, /missing required tools/i)
})

test('REQUIRED is issueRead + issueCreate', () => {
  assert.deepStrictEqual([...REQUIRED], ['issueRead', 'issueCreate'])
})

test('toolNames filters junk entries', () => {
  assert.deepStrictEqual(toolNames(['a', { name: 'b' }, null, 42, {}]), ['a', 'b'])
})

test('makeAdapter routes typed ops through callTool with resolved names', async () => {
  const calls = []
  const callTool = async (name, args) => {
    calls.push({ name, args })
    return { name, args }
  }
  const { tools } = discoverLinear(LINEAR_TOOLS)
  const adapter = makeAdapter(callTool, tools)

  await adapter.readIssue('ENG-1')
  await adapter.createIssue({ title: 'Spec', team: 'T1', description: 'x' })
  await adapter.updateIssue('ENG-1', { description: 'y' })
  await adapter.createSubIssue('ENG-1', { title: 'Phase 1', state: 'Backlog' })

  // readIssue keys on `query`; save_issue upserts (create without id, update with);
  // a sub-issue is the same tool with a parentId.
  assert.deepStrictEqual(calls[0], { name: 'get_issue', args: { query: 'ENG-1' } })
  assert.deepStrictEqual(calls[1], { name: 'save_issue', args: { title: 'Spec', team: 'T1', description: 'x' } })
  assert.deepStrictEqual(calls[2], { name: 'save_issue', args: { id: 'ENG-1', description: 'y' } })
  assert.deepStrictEqual(calls[3], { name: 'save_issue', args: { parentId: 'ENG-1', title: 'Phase 1', state: 'Backlog' } })
})

test('makeAdapter throws for an op the server did not expose', async () => {
  const adapter = makeAdapter(async () => ({}), { issueRead: 'get_issue' })
  await assert.rejects(() => adapter.createIssue({}), /op not available: issueCreate/)
})

// --- project picker + intake search (Phase 1 of feat-linear-project-and-intake)

// A workspace that also exposes the project list — what the picker needs.
const TOOLS_WITH_PROJECTS = [...LINEAR_TOOLS, 'list_projects', 'save_project']

test('projectList resolves list_projects, not the singular get_project', () => {
  const r = discoverLinear(TOOLS_WITH_PROJECTS)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.tools.projectList, 'list_projects')
})

test('projectList is optional — a server without it still pushes', () => {
  const r = discoverLinear(LINEAR_TOOLS) // get_project only, no list_projects
  assert.strictEqual(r.ok, true, 'discovery still succeeds')
  assert.strictEqual(r.tools.projectList, undefined, 'picker simply unavailable')
  assert.ok(!REQUIRED.includes('projectList'))
})

test('listProjects throws a named error when the picker op is missing', async () => {
  const { tools } = discoverLinear(LINEAR_TOOLS)
  const adapter = makeAdapter(async () => ({}), tools)
  await assert.rejects(() => adapter.listProjects('T1'), /projectList/)
})

test('listProjects scopes to the team, and omits the filter when unset', async () => {
  const calls = []
  const callTool = async (name, args) => (calls.push({ name, args }), {})
  const { tools } = discoverLinear(TOOLS_WITH_PROJECTS)
  const adapter = makeAdapter(callTool, tools)

  await adapter.listProjects('T1')
  await adapter.listProjects()

  assert.deepStrictEqual(calls[0], { name: 'list_projects', args: { team: 'T1' } })
  assert.deepStrictEqual(calls[1], { name: 'list_projects', args: {} })
})

test('searchIssues rides the discovered issueList op — no new required tool', async () => {
  const calls = []
  const callTool = async (name, args) => (calls.push({ name, args }), {})
  const { tools } = discoverLinear(LINEAR_TOOLS)
  const adapter = makeAdapter(callTool, tools)

  await adapter.searchIssues({ label: 'web-app', teamId: 'T1' })
  await adapter.searchIssues({ label: 'web-app', query: 'login', teamId: 'T1' })
  await adapter.searchIssues()

  assert.deepStrictEqual(calls[0], { name: 'list_issues', args: { label: 'web-app', team: 'T1' } })
  assert.deepStrictEqual(calls[1], {
    name: 'list_issues',
    args: { label: 'web-app', query: 'login', team: 'T1' },
  })
  // Unset filters are left off entirely rather than sent empty — an empty
  // `label` would otherwise narrow the inbox to issues with a blank label.
  assert.deepStrictEqual(calls[2], { name: 'list_issues', args: {} })
})

// --- identity: who am I, and who is everyone else ----------------------------

// A workspace exposing the user tools — what identity and `/spec-claim --to` need.
const TOOLS_WITH_USERS = [...LINEAR_TOOLS, 'get_user', 'list_users']

test('the singular and plural user tools do not claim each other', () => {
  const r = discoverLinear(TOOLS_WITH_USERS)
  assert.strictEqual(r.ok, true)
  // First-name-wins matching is what made `get_issues?` unsafe for issueList;
  // the same trap is why userRead anchors on `\b` and userList on `list_`.
  assert.strictEqual(r.tools.userRead, 'get_user')
  assert.strictEqual(r.tools.userList, 'list_users')
})

test('the user tools are optional — a server without them still pushes', () => {
  const r = discoverLinear(LINEAR_TOOLS)
  assert.strictEqual(r.ok, true, 'discovery still succeeds')
  assert.strictEqual(r.tools.userRead, undefined)
  assert.strictEqual(r.tools.userList, undefined)
  assert.ok(!REQUIRED.includes('userRead'), 'identity must never gate a push')
  assert.ok(!REQUIRED.includes('userList'))
})

test('readViewer asks for the literal "me" — the MCP path\'s viewer', async () => {
  const calls = []
  const callTool = async (name, args) => (calls.push({ name, args }), {})
  const { tools } = discoverLinear(TOOLS_WITH_USERS)
  await makeAdapter(callTool, tools).readViewer()
  assert.deepStrictEqual(calls[0], { name: 'get_user', args: { query: 'me' } })
})

test('searchUsers passes the query and omits what was not asked for', async () => {
  const calls = []
  const callTool = async (name, args) => (calls.push({ name, args }), {})
  const { tools } = discoverLinear(TOOLS_WITH_USERS)
  const adapter = makeAdapter(callTool, tools)

  await adapter.searchUsers('jane', { limit: 10 })
  await adapter.searchUsers()

  assert.deepStrictEqual(calls[0], { name: 'list_users', args: { query: 'jane', limit: 10 } })
  assert.deepStrictEqual(calls[1], { name: 'list_users', args: {} })
})

test('the user ops throw a named error when the server did not expose them', async () => {
  const { tools } = discoverLinear(LINEAR_TOOLS)
  const adapter = makeAdapter(async () => ({}), tools)
  await assert.rejects(() => adapter.readViewer(), /userRead/)
  await assert.rejects(() => adapter.searchUsers('x'), /userList/)
})
