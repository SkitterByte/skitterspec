'use strict'

// MCP tool discovery: names are matched against what the connected server
// advertises, never hardcoded as a single truth.

const { test } = require('node:test')
const assert = require('node:assert')

const { discoverJira, makeAdapter, REQUIRED } = require('../src/mcp.js')

const ATLASSIAN_TOOLS = [
  'getJiraIssue',
  'createJiraIssue',
  'editJiraIssue',
  'searchJiraIssuesUsingJql',
  'transitionJiraIssue',
  'getTransitionsForJiraIssue',
  'addCommentToJiraIssue',
  'atlassianUserInfo',
  'getVisibleJiraProjects',
]

test("Atlassian's remote server resolves every op", () => {
  const r = discoverJira(ATLASSIAN_TOOLS)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.tools.issueRead, 'getJiraIssue')
  assert.strictEqual(r.tools.issueCreate, 'createJiraIssue')
  assert.strictEqual(r.tools.issueTransition, 'transitionJiraIssue')
})

test('a server missing the required minimum refuses, naming what is missing', () => {
  const r = discoverJira(['someUnrelatedTool'])
  assert.strictEqual(r.ok, false)
  for (const op of REQUIRED) assert.match(r.error, new RegExp(op))
})

test('an empty or garbage advertisement is a clean refusal, not a throw', () => {
  assert.strictEqual(discoverJira([]).ok, false)
  assert.strictEqual(discoverJira(null).ok, false)
  assert.strictEqual(discoverJira([42, null, 'x']).ok, false)
})

test('the adapter wraps discovered tools and omits what the server lacks', async () => {
  const calls = []
  const r = discoverJira(['getJiraIssue', 'createJiraIssue'])
  const adapter = makeAdapter({
    tools: r.tools,
    call: async (tool, args) => {
      calls.push([tool, args])
      return { id: '1', key: 'PROJ-1', fields: { summary: 'T', status: { name: 'To Do' } } }
    },
    siteUrl: 'https://acme.atlassian.net/',
    projectKey: 'PROJ',
  })
  const issue = await adapter.readIssue('PROJ-1')
  assert.strictEqual(issue.identifier, 'PROJ-1')
  assert.strictEqual(issue.url, 'https://acme.atlassian.net/browse/PROJ-1')
  assert.strictEqual(adapter.searchIssues, undefined, 'no search tool advertised, no op')
  assert.deepStrictEqual(calls[0], ['getJiraIssue', { issueIdOrKey: 'PROJ-1' }])
})
