'use strict'

/**
 * The Azure DevOps REST 7.1 adapter — the one place that speaks Azure's
 * protocol, and the boundary HTML never crosses.
 *
 * Every op takes and returns the engine's shapes: descriptions go in as
 * markdown (written verbatim, with `multilineFieldsFormat` set beside the
 * field — the phase 1 spike round-tripped it byte-identical) and come back as
 * markdown or, for an HTML-era item, as reduced text (`dialect.js` converts at
 * this boundary). A work item's state comes back as `{ name }`, an assignee as
 * `{ id, name, email }`.
 *
 * STATUS MOVES BY DIRECT WRITE, RULE-AWARE. Unlike Jira there is no transition
 * API: `System.State` is PATCHed directly, and a process rule that refuses the
 * move answers HTTP 400 `RuleValidationException`. The adapter relays that as
 * a loud, named refusal listing the states the type DOES have — a positive
 * signal, never a pre-computed guess about workflow legality.
 *
 * Auth is basic (empty user, PAT as password). 401/403 are phrased for the
 * human holding the token — and so is 203, which is Azure's shape for a bad
 * PAT: it answers the sign-in page with 203 Non-Authoritative rather than
 * refusing outright. 429 waits and retries via the kit's shared discipline
 * (`provider-kit/src/http.js`).
 */

const { withRateLimitRetry, MAX_RETRIES } = require('@skitterbyte/skitterspec-provider-kit/src/http.js')
const { htmlToText, looksLikeHtml, decodeEntities } = require('./dialect.js')
const { authHeader } = require('./credentials.js')

const API_VERSION = '7.1'
// Comments are still a preview surface in 7.1; this is the version the spike
// confirmed takes `format=markdown`.
const COMMENTS_API_VERSION = '7.1-preview.4'

// A refusal Azure itself expressed — its `message`/`typeKey` — kept apart from
// transport failures so callers can report cause, not symptom.
class AzureRefusal extends Error {
  constructor(message, { status = null, retryable = false, typeKey = null } = {}) {
    super(message)
    this.name = 'AzureRefusal'
    this.status = status
    this.retryable = retryable
    this.typeKey = typeKey
  }
}

function refusalFrom(status, body) {
  const message = body && typeof body.message === 'string' && body.message ? body.message : `HTTP ${status}`
  return new AzureRefusal(`Azure DevOps refused the request: ${message}`, {
    status,
    typeKey: (body && body.typeKey) || null,
  })
}

// The vssps host that serves identity lookups for an organization. Only the
// two hosted shapes are known; anything else returns null and `searchUsers`
// names the gap rather than guessing a hostname.
function vsspsUrlOf(orgUrl) {
  const dev = /^https:\/\/dev\.azure\.com\/([^/]+)/.exec(orgUrl)
  if (dev) return `https://vssps.dev.azure.com/${dev[1]}`
  const legacy = /^https:\/\/([^./]+)\.visualstudio\.com/.exec(orgUrl)
  if (legacy) return `https://${legacy[1]}.vssps.visualstudio.com`
  return null
}

/**
 * Wrap credential + org/project into the typed ops the engine uses. Injected
 * `fetch` and `sleep` make every op testable offline.
 */
