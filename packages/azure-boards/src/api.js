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
function makeApiAdapter({ orgUrl, project, token, fetch: fetchImpl, sleep, maxRetries = MAX_RETRIES, bodyFieldByType = {} }) {
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

  // The field a TYPE's body lives in (`azure.bodyFieldByType`), falling back
  // to System.Description. On an Agile/Scrum/CMMI Bug form the Description
  // field is not shown — the body belongs in Repro Steps — so the field is
  // resolved per type and used symmetrically on write AND read: a write-only
  // mapping would make every pushed Bug read back as edited. Type names
  // compare case-insensitively, matching how humans copy them off the form.
  const bodyFields = Object.entries(bodyFieldByType || {}).map(([t, f]) => [String(t).toLowerCase(), f])
  function bodyFieldFor(workItemType) {
    const want = String(workItemType || '').toLowerCase()
    const hit = bodyFields.find(([t]) => t === want)
    return hit ? hit[1] : 'System.Description'
  }

  // Text at the boundary: a markdown-format description is entity-DECODED —
  // Azure encodes stray HTML specials on store (`>` → `&gt;`, `"` → `&quot;`,
  // observed live), so the decode is the inverse of the store, and what comes
  // out is the author's text. An HTML-era one is reduced to text, and the
  // format map is the positive signal that decides — the tag sniff only covers
  // items too old to carry one.
  function descriptionText(raw) {
    const field = bodyFieldFor(raw.fields && raw.fields['System.WorkItemType'])
    let d = raw.fields && raw.fields[field]
    let read = field
    // A MAPPED FIELD THAT IS EMPTY FALLS BACK TO System.Description,
    // deliberately: an item minted before the mapping holds its body there,
    // and reading null would accuse it of an edit it never had. The blind
    // spot: a Repro Steps someone deliberately CLEARED in Boards reads as the
    // stale Description until the next push rewrites it.
    if ((d == null || d === '') && field !== 'System.Description') {
      d = raw.fields && raw.fields['System.Description']
      read = 'System.Description'
    }
    if (d == null) return null
    const text = String(d)
    const fmt = raw.multilineFieldsFormat && raw.multilineFieldsFormat[read]
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
  function itemPatch(input, bodyField = 'System.Description') {
    const ops = []
    const add = (path, value) => ops.push({ op: 'add', path, value })
    if (input.title !== undefined) add('/fields/System.Title', input.title)
    if (input.description !== undefined) {
      add(`/fields/${bodyField}`, input.description == null ? '' : input.description)
      // The write format, declared beside the field. One-way by Azure's rule —
      // a field saved as markdown cannot revert to HTML — which is fine: this
      // provider never writes HTML.
      add(`/multilineFieldsFormat/${bodyField}`, 'Markdown')
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

  /**
   * Add `tag` to each work item that lacks it; returns how many were written.
   * An `add` on System.Tags REPLACES the whole value, so the write is the
   * item's existing tags plus the new one. Azure compares tags
   * case-insensitively, so the presence check does too.
   */
  async function tagTickets(ids, tag) {
    const items = await batchRead(ids, ['System.Tags'])
    const want = String(tag).toLowerCase()
    let tagged = 0
    for (const item of items) {
      if (item.tags.some((t) => t.toLowerCase() === want)) continue
      await request('PATCH', `${projectBase}/wit/workitems/${encodeURIComponent(item.id)}`, {
        body: [{ op: 'add', path: '/fields/System.Tags', value: [...item.tags, tag].join('; ') }],
        patch: true,
      })
      tagged++
    }
    return tagged
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
        { body: itemPatch({ title, description, assigneeId, areaPath }, bodyFieldFor(workItemType)), patch: true },
      )
      if (!created || created.id == null) throw new Error('Azure DevOps returned no work item for the create')
      return { id: String(created.id), identifier: identifierOf(created.id), url: urlOf(created.id) }
    },

    async createSubIssue(parentId, { title, description, childType, areaPath }) {
      const ops = itemPatch({ title, description, areaPath }, bodyFieldFor(childType))
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
      // An update does not know the item's type, and the body field hangs off
      // it — so when a description is being written AND a mapping exists, one
      // field read answers it. With no mapping the read is skipped and the
      // patch is byte-identical to before.
      let bodyField = 'System.Description'
      if (updates.description !== undefined && bodyFields.length) {
        const raw = await request('GET', `${projectBase}/wit/workitems/${encodeURIComponent(numId(id))}`, {
          query: { fields: 'System.WorkItemType' },
        })
        bodyField = bodyFieldFor(raw && raw.fields && raw.fields['System.WorkItemType'])
      }
      const ops = itemPatch(updates, bodyField)
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
    // `assignedTo` is the uniqueName/email `whoami` and `users` return — the
    // value `System.AssignedTo` itself accepts, so WIQL matches it directly.
    //
    // `states` limits to those state names; `orderBy` is a field reference to
    // sort by, ascending — `list --next` passes the backlog's rank field, and
    // WIQL returns ids in that order, which `batchRead` is then made to keep.
    async searchIssues({ query, workItemType, assignedTo = null, states = null, orderBy = null, limit = 50 }) {
      const q = (v) => `'${String(v).replace(/'/g, "''")}'`
      const quoted = String(query || '').replace(/'/g, "''")
      const clauses = [
        '[System.TeamProject] = @project',
        workItemType ? `[System.WorkItemType] = ${q(workItemType)}` : null,
        quoted ? `[System.Title] CONTAINS '${quoted}'` : null,
        assignedTo ? `[System.AssignedTo] = ${q(assignedTo)}` : null,
        states && states.length ? `[System.State] IN (${states.map(q).join(', ')})` : null,
      ].filter(Boolean)
      const order = orderBy && /^[A-Za-z0-9_.]+$/.test(orderBy) ? ` ORDER BY [${orderBy}] ASC` : ''
      const raw = await request('POST', `${projectBase}/wit/wiql`, {
        query: { $top: limit },
        body: { query: `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(' AND ')}${order}` },
      })
      const ids = ((raw && raw.workItems) || []).map((w) => String(w.id))
      const read = await batchRead(ids, ['System.Title', 'System.State', 'System.Parent', 'System.WorkItemType', 'System.AssignedTo'])
      const byId = new Map(read.map((i) => [i.id, i]))
      const items = ids.map((id) => byId.get(id)).filter(Boolean)
      return items.map((i) => ({
        id: i.id,
        identifier: i.identifier,
        title: i.title,
        state: i.state,
        parent: i.parent,
        assignee: i.assignee,
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

    /**
     * The field reference names a work item type carries — what `doctor
     * --check-remote` validates `azure.bodyFieldByType` against. `null` means
     * the TYPE is not in the project (a 404), kept distinct from a type with
     * an empty field list, which Azure does not produce.
     */
    async listTypeFields(workItemType) {
      const raw = await request(
        'GET',
        `${projectBase}/wit/workitemtypes/${encodeURIComponent(workItemType)}/fields`,
        { allow404: true },
      )
      if (raw == null) return null
      return ((raw && raw.value) || []).map((f) => f.referenceName).filter(Boolean)
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
  }
}

module.exports = { makeApiAdapter, AzureRefusal, vsspsUrlOf }
