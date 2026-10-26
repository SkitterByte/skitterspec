'use strict'

/**
 * The MCP transport: resolve the connected Azure DevOps MCP server's tool
 * names at runtime and wrap them in the same op shapes `api.js` exposes, so
 * the two transports are interchangeable where MCP can express the operation
 * at all.
 *
 * Tool names are DISCOVERED, never hardcoded as a single truth: Microsoft's
 * server names its tools one way today (`wit_work_item_write` with
 * create/update/add_child actions, `wit_work_item_comment_write`, `wit_query`,
 * `core_get_identity_ids` — the phase 1 spike's record), named them another
 * way before (`wit_create_work_item`, `wit_update_work_item`, …), and a
 * self-hosted bridge may spell them a third. Each matcher is an ordered regex
 * list; first advertised tool that matches wins.
 *
 * The engine itself never CALLS an MCP tool — the skill does, and hands
 * results to the engine as files (the same `--workspace-states` / `--stored`
 * idiom the other providers use). This module exists so a skill can ask which
 * tools to call and so `doctor` can report a usable server.
 */

const MATCHERS = {
  itemRead: [/^wit_work_item$/i, /^wit_get_work_item$/i, /\bget.*work.?item\b/i],
  itemWrite: [/^wit_work_item_write$/i, /^wit_create_work_item$/i, /\bcreate.*work.?item\b/i],
  itemUpdate: [/^wit_work_item_write$/i, /^wit_update_work_item$/i, /\bupdate.*work.?item\b/i],
  itemBatchRead: [/^wit_get_work_items_batch_by_ids$/i, /\bbatch\b.*work.?item/i],
  commentAdd: [/^wit_work_item_comment_write$/i, /^wit_add_work_item_comment$/i, /\badd.*comment\b/i],
  query: [/^wit_query$/i, /^wit_run_query$/i, /\bwiql\b/i],
  identitySearch: [/^core_get_identity_ids$/i, /\bidentity\b/i],
}

// The minimum a server must offer for the MCP transport to be worth using at
// all: reading a work item and creating one. Everything else degrades
// per-command.
const REQUIRED = ['itemRead', 'itemWrite']

/**
 * Match the advertised tool list against the matchers.
 * @param {string[]} toolNames what the connected server advertises
 * @returns {{ ok: true, tools: Record<string,string> } | { ok: false, error, tools }}
 */
function discoverAzure(toolNames) {
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
        `advertised ${names.length} tool(s), none matched. Is the Azure DevOps MCP server connected?`,
    }
  }
  return { ok: true, tools }
}

/**
 * Wrap a discovered tool set + a `call(toolName, args)` function into the op
 * shapes the engine consumes. Ops the server cannot express are absent — the
 * consumer feature-detects, exactly as with the API adapter's extras.
 */
function makeAdapter({ tools, call, orgUrl, project }) {
  const org = String(orgUrl || '').replace(/\/+$/, '')
  const urlOf = (id) => (org && project ? `${org}/${encodeURIComponent(project)}/_workitems/edit/${id}` : null)
  const normalize = (raw) => {
    if (!raw || raw.id == null) return null
    const f = raw.fields || {}
    return {
      id: String(raw.id),
      identifier: `AB#${raw.id}`,
      url: urlOf(raw.id),
      title: f['System.Title'] != null ? f['System.Title'] : null,
      state: f['System.State'] != null ? { name: f['System.State'] } : null,
    }
  }

  const adapter = {}
  if (tools.itemRead) {
    adapter.readIssue = async (id) => normalize(await call(tools.itemRead, { project, id: Number(id) }))
  }
  if (tools.itemWrite) {
    adapter.createIssue = async ({ title, description, workItemType }) =>
      normalize(
        await call(tools.itemWrite, {
          action: 'create',
          project,
          workItemType,
          fields: { 'System.Title': title, 'System.Description': description },
          format: 'markdown',
        }),
      )
    adapter.createSubIssue = async (parentId, { title, description, childType }) =>
      normalize(
        await call(tools.itemWrite, {
          action: 'add_child',
          project,
          parentId: Number(parentId),
          workItemType: childType,
          fields: { 'System.Title': title, 'System.Description': description },
          format: 'markdown',
        }),
      )
    adapter.updateIssue = async (id, updates) =>
      call(tools.itemWrite, { action: 'update', project, id: Number(id), fields: updates })
  }
  if (tools.query) {
    adapter.searchIssues = async ({ query, workItemType }) =>
      call(tools.query, {
        project,
        wiql:
          'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project' +
          (workItemType ? ` AND [System.WorkItemType] = '${String(workItemType).replace(/'/g, "''")}'` : '') +
          (query ? ` AND [System.Title] CONTAINS '${String(query).replace(/'/g, "''")}'` : ''),
      })
  }
  if (tools.identitySearch) {
    adapter.searchUsers = async ({ query }) => call(tools.identitySearch, { searchFilter: query })
  }
  return adapter
}

module.exports = { discoverAzure, makeAdapter, MATCHERS, REQUIRED }