function makeApiAdapter({ orgUrl, project, token, releaseType, fetch: fetchImpl, sleep, maxRetries = MAX_RETRIES }) {
  const doFetch = fetchImpl || globalThis.fetch
  if (typeof doFetch !== 'function') {
    throw new Error('no fetch available — Node 18+ is required for the API transport')
  }
  const org = String(orgUrl || '').replace(/\/+$/, '')
  if (!org) {
    throw new Error('no Azure DevOps org URL configured — set azure.orgUrl in specs/.core/azure-boards.config.json')
  }
  const proj = String(project || '')
  if (!proj) {
    throw new Error('no Azure DevOps project configured — set azure.project in specs/.core/azure-boards.config.json')
  }
  const projectBase = `${org}/${encodeURIComponent(proj)}/_apis`
  const auth = authHeader({ token })

  // JSON Patch is its own media type, and Azure refuses a patch document sent
  // as plain application/json.
  async function request(method, url, { query, body, patch = false, allow404 = false } = {}) {
    const target = new URL(url)
    for (const [k, v] of Object.entries(query || {})) if (v != null) target.searchParams.set(k, String(v))
    if (!target.searchParams.has('api-version')) target.searchParams.set('api-version', API_VERSION)
    const { response: res, exhausted } = await withRateLimitRetry(
      async () => {
        try {
          return await doFetch(target.toString(), {
            method,
            headers: {
              Authorization: auth,
              Accept: 'application/json',
              ...(body !== undefined
                ? { 'Content-Type': patch ? 'application/json-patch+json' : 'application/json' }
                : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          })
        } catch (cause) {
          throw new Error(`Azure DevOps unreachable: ${cause && cause.message ? cause.message : cause}`)
        }
      },
      { sleep, maxRetries },
    )
    // 203 is Azure's bad-PAT answer: the sign-in page, served as
    // Non-Authoritative instead of a refusal. Naming it here is what keeps
    // "expired token" from surfacing as a JSON parse error.
    if (res.status === 401 || res.status === 403 || res.status === 203) {
      throw new Error(
        `Azure DevOps rejected the credentials (HTTP ${res.status}) — check the PAT, its expiry, and its scopes`,
      )
    }
    if (exhausted) {
      throw new AzureRefusal(
        `Azure DevOps rate-limited this request and did not recover after ${maxRetries} retries`,
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

  // Ops accept the identifier as well as the bare number: the kit hands back
  // whatever was stamped ("AB#4"), and the REST paths want the digits.
  const numId = (v) => String(v).replace(/^AB#/, '')
  const urlOf = (id) => `${org}/${encodeURIComponent(proj)}/_workitems/edit/${id}`
  const identifierOf = (id) => `AB#${id}`
  const itemApiUrl = (id) => `${org}/_apis/wit/workItems/${id}`

  const CHILD_REL = 'System.LinkTypes.Hierarchy-Forward'
  const PARENT_REL = 'System.LinkTypes.Hierarchy-Reverse'

  const idFromRelationUrl = (url) => {
    const m = /\/workItems\/(\d+)$/i.exec(String(url || ''))
    return m ? m[1] : null
  }

  // Text at the boundary: a markdown-format description is entity-DECODED —
  // Azure encodes stray HTML specials on store (`>` → `&gt;`, `"` → `&quot;`,
  // observed live), so the decode is the inverse of the store, and what comes
  // out is the author's text. An HTML-era one is reduced to text, and the
  // format map is the positive signal that decides — the tag sniff only covers
  // items too old to carry one.
  function descriptionText(raw) {
    const d = raw.fields && raw.fields['System.Description']
    if (d == null) return null
    const text = String(d)
    const fmt = raw.multilineFieldsFormat && raw.multilineFieldsFormat['System.Description']
    if (fmt && String(fmt).toLowerCase() === 'markdown') return decodeEntities(text)
    return looksLikeHtml(text) ? htmlToText(text) : text
  }

  function normalizeItem(raw) {
    if (!raw || raw.id == null) return null
    const f = raw.fields || {}
    const assignee = f['System.AssignedTo']
    const parentId = f['System.Parent']
    return {
      id: String(raw.id),
      identifier: identifierOf(raw.id),
      url: urlOf(raw.id),
      title: f['System.Title'] != null ? f['System.Title'] : null,
      description: descriptionText(raw),
      state: f['System.State'] != null ? { name: f['System.State'] } : null,
      type: f['System.WorkItemType'] != null ? f['System.WorkItemType'] : null,
      assignee: assignee
        ? {
            id: assignee.id || null,
            name: assignee.displayName || null,
            email: assignee.uniqueName || null,
          }
        : null,
      // Boards stores tags as one `; `-joined string.
      tags: f['System.Tags'] ? String(f['System.Tags']).split(';').map((t) => t.trim()).filter(Boolean) : [],
      parent: parentId != null ? { id: String(parentId), identifier: identifierOf(parentId) } : null,
      subtasks: [],
    }
  }

  /**
   * Build the JSON Patch for engine-shaped input. Only keys that are PRESENT
   * become ops — `undefined` means "say nothing". A null description clears
   * the field; a null assignee unassigns (Azure clears on empty string).
   */
  function itemPatch(input) {
    const ops = []
    const add = (path, value) => ops.push({ op: 'add', path, value })
    if (input.title !== undefined) add('/fields/System.Title', input.title)
    if (input.description !== undefined) {
      add('/fields/System.Description', input.description == null ? '' : input.description)
      // The write format, declared beside the field. One-way by Azure's rule —
      // a field saved as markdown cannot revert to HTML — which is fine: this
      // provider never writes HTML.
      add('/multilineFieldsFormat/System.Description', 'Markdown')
    }
    if (input.assigneeId !== undefined) {
      add('/fields/System.AssignedTo', input.assigneeId == null ? '' : input.assigneeId)
    }
    if (input.areaPath) add('/fields/System.AreaPath', input.areaPath)
    return ops
  }

  // Titles and states for a set of ids in one call — what keeps a parent's
  // child listing from being one GET per child.
  async function batchRead(ids, fields) {
    if (!ids.length) return []
    const raw = await request('POST', `${projectBase}/wit/workitemsbatch`, {
      body: { ids: ids.map(Number), fields },
    })
    return ((raw && raw.value) || []).map((item) => normalizeItem(item)).filter(Boolean)
  }

  return {
    async readIssue(id) {
      // $expand=relations cannot be combined with a fields list — Azure
      // refuses the pair — so the full item comes back and normalize picks.
      const raw = await request('GET', `${projectBase}/wit/workitems/${encodeURIComponent(numId(id))}`, {
        query: { $expand: 'relations' },
        allow404: true,
      })
      const item = normalizeItem(raw)
      if (!item) return null
      const childIds = ((raw && raw.relations) || [])
        .filter((r) => r && r.rel === CHILD_REL)
        .map((r) => idFromRelationUrl(r.url))
        .filter(Boolean)
      const children = await batchRead(childIds, ['System.Title', 'System.State'])
      item.subtasks = children.map((c) => ({
        id: c.id,
        identifier: c.identifier,
        title: c.title,
        state: c.state,
      }))
      return item
    },

    async createIssue({ title, description, assigneeId, workItemType, areaPath }) {
      const created = await request(
        'POST',
        `${projectBase}/wit/workitems/$${encodeURIComponent(workItemType)}`,
        { body: itemPatch({ title, description, assigneeId, areaPath }), patch: true },
      )
      if (!created || created.id == null) throw new Error('Azure DevOps returned no work item for the create')
      return { id: String(created.id), identifier: identifierOf(created.id), url: urlOf(created.id) }
    },

    async createSubIssue(parentId, { title, description, childType, areaPath }) {
      const ops = itemPatch({ title, description, areaPath })
      ops.push({
        op: 'add',
        path: '/relations/-',
        value: { rel: PARENT_REL, url: itemApiUrl(numId(parentId)) },
      })
      const created = await request(
        'POST',
        `${projectBase}/wit/workitems/$${encodeURIComponent(childType)}`,
        { body: ops, patch: true },
      )
      if (!created || created.id == null) throw new Error('Azure DevOps returned no work item for the child create')
      return { id: String(created.id), identifier: identifierOf(created.id), url: urlOf(created.id) }
    },

    async updateIssue(id, updates) {
      const ops = itemPatch(updates)
      if (!ops.length) return {}
      return request('PATCH', `${projectBase}/wit/workitems/${encodeURIComponent(numId(id))}`, {
        body: ops,
        patch: true,
      })
    },

    /**
     * Move a work item to the state named `targetState`, by direct write.
     * `{ moved: false, already: true }` when the item is already sitting on
     * it — the idempotent case, not a failure. A write the process refuses
     * comes back as a named refusal listing the states the type DOES have.
     */
    async transitionTo(id, targetState) {
      const want = String(targetState || '').toLowerCase().trim()
      const current = await this.readIssue(id)
      const at = current && current.state ? current.state.name : null
      if (at && String(at).toLowerCase().trim() === want) return { moved: false, already: true }
      try {
        await request('PATCH', `${projectBase}/wit/workitems/${encodeURIComponent(numId(id))}`, {
          body: [{ op: 'add', path: '/fields/System.State', value: targetState }],
          patch: true,
        })
      } catch (error) {
        if (error instanceof AzureRefusal && error.status === 400) {
          // The positive signal: the states this type actually has, so the
          // refusal names what exists instead of only what failed.
          let names = '(could not list them)'
          try {
            const states = await this.listIssueStates(current && current.type)
            names = states.map((s) => `"${s.name}"`).join(', ') || '(none)'
          } catch {
            /* the listing is garnish on a refusal already decided */
          }
          throw new AzureRefusal(
            `Azure DevOps refused moving ${identifierOf(id)}${at ? ` from "${at}"` : ''} to "${targetState}" — ` +
              `${error.message}. States this type has: ${names}.`,
            { status: error.status, typeKey: error.typeKey },
          )
        }
        throw error
      }
      return { moved: true }
    },

    /**
     * Work items whose title contains `query`, scoped to the configured
     * project. WIQL strings escape embedded quotes by doubling; result shape
     * matches `readIssue`'s essentials (the twin-mint guard needs identifier +
     * title).
     */
    async searchIssues({ query, workItemType, limit = 50 }) {
      const quoted = String(query || '').replace(/'/g, "''")
      const clauses = [
        '[System.TeamProject] = @project',
        workItemType ? `[System.WorkItemType] = '${String(workItemType).replace(/'/g, "''")}'` : null,
        quoted ? `[System.Title] CONTAINS '${quoted}'` : null,
      ].filter(Boolean)
      const raw = await request('POST', `${projectBase}/wit/wiql`, {
        query: { $top: limit },
        body: { query: `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(' AND ')}` },
      })
      const ids = ((raw && raw.workItems) || []).map((w) => String(w.id))
      const items = await batchRead(ids, ['System.Title', 'System.State', 'System.Parent', 'System.WorkItemType'])
      return items.map((i) => ({
        id: i.id,
        identifier: i.identifier,
        title: i.title,
        state: i.state,
        parent: i.parent,
      }))
    },

    /**
     * The state names this work item type can hold, with their categories —
     * what `states` validation checks the config against, and what an
     * unknown-state refusal lists.
     */
    async listIssueStates(workItemType) {
      const raw = await request(
        'GET',
        `${projectBase}/wit/workitemtypes/${encodeURIComponent(workItemType)}/states`,
      )
      return ((raw && raw.value) || []).map((s) => ({
        name: s.name,
        // The category (Proposed / InProgress / Completed / Removed) is what
        // boards key off — a different axis from the name, and a free sanity
        // check wherever the names are listed.
        category: s.category || null,
      }))
    },

    // The authenticated user, from connectionData — the one identity read
    // that needs no scope beyond the PAT being valid (phase 1 spike).
    // A PREVIEW resource: plain 7.1 is refused ("the -preview flag must be
    // supplied"), found live in the phase 7 smoke.
    async readViewer() {
      const raw = await request('GET', `${org}/_apis/connectionData`, {
        query: { 'api-version': '7.1-preview.1' },
      })
      const u = raw && raw.authenticatedUser
      if (!u || !u.id) return null
      const email = (u.properties && u.properties.Account && u.properties.Account.$value) || null
      // The id slot carries the uniqueName/email, because that is what
      // `System.AssignedTo` accepts — Azure refuses the connectionData GUID as
      // an "unknown identity" (live repro, bug-azure-boards-adoption-fixes).
      // The GUID survives only where no account property exists at all.
      return { id: email || u.id, name: u.providerDisplayName || null, email }
    },

    /**
     * Identity search, on the vssps host — the kit's assignment page shape
     * (`{ users, nextCursor }`). This is the op that fails first on a narrow
     * token (phase 1 spike): a PAT without Identity (Read) gets 401 here while
     * every work item op succeeds, so the refusal names the scope.
     */
    async searchUsers(query = '', { limit = 50 } = {}) {
      const vssps = vsspsUrlOf(org)
      if (!vssps) {
        throw new Error(`cannot derive the identity host from ${org} — only dev.azure.com and *.visualstudio.com are known`)
      }
      let raw
      try {
        raw = await request('GET', `${vssps}/_apis/identities`, {
          query: { searchFilter: 'General', filterValue: query },
        })
      } catch (error) {
        if (/rejected the credentials/.test(String(error && error.message))) {
          throw new Error(
            'Azure DevOps refused the identity search — the PAT needs the Identity (Read) scope for `users`; ' +
              'work item ops and `whoami` do not',
          )
        }
        throw error
      }
      const users = ((raw && raw.value) || []).slice(0, limit).map((u) => {
        const email = (u.properties && u.properties.Account && u.properties.Account.$value) || null
        return {
          // The assignable value first: `System.AssignedTo` accepts the
          // uniqueName/email and refuses the vssps GUID, and this id is what
          // `/spec-claim --to` stamps. The GUID remains the fallback for an
          // identity with no account property (a group, a service identity).
          id: email || u.id,
          name: u.providerDisplayName || null,
          email,
          // `isActive` is a positive marker where present; absence is not
          // deactivation, so the default is active.
          active: u.isActive === false ? false : true,
        }
      })
      return { users, nextCursor: null }
    },

    async listComments(id) {
      const raw = await request('GET', `${projectBase}/wit/workItems/${encodeURIComponent(numId(id))}/comments`, {
        query: { 'api-version': COMMENTS_API_VERSION },
      })
      return ((raw && raw.comments) || []).map((c) => ({
        id: String(c.id),
        // HTML-era comments reduce exactly as descriptions do; markdown ones
        // pass through.
        body: c.text != null ? (looksLikeHtml(String(c.text)) ? htmlToText(c.text) : String(c.text)) : '',
      }))
    },

    async createComment(id, mdBody) {
      const raw = await request('POST', `${projectBase}/wit/workItems/${encodeURIComponent(numId(id))}/comments`, {
        query: { 'api-version': COMMENTS_API_VERSION, format: 'markdown' },
        body: { text: mdBody },
      })
      return raw && raw.id != null ? { id: String(raw.id) } : null
    },

    // --- releases (the kit's release seam, `provider-kit/src/releases.js`) ---
    // Boards has no Releases object, so the carrier is ONE WORK ITEM of
    // `releases.workItemType` per release (spec Decision 12): found by exact
    // title, tickets attached as Related links with one comment each,
    // `deployed` moving the ITEM's state, `complete` closing it.

    /**
     * The release work item for a tag, or null. Found by exact-title WIQL
     * under the configured type. TWO hits is a cannot-tell — someone minted a
     * twin by hand — and throws rather than picking one (the kit refuses on a
     * throw, which is the duplicate-safe branch).
     */
    async releaseFind(tag) {
      const quotedTag = String(tag).replace(/'/g, "''")
      const quotedType = String(releaseType || 'Release').replace(/'/g, "''")
      const raw = await request('POST', `${projectBase}/wit/wiql`, {
        body: {
          query:
            `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ` +
            `AND [System.WorkItemType] = '${quotedType}' AND [System.Title] = '${quotedTag}'`,
        },
      })
      const ids = ((raw && raw.workItems) || []).map((w) => w.id)
      if (!ids.length) return null
      if (ids.length > 1) {
        throw new AzureRefusal(
          `${ids.length} "${releaseType || 'Release'}" items are titled "${tag}" (${ids.map(identifierOf).join(', ')}) — cannot tell which is the release`,
          { status: null },
        )
      }
      const item = await this.readIssue(ids[0])
      return item ? { id: item.id, url: item.url, body: item.description || '', state: item.state, type: item.type } : null
    },

    async releaseCreate({ tag, name, body }) {
      const created = await this.createIssue({
        title: name || tag,
        description: body,
        workItemType: releaseType || 'Release',
      })
      return { id: created.id, url: created.url, body: body || '' }
    },

    async releaseUpdate(release, { name, body }) {
      const updates = {}
      if (name != null) updates.title = name
      if (body !== undefined) updates.description = body
      if (Object.keys(updates).length) await this.updateIssue(release.id, updates)
      release.body = body !== undefined ? body : release.body
      return release
    },

    /**
     * Attach each ticket to the release item as a Related link, commenting
     * once on each NEWLY attached ticket. An existing link counts as
     * `already`, which is what makes a CI retry additive rather than noisy.
     */
    async releaseAttach(release, tickets) {
      const raw = await request('GET', `${projectBase}/wit/workitems/${encodeURIComponent(release.id)}`, {
        query: { $expand: 'relations' },
      })
      const linked = new Set(
        ((raw && raw.relations) || [])
          .filter((r) => r && r.rel === 'System.LinkTypes.Related')
          .map((r) => idFromRelationUrl(r.url))
          .filter(Boolean),
      )
      let attached = 0
      let already = 0
      for (const ticket of tickets || []) {
        const ticketId = String(ticket.ref || '').replace(/^AB#/, '')
        if (!/^\d+$/.test(ticketId)) continue
        if (linked.has(ticketId)) {
          already++
          continue
        }
        await request('PATCH', `${projectBase}/wit/workitems/${encodeURIComponent(release.id)}`, {
          body: [{ op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Related', url: itemApiUrl(ticketId) } }],
          patch: true,
        })
        await this.createComment(
          ticketId,
          `Included in release **${raw && raw.fields ? raw.fields['System.Title'] : release.id}**` +
            (release.url ? ` — ${release.url}` : ''),
        )
        attached++
      }
      return { attached, already }
    },

    /**
     * `deployed <env>`: the RELEASE ITEM's state moves to the env's configured
     * state — never each ticket's, which is the two-state-machines trap the
     * per-ticket mapping exists to avoid. `set` is therefore 1.
     */
    async releaseStage(release, stateName) {
      await this.transitionTo(release.id, stateName)
      return { set: 1 }
    },

    /**
     * Close the release item: the type's own Completed-category state, read at
     * run time because a release type's workflow is process-defined like every
     * other. No Completed state is a named refusal, never a guess.
     */
    async releaseComplete(release) {
      const states = await this.listIssueStates(release.type || releaseType || 'Release')
      const done = states.find((s) => s.category === 'Completed')
      if (!done) {
        throw new AzureRefusal(
          `the "${release.type || releaseType || 'Release'}" type has no Completed-category state (has: ${states.map((s) => `"${s.name}"`).join(', ') || 'none'})`,
          { status: null },
        )
      }
      await this.transitionTo(release.id, done.name)
      return release
    },
  }
}

module.exports = { makeApiAdapter, AzureRefusal, vsspsUrlOf }
