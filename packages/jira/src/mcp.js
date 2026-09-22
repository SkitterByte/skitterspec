'use strict'

/**
 * The MCP transport: resolve the connected Atlassian MCP server's tool names
 * at runtime and wrap them in the same op shapes `api.js` exposes, so the two
 * transports are interchangeable where MCP can express the operation at all.
 *
 * Tool names are DISCOVERED, never hardcoded as a single truth: Atlassian's
 * remote server (mcp.atlassian.com) names its tools one way today
 * (`getJiraIssue`, `createJiraIssue`, `editJiraIssue`,
 * `searchJiraIssuesUsingJql`, `transitionJiraIssue`, …) and a self-hosted
 * bridge may spell them another. Each matcher is an ordered regex list;
 * first advertised tool that matches wins.
 *
 * The engine itself never CALLS an MCP tool — the skill does, and hands
 * results to the engine as files (the same `--workspace-states` /
 * `--stored` idiom the Linear provider uses). This module exists so a skill
 * can ask which tools to call and so `doctor` can report a usable server.
 */

const MATCHERS = {
  issueRead: [/^getJiraIssue$/i, /\bget.*jira.*issue\b/i, /^get_issue$/i],
  issueCreate: [/^createJiraIssue$/i, /\bcreate.*jira.*issue\b/i, /^create_issue$/i],
  issueEdit: [/^editJiraIssue$/i, /\bedit.*jira.*issue\b/i, /^update_issue$/i],
  issueSearch: [/^searchJiraIssuesUsingJql$/i, /\bsearch.*jira.*issues\b/i, /^search_issues$/i],
  issueTransition: [/^transitionJiraIssue$/i, /\btransition.*jira.*issue\b/i],
  transitionsList: [/^getTransitionsForJiraIssue$/i, /\btransitions?\b.*jira/i],
  commentAdd: [/^addCommentToJiraIssue$/i, /\badd.*comment\b/i],
  viewerRead: [/^atlassianUserInfo$/i, /\b(current|my)?.?user.?info\b/i, /^get_user$/i],
  projectsList: [/^getVisibleJiraProjects$/i, /\bvisible.*projects\b/i, /^list_projects$/i],
}

// The minimum a server must offer for the MCP transport to be worth using at
// all: reading an issue and creating one. Everything else degrades per-command.
const REQUIRED = ['issueRead', 'issueCreate']

/**
 * Match the advertised tool list against the matchers.
 * @param {string[]} toolNames what the connected server advertises
 * @returns {{ ok: true, tools: Record<string,string> } | { ok: false, error, tools }}
 */
function discoverJira(toolNames) {
  const names = (toolNames || []).filter((n) => typeof n === 'string')
  const tools = {}
  for (const [op, patterns] of Object.entries(MATCHERS)) {
    for (const pattern of patterns) {
      const hit = names.find((n) => pattern.test(n))
      if (hit) {
        tools[op] = hit
        break
      }
    }
  }
  const missing = REQUIRED.filter((op) => !tools[op])
  if (missing.length) {
    return {
      ok: false,
      tools,
      error:
        `the connected MCP server is missing ${missing.join(' and ')} — ` +
        `advertised ${names.length} tool(s), none matched. Is the Atlassian MCP server connected?`,
    }
  }
  return { ok: true, tools }
}

/**
 * Wrap a discovered tool set + a `call(toolName, args)` function into the op
 * shapes the engine consumes. Ops the server cannot express are absent — the
 * consumer feature-detects, exactly as with the API adapter's extras.
 */
function makeAdapter({ tools, call, siteUrl, projectKey }) {
  const urlOf = (key) => (siteUrl ? `${String(siteUrl).replace(/\/+$/, '')}/browse/${key}` : null)
  const normalize = (raw) => {
    if (!raw || !raw.key) return null
    const f = raw.fields || {}
    return {
      id: String(raw.id || raw.key),
      identifier: raw.key,
      url: urlOf(raw.key),
      title: f.summary != null ? f.summary : null,
      state: f.status ? { name: f.status.name } : null,
    }
  }

  const adapter = {}
  if (tools.issueRead) {
    adapter.readIssue = async (keyOrId) => normalize(await call(tools.issueRead, { issueIdOrKey: String(keyOrId) }))
  }
  if (tools.issueCreate) {
    adapter.createIssue = async ({ title, description }) =>
      normalize(
        await call(tools.issueCreate, {
          projectKey,
          issueTypeName: 'Task',
          summary: title,
          description,
        }),
      )
    adapter.createSubIssue = async (parentId, { title, description }) =>
      normalize(
        await call(tools.issueCreate, {
          projectKey,
          issueTypeName: 'Subtask',
          summary: title,
          description,
          parent: { id: String(parentId) },
        }),
      )
  }
  if (tools.issueEdit) {
    adapter.updateIssue = async (keyOrId, updates) =>
      call(tools.issueEdit, { issueIdOrKey: String(keyOrId), fields: updates })
  }
  if (tools.issueSearch) {
    adapter.searchIssues = async ({ query, projectKey: pk }) =>
      call(tools.issueSearch, {
        jql: [pk || projectKey ? `project = "${pk || projectKey}"` : null, query ? `summary ~ "${String(query).replace(/(["\\])/g, '\\$1')}"` : null]
          .filter(Boolean)
          .join(' AND '),
      })
  }
  if (tools.viewerRead) {
    adapter.readViewer = async () => call(tools.viewerRead, {})
  }
  return adapter
}

module.exports = { discoverJira, makeAdapter, MATCHERS, REQUIRED }
