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
