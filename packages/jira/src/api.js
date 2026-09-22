'use strict'

/**
 * The Jira Cloud REST v3 adapter — the one place that speaks Atlassian's
 * protocol, and the boundary ADF never crosses.
 *
 * Every op takes and returns the engine's shapes: descriptions go in as
 * markdown and come back as markdown-ish text (`adf.js` converts at this
 * boundary), an issue's workflow state comes back as `{ name }`, an assignee
 * as `{ id, name }` (the id is the Atlassian accountId). Nothing downstream
 * needs to know ADF exists.
 *
 * STATUS MOVES BY TRANSITION, NEVER BY FIELD WRITE. Jira has no "set status":
 * a workflow exposes the transitions legal from the current status, and the
 * adapter applies the one landing on the target (`transitionTo`). No matching
 * transition is a loud, named refusal listing the transitions that DO exist —
 * a positive signal, never a guess.
 * BLIND SPOT, deliberate: a status reachable only through intermediate
 * transitions is reported as unreachable — v1 does not path-find a workflow.
 *
 * Auth is basic (email + API token). 401/403 are phrased for the human holding
 * the token; 429 waits and retries via the kit's shared discipline
 * (`provider-kit/src/http.js`); a 429 that never recovers is a retryable
 * refusal, distinguishable from every other failure.
 */

const { withRateLimitRetry, MAX_RETRIES } = require('@skitterbyte/skitterspec-provider-kit/src/http.js')
const { mdToAdf, adfToText } = require('./adf.js')
const { authHeader } = require('./credentials.js')

// A refusal Jira itself expressed — its `errorMessages` / field `errors` —
// kept apart from transport failures so callers can report cause, not symptom.
class JiraRefusal extends Error {
  constructor(message, { status = null, retryable = false, errors = null } = {}) {
    super(message)
    this.name = 'JiraRefusal'
    this.status = status
    this.retryable = retryable
    this.errors = errors
  }
}

function refusalFrom(status, body) {
  const messages = []
  if (body && Array.isArray(body.errorMessages)) messages.push(...body.errorMessages)
  if (body && body.errors && typeof body.errors === 'object') {
    for (const [field, msg] of Object.entries(body.errors)) messages.push(`${field}: ${msg}`)
  }
  const joined = messages.length ? messages.join('; ') : `HTTP ${status}`
  return new JiraRefusal(`Jira refused the request: ${joined}`, { status, errors: body && body.errors })
}

/**
 * Wrap credential + site into the typed ops the engine uses. Injected `fetch`
 * and `sleep` make every op testable offline.
 */
