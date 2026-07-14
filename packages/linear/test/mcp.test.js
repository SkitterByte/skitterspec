'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { discoverLinear, makeAdapter, toolNames, REQUIRED } = require('../src/mcp.js')

// A realistic Linear MCP tool list.
const LINEAR_TOOLS = [
  'get_project',
  'update_project',
  'create_project',
  'list_project_milestones',
  'create_project_milestone',
  'update_project_milestone',
  'list_issues',
  'create_issue',
  'update_issue',
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

test('discovery resolves the core project ops from real-ish names', () => {
  const r = discoverLinear(LINEAR_TOOLS)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.tools.projectRead, 'get_project')
  assert.strictEqual(r.tools.projectUpdate, 'update_project')
  assert.strictEqual(r.tools.milestoneCreate, 'create_project_milestone')
})

test('discovery accepts {name} objects as well as strings', () => {
  const r = discoverLinear(LINEAR_TOOLS.map((name) => ({ name })))
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.tools.projectRead, 'get_project')
})

test('missing a required op → ok:false with the missing list, no adapter', () => {
  const r = discoverLinear(['get_project', 'list_issues'])
  assert.strictEqual(r.ok, false)
  assert.deepStrictEqual(r.missing, ['projectUpdate'])
  assert.match(r.error, /missing required tools/i)
})

test('REQUIRED is projectRead + projectUpdate', () => {
  assert.deepStrictEqual([...REQUIRED], ['projectRead', 'projectUpdate'])
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

  await adapter.readProject('P1')
  await adapter.updateProject('P1', { description: 'x' })

  assert.deepStrictEqual(calls[0], { name: 'get_project', args: { id: 'P1' } })
  assert.deepStrictEqual(calls[1], { name: 'update_project', args: { id: 'P1', description: 'x' } })
})

test('makeAdapter throws for an op the server did not expose', async () => {
  const adapter = makeAdapter(async () => ({}), { projectRead: 'get_project', projectUpdate: 'update_project' })
  await assert.rejects(() => adapter.createMilestone('P1', {}), /op not available: milestoneCreate/)
})
