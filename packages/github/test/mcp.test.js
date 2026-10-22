'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { discoverGithub, REQUIRED, IMPOSSIBLE_OVER_MCP } = require('../src/mcp.js')

const OFFICIAL = [
  'issue_read', 'issue_write', 'sub_issue_write', 'add_issue_comment', 'list_issues',
  'search_issues', 'projects_get', 'projects_list', 'projects_write', 'get_me',
  'get_latest_release', 'get_release_by_tag',
]

test("the official server's tool names are all discovered", () => {
  const got = discoverGithub(OFFICIAL)
  assert.strictEqual(got.ok, true)
  assert.deepStrictEqual(got.tools, {
    issueRead: 'issue_read',
    issueWrite: 'issue_write',
    subIssueWrite: 'sub_issue_write',
    issueSearch: 'search_issues',
    commentAdd: 'add_issue_comment',
    projectRead: 'projects_get',
    projectWrite: 'projects_write',
    viewerRead: 'get_me',
  })
})

test('a host prefix is matched, and a lookalike is not', () => {
  const got = discoverGithub(['mcp__github__issue_read', 'mcp__github__issue_write', 'my_issue_reader'])
  assert.strictEqual(got.tools.issueRead, 'mcp__github__issue_read')
  assert.ok(!discoverGithub(['issue_reader', 'issue_writer']).ok)
})

test('missing the required pair names it', () => {
  const got = discoverGithub(['projects_get'])
  assert.strictEqual(got.ok, false)
  assert.match(got.error, new RegExp(REQUIRED.join(' and ')))
})

test('releases are named as impossible over MCP — the server has no release write tool', () => {
  assert.ok(!OFFICIAL.some((t) => /release/.test(t) && !/^get_/.test(t)))
  assert.deepStrictEqual([...IMPOSSIBLE_OVER_MCP], ['release create', 'release complete'])
})