function makeApiAdapter({ siteUrl, email, token, fetch: fetchImpl, sleep, maxRetries = MAX_RETRIES }) {
  const doFetch = fetchImpl || globalThis.fetch
  if (typeof doFetch !== 'function') {
    throw new Error('no fetch available — Node 18+ is required for the API transport')
  }
  const site = String(siteUrl || '').replace(/\/+$/, '')
  if (!site) throw new Error('no Jira site URL configured — set jira.siteUrl in specs/.core/jira.config.json')
  const base = `${site}/rest/api/3`
  const auth = authHeader({ email, token })

  async function request(method, pathname, { query, body, allow404 = false } = {}) {
    const url = new URL(base + pathname)
    for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, String(v))
    const { response: res, exhausted } = await withRateLimitRetry(
      async () => {
        try {
          return await doFetch(url.toString(), {
            method,
            headers: {
              Authorization: auth,
              Accept: 'application/json',
              ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          })
        } catch (cause) {
          throw new Error(`Jira unreachable: ${cause && cause.message ? cause.message : cause}`)
        }
      },
      { sleep, maxRetries },
    )
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Jira rejected the credentials (HTTP ${res.status}) — check the email and API token`,
      )
    }
    if (exhausted) {
      throw new JiraRefusal(
        `Jira rate-limited this request and did not recover after ${maxRetries} retries`,
        { status: 429, retryable: true },
      )
    }
    if (res.status === 404 && allow404) return null
    if (res.status === 204) return {}
    let parsed = null
    try {
      parsed = await res.json()
    } catch {
      parsed = null
    }
    if (!res.ok) throw refusalFrom(res.status, parsed)
    return parsed
  }

  const ISSUE_FIELDS = 'summary,description,status,assignee,parent,subtasks'

  const urlOf = (key) => `${site}/browse/${key}`

  function normalizeIssue(raw) {
    if (!raw || !raw.key) return null
    const f = raw.fields || {}
    return {
      id: String(raw.id),
      identifier: raw.key,
      url: urlOf(raw.key),
      title: f.summary != null ? f.summary : null,
      // Text at the boundary: ADF never escapes the adapter.
      description: f.description != null ? adfToText(f.description) : null,
      state: f.status ? { name: f.status.name } : null,
      assignee: f.assignee ? { id: f.assignee.accountId, name: f.assignee.displayName || null } : null,
      parent: f.parent ? { id: String(f.parent.id), identifier: f.parent.key } : null,
      subtasks: Array.isArray(f.subtasks)
        ? f.subtasks.map((s) => ({
            id: String(s.id),
            identifier: s.key,
            title: s.fields && s.fields.summary != null ? s.fields.summary : null,
            state: s.fields && s.fields.status ? { name: s.fields.status.name } : null,
          }))
        : [],
    }
  }

  // Build the writable `fields` payload from engine-shaped input. Only keys
  // that are PRESENT are sent — `undefined` means "say nothing", `null` means
  // "clear it" (assignee only; a null description clears to empty).
  function issueFields(input, { forCreate = false, projectKey, issueTypeName } = {}) {
    const fields = {}
    if (forCreate) {
      fields.project = { key: projectKey }
      fields.issuetype = { name: issueTypeName }
    }
    if (input.title !== undefined) fields.summary = input.title
    if (input.description !== undefined) {
      fields.description = input.description == null ? null : mdToAdf(input.description)
    }
    if (input.assigneeId !== undefined) {
      fields.assignee = input.assigneeId == null ? null : { accountId: input.assigneeId }
    }
    return fields
  }

  return {
    async readIssue(keyOrId) {
      const raw = await request('GET', `/issue/${encodeURIComponent(keyOrId)}`, {
        query: { fields: ISSUE_FIELDS },
        allow404: true,
      })
      return normalizeIssue(raw)
    },

    async createIssue({ title, description, assigneeId, projectKey, issueTypeName }) {
      const created = await request('POST', '/issue', {
        body: { fields: issueFields({ title, description, assigneeId }, { forCreate: true, projectKey, issueTypeName }) },
      })
      if (!created || !created.key) throw new Error('Jira returned no issue for the create')
      return { id: String(created.id), identifier: created.key, url: urlOf(created.key) }
    },

    async createSubIssue(parentId, { title, description, projectKey, subtaskTypeName }) {
      const fields = issueFields({ title, description }, { forCreate: true, projectKey, issueTypeName: subtaskTypeName })
      fields.parent = { id: String(parentId) }
      const created = await request('POST', '/issue', { body: { fields } })
      if (!created || !created.key) throw new Error('Jira returned no issue for the subtask create')
      return { id: String(created.id), identifier: created.key, url: urlOf(created.key) }
    },

    async updateIssue(keyOrId, updates) {
      const fields = issueFields(updates)
      if (!Object.keys(fields).length) return {}
      return request('PUT', `/issue/${encodeURIComponent(keyOrId)}`, { body: { fields } })
    },

    async listTransitions(keyOrId) {
      const raw = await request('GET', `/issue/${encodeURIComponent(keyOrId)}/transitions`)
      return ((raw && raw.transitions) || []).map((t) => ({
        id: String(t.id),
        name: t.name,
        to: t.to ? { name: t.to.name } : null,
      }))
    },

    /**
     * Move an issue to the status named `targetStatus`, by whichever available
     * transition lands there. `{ moved: false, already: true }` when the issue
     * is already sitting on it — the idempotent case, not a failure.
     */
    async transitionTo(keyOrId, targetStatus) {
      const want = String(targetStatus || '').toLowerCase().trim()
      const transitions = await this.listTransitions(keyOrId)
      const hit = transitions.find((t) => t.to && String(t.to.name).toLowerCase().trim() === want)
      if (!hit) {
        const current = await this.readIssue(keyOrId)
        const at = current && current.state ? current.state.name : null
        if (at && String(at).toLowerCase().trim() === want) return { moved: false, already: true }
        const names = transitions.map((t) => `"${t.to ? t.to.name : t.name}"`).join(', ') || '(none)'
        throw new JiraRefusal(
          `no transition from ${keyOrId}'s current status${at ? ` "${at}"` : ''} reaches "${targetStatus}" — ` +
            `available: ${names}. The workflow may need an intermediate step; this engine does not path-find.`,
          { status: null },
        )
      }
      await request('POST', `/issue/${encodeURIComponent(keyOrId)}/transitions`, {
        body: { transition: { id: hit.id } },
      })
      return { moved: true, via: hit.name }
    },

    /**
     * Issues whose summary contains `query`, scoped to a project when given.
     * JQL strings escape embedded quotes; result shape matches `readIssue`'s
     * essentials (the twin-mint guard needs identifier + title).
     */
    async searchIssues({ query, projectKey, limit = 50 }) {
      const quoted = String(query || '').replace(/(["\\])/g, '\\$1')
      const jql = [projectKey ? `project = "${projectKey}"` : null, quoted ? `summary ~ "${quoted}"` : null]
        .filter(Boolean)
        .join(' AND ')
      const raw = await request('GET', '/search/jql', {
        query: { jql, fields: 'summary,status,parent', maxResults: limit },
      })
      return ((raw && raw.issues) || []).map((i) => ({
        id: String(i.id),
        identifier: i.key,
        title: i.fields && i.fields.summary != null ? i.fields.summary : null,
        state: i.fields && i.fields.status ? { name: i.fields.status.name } : null,
        parent: i.fields && i.fields.parent ? { id: String(i.fields.parent.id), identifier: i.fields.parent.key } : null,
      }))
    },

    /**
     * The status names this project's workflows can express, deduped across
     * issue types — what `states` validation checks the config against.
     */
    async listIssueStates(projectKey) {
      const raw = await request('GET', `/project/${encodeURIComponent(projectKey)}/statuses`)
      const names = new Map()
      for (const type of raw || []) {
        for (const status of type.statuses || []) {
          if (status && status.name && !names.has(status.name)) {
            names.set(status.name, { id: String(status.id), name: status.name })
          }
        }
      }
      return [...names.values()]
    },

    async readViewer() {
      const raw = await request('GET', '/myself')
      if (!raw || !raw.accountId) return null
      return { id: raw.accountId, name: raw.displayName || null, email: raw.emailAddress || null }
    },

    async searchUsers({ query, limit = 20 }) {
      const raw = await request('GET', '/user/search', { query: { query, maxResults: limit } })
      return (raw || []).map((u) => ({ id: u.accountId, name: u.displayName || null, email: u.emailAddress || null }))
    },

    async listComments(keyOrId) {
      const raw = await request('GET', `/issue/${encodeURIComponent(keyOrId)}/comment`)
      return ((raw && raw.comments) || []).map((c) => ({ id: String(c.id), body: adfToText(c.body) }))
    },

    async createComment(keyOrId, mdBody) {
      const raw = await request('POST', `/issue/${encodeURIComponent(keyOrId)}/comment`, {
        body: { body: mdToAdf(mdBody) },
      })
      return raw && raw.id ? { id: String(raw.id) } : null
    },
  }
}

module.exports = { makeApiAdapter, JiraRefusal, adfToText, mdToAdf }
