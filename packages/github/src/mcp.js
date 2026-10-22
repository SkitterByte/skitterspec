'use strict'

/**
 * The MCP transport: resolve the connected GitHub MCP server's tool names at
 * runtime, so a skill knows which tools to call where the engine cannot.
 *
 * Tool names are DISCOVERED, never hardcoded as a single truth. GitHub's
 * official server (`https://api.githubcopilot.com/mcp/`) names them one way
 * today — `issue_read`, `issue_write`, `sub_issue_write`, `add_issue_comment`,
 * `list_issues`, `search_issues`, `projects_get`, `projects_list`,
 * `projects_write`, `get_me` — and a host may prefix them
 * (`mcp__github__issue_read`). Each matcher is an ordered regex list; the first
 * advertised tool that matches wins.
 *
 * WHAT THIS SERVER CANNOT DO, and so what degrades: it has no release WRITE
 * tool (only `get_latest_release` / `get_release_by_tag`), so a release cannot
 * be created or completed over MCP at all — those commands exit 1 and say so.
 *
 * The engine itself never CALLS an MCP tool — the skill does, and hands
 * results to the engine as files (the `--workspace-states` / `--stored` /
 * `--text` idiom every provider uses). This module exists so a skill can ask
 * which tools to call and so `doctor` can report a usable server.
 */

const tool = (name) => new RegExp(`(^|__)${name}$`, 'i')

const MATCHERS = {
  issueRead: [tool('issue_read'), tool('get_issue')],
  issueWrite: [tool('issue_write'), tool('create_issue'), tool('update_issue')],
  subIssueWrite: [tool('sub_issue_write'), tool('add_sub_issue')],
  issueSearch: [tool('search_issues'), tool('list_issues')],
  commentAdd: [tool('add_issue_comment')],
  projectRead: [tool('projects_get'), tool('projects_list')],
  projectWrite: [tool('projects_write')],
  viewerRead: [tool('get_me')],
}

// The minimum a server must offer for the MCP transport to be worth using at
// all: reading an issue and writing one. Everything else degrades per command.
const REQUIRED = ['issueRead', 'issueWrite']

// Ops the official server cannot express at all — named so a refusal can say
// so rather than imply a missing connection.
const IMPOSSIBLE_OVER_MCP = Object.freeze(['release create', 'release complete'])

/**
 * Match the advertised tool list against the matchers.
 * @param {string[]} toolNames what the connected server advertises
 * @returns {{ ok: true, tools: Record<string,string> } | { ok: false, error, tools }}
 */
function discoverGithub(toolNames) {
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
        `advertised ${names.length} tool(s), none matched. Is GitHub's MCP server connected?`,
    }
  }
  return { ok: true, tools }
}

// The one-paragraph instructions an MCP-transport command hands the skill.
const APPLY_OVER_MCP =
  'Apply the plan with the GitHub MCP tools: issue_write to create/update each\n' +
  '  issue (labels from github.labels), sub_issue_write to link each phase under\n' +
  '  the spec issue, projects_write to add every issue to the board and set its\n' +
  '  Status option, issue_write again to close terminal-bucket issues\n' +
  '  (completed / not_planned). Then stamp the returned #numbers with\n' +
  '  `spec-sync stamp` and record with `spec-sync record`.'

module.exports = { discoverGithub, MATCHERS, REQUIRED, IMPOSSIBLE_OVER_MCP, APPLY_OVER_MCP }
