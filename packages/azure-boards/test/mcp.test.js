'use strict'

// MCP tool discovery: names are matched against what the connected server
// advertises, never hardcoded as a single truth.

const { test } = require('node:test')
const assert = require('node:assert')

const { discoverAzure, makeAdapter, REQUIRED } = require('../src/mcp.js')

// The official server's current naming (phase 1 spike record).
const MICROSOFT_TOOLS = [
  'wit_work_item',
  'wit_work_item_write',
  'wit_work_item_comment_write',
  'wit_work_item_link_write',
  'wit_query',
  'core_get_identity_ids',
]

// The official server's EARLIER naming — the matchers must span both.
const LEGACY_TOOLS = [
  'wit_get_work_item',
  'wit_create_work_item',
  'wit_update_work_item',
  'wit_add_work_item_comment',
  'wit_get_work_items_batch_by_ids',
]

test("Microsoft's current server resolves every op", () => {
  const r = discoverAzure(MICROSOFT_TOOLS)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.tools.itemRead, 'wit_work_item')
  assert.strictEqual(r.tools.itemWrite, 'wit_work_item_write')
  assert.strictEqual(r.tools.commentAdd, 'wit_work_item_comment_write')
  assert.strictEqual(r.tools.query, 'wit_query')
  assert.strictEqual(r.tools.identitySearch, 'core_get_identity_ids')
})

test('the earlier tool naming still resolves the required minimum', () => {
  const r = discoverAzure(LEGACY_TOOLS)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.tools.itemRead, 'wit_get_work_item')
  assert.strictEqual(r.tools.itemWrite, 'wit_create_work_item')
})

test('a server missing the required minimum refuses, naming what is missing', () => {
  const r = discoverAzure(['someUnrelatedTool'])
  assert.strictEqual(r.ok, false)
  for (const op of REQUIRED) assert.match(r.error, new RegExp(op))
})

test('an empty or garbage advertisement is a clean refusal, not a throw', () => {
  assert.strictEqual(discoverAzure([]).ok, false)
  assert.strictEqual(discoverAzure(null).ok, false)
  assert.strictEqual(discoverAzure([42, null, 'x']).ok, false)
})

test('the adapter wraps discovered tools and omits what the server lacks', async () => {
  const calls = []
  const r = discoverAzure(['wit_work_item', 'wit_work_item_write'])
  const adapter = makeAdapter({
    tools: r.tools,
    call: async (tool, args) => {
      calls.push([tool, args])
      return { id: 7, fields: { 'System.Title': 'T', 'System.State': 'To Do' } }
    },
    orgUrl: 'https://dev.azure.com/acme/',
    project: 'web',
  })
  const item = await adapter.readIssue('7')
  assert.strictEqual(item.identifier, 'AB#7')
  assert.strictEqual(item.url, 'https://dev.azure.com/acme/web/_workitems/edit/7')
  assert.strictEqual(adapter.searchIssues, undefined, 'no query tool advertised, no op')
  assert.deepStrictEqual(calls[0], ['wit_work_item', { project: 'web', id: 7 }])
})

test('MCP creates write the mapped body field; unmapped types stay on Description', async () => {
  const calls = []
  const r = discoverAzure(['wit_work_item', 'wit_work_item_write'])
  const adapter = makeAdapter({
    tools: r.tools,
    call: async (tool, args) => {
      calls.push([tool, args])
      return { id: 8, fields: { 'System.Title': 'T' } }
    },
    orgUrl: 'https://dev.azure.com/acme/',
    project: 'web',
    bodyFieldByType: { Bug: 'Microsoft.VSTS.TCM.ReproSteps' },
  })
  await adapter.createIssue({ title: 'Crash', description: '## repro', workItemType: 'Bug' })
  assert.deepStrictEqual(calls[0][1].fields, {
    'System.Title': 'Crash',
    'Microsoft.VSTS.TCM.ReproSteps': '## repro',
  })
  // STAYS-SILENT: an unmapped type's payload is what it always was.
  await adapter.createIssue({ title: 'Story', description: '## md', workItemType: 'User Story' })
  assert.deepStrictEqual(calls[1][1].fields, {
    'System.Title': 'Story',
    'System.Description': '## md',
  })
})
