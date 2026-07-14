'use strict'

/**
 * The Linear MCP boundary — the one place that knows concrete Linear tool names.
 *
 * `discoverLinear(tools)` resolves the operations the sync needs (read/update a
 * Project, list/create/update Milestones + Issues) against the *connected*
 * server's advertised tool list at runtime, rather than hardcoding names that
 * drift. If Linear isn't connected (empty / zero-match tool list) it returns a
 * clean `{ ok:false, error }` so the caller can stop and do nothing destructive.
 *
 * `makeAdapter(callTool, resolved)` wraps a generic `callTool(name, args)` (the
 * skill's MCP invoker) into the typed async operations push/pull consume. Tests
 * inject a fake adapter directly (an in-memory Project), so the engine stays
 * offline and deterministic; production wires `callTool` to the real MCP server.
 */

// Canonical operations, and the regexes that match a Linear MCP tool name to
// each. Ordered patterns: first match wins. Verified against the connected
// Linear MCP server during build (resolves the overview's Open questions).
const MATCHERS = {
  projectRead: [/get_?project\b/i, /read_?project/i, /project_?get/i],
  projectUpdate: [/update_?project/i, /project_?update/i],
  projectCreate: [/create_?project/i, /project_?create/i],
  milestoneList: [/list_?.*milestone/i, /milestones?_?list/i, /get_?.*milestones?/i],
  milestoneCreate: [/create_?.*milestone/i, /milestone_?create/i],
  milestoneUpdate: [/update_?.*milestone/i, /milestone_?update/i],
  issueList: [/list_?issues?/i, /issues?_?list/i, /get_?issues?/i],
  issueCreate: [/create_?issue/i, /issue_?create/i],
  issueUpdate: [/update_?issue/i, /issue_?update/i],
}

// The minimum the push/pull engine can't run without. Milestone/issue ops are
// optional in Phase 2 (project description round-trips first).
const REQUIRED = ['projectRead', 'projectUpdate']

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
        'Check the linear server exposes project read + update.',
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
    async readProject(id) {
      return callTool(need('projectRead'), { id })
    },
    async updateProject(id, updates) {
      return callTool(need('projectUpdate'), { id, ...updates })
    },
    async createMilestone(projectId, milestone) {
      return callTool(need('milestoneCreate'), { projectId, ...milestone })
    },
    async updateMilestone(id, updates) {
      return callTool(need('milestoneUpdate'), { id, ...updates })
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
