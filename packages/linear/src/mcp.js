'use strict'

/**
 * The Linear MCP boundary — the one place that knows concrete Linear tool names.
 *
 * A spec is a Linear **issue** and each phase a **sub-issue** (a child issue
 * with a `parentId`); tasks are not synced. `discoverLinear(tools)` resolves the
 * issue operations the sync needs (read / create / update an issue, optionally
 * list a parent's children) against the *connected* server's advertised tool
 * list at runtime, rather than hardcoding names that drift. If Linear isn't
 * connected (empty / zero-match tool list) it returns a clean `{ ok:false,
 * error }` so the caller can stop and do nothing destructive.
 *
 * `makeAdapter(callTool, resolved)` wraps a generic `callTool(name, args)` (the
 * skill's MCP invoker) into the typed async operations push consumes. Tests
 * inject a fake `callTool`, so the engine stays offline and deterministic;
 * production wires `callTool` to the real MCP server.
 */

// Canonical operations, and the regexes that match a Linear MCP tool name to
// each. Ordered patterns: first match wins. Matched against the real connected
// Linear MCP server: it exposes a single upsert `save_issue` tool (create when
// no id, update when id given) rather than separate create/update verbs, so each
// write op accepts `save_issue` as well as the legacy `create_`/`update_` names.
const MATCHERS = {
  issueRead: [/get_?issue\b/i, /read_?issue/i, /issue_?get/i],
  issueCreate: [/save_?issue/i, /create_?issue/i, /issue_?create/i],
  issueUpdate: [/save_?issue/i, /update_?issue/i, /issue_?update/i],
  // list only — NOT `get_issues?`, which would greedily claim the singular
  // `get_issue` (first-name-wins) and leave issueRead/issueList conflated.
  issueList: [/list_?issues?/i, /issues?_?list/i],
  // The team's Linear Projects, for the `/spec` + `/spec-push` project picker.
  // Plural-only for the same reason as issueList: `get_project` is a read.
  projectList: [/list_?projects?/i, /projects?_?list/i],
}

// The minimum the push engine can't run without: read an issue back and
// create/upsert one (which also covers sub-issues via a `parentId`).
const REQUIRED = ['issueRead', 'issueCreate']

// Normalise a tools argument (array of strings or {name} objects) to names.
function toolNames(tools) {
  if (!Array.isArray(tools)) return []
  return tools
    .map((t) => (typeof t === 'string' ? t : t && typeof t === 'object' ? t.name : null))
    .filter((n) => typeof n === 'string' && n)
}

/**
 * Resolve Linear operations against the connected server's tool list.
 * @returns {{ok:true, tools:Record<string,string>}} on success, or
 *          {{ok:false, error:string, resolved?:object, missing?:string[]}}.
 */
function discoverLinear(tools) {
  const names = toolNames(tools)
  if (!names.length) {
    return {
      ok: false,
      error: 'Linear not connected — connect the `linear` MCP server, then retry.',
    }
  }

  const resolved = {}
  for (const [op, patterns] of Object.entries(MATCHERS)) {
    const hit = names.find((n) => patterns.some((p) => p.test(n)))
    if (hit) resolved[op] = hit
  }

  const missing = REQUIRED.filter((op) => !resolved[op])
  if (missing.length) {
    return {
      ok: false,
      error:
        `Linear MCP is connected but missing required tools: ${missing.join(', ')}. ` +
        'Check the linear server exposes issue read + create.',
      resolved,
      missing,
    }
  }

  return { ok: true, tools: resolved }
}

/**
 * Wrap a generic `callTool(name, args) → Promise<result>` into the typed ops the
 * engine uses. `resolved` is `discoverLinear(...).tools`.
 */
function makeAdapter(callTool, resolved) {
  const need = (op) => {
    const name = resolved[op]
    if (!name) throw new Error(`Linear MCP op not available: ${op}`)
    return name
  }
  return {
    // Linear's issue-read tool keys on `query` (accepts a UUID, identifier, or
    // title). Used to read a mirror issue's workflow state for drift reporting.
    async readIssue(id) {
      return callTool(need('issueRead'), { query: id })
    },
    // The SPEC issue. `save_issue` upserts: without `id` it creates, with `id` it
    // updates. Create needs `title` + `team`; `project` (optional) groups it.
    async createIssue(issue) {
      return callTool(need('issueCreate'), { ...issue })
    },
    async updateIssue(id, updates) {
      return callTool(need('issueUpdate'), { id, ...updates })
    },
    // A phase SUB-ISSUE: a child issue carrying `parentId` = the spec issue.
    // Same upsert tool, so it inherits create-on-no-id / update-on-id.
    async createSubIssue(parentId, subIssue) {
      return callTool(need('issueCreate'), { parentId, ...subIssue })
    },
    async updateSubIssue(id, updates) {
      return callTool(need('issueUpdate'), { id, ...updates })
    },
    // List a spec issue's sub-issues (read side, for drift). Optional op.
    async listSubIssues(parentId) {
      return callTool(need('issueList'), { parentId })
    },
    // The intake inbox: issues matching a label and/or a free-text query, scoped
    // to a team. Rides the same discovered list op as `listSubIssues` — Linear's
    // `list_issues` filters on all three — so intake adds no new required tool.
    // Omitted filters are left off the call rather than sent empty.
    async searchIssues({ label, query, teamId } = {}) {
      const args = {}
      if (label) args.label = label
      if (query) args.query = query
      if (teamId) args.team = teamId
      return callTool(need('issueList'), args)
    },
    // The team's projects, for the project picker. Optional: a server without a
    // project-list tool just means the picker is unavailable, never a failed push.
    async listProjects(teamId) {
      return callTool(need('projectList'), teamId ? { team: teamId } : {})
    },
  }
}

module.exports = {
  discoverLinear,
  makeAdapter,
  toolNames,
  MATCHERS,
  REQUIRED,
}
