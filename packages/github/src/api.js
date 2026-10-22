'use strict'

/**
 * The GitHub adapter — the one place that speaks GitHub's protocol: REST for
 * issues, sub-issues and comments, GraphQL for the Projects v2 board.
 *
 * Every op takes and returns the engine's shapes. An issue's identifier is
 * `#123`, its `id` the number as a string (what every other op accepts back),
 * its workflow state `{ name }` — the BOARD's Status value, never the issue's
 * open/closed — and an assignee `{ id, name }` where the id is the login.
 * Node ids and database ids ride along on the normalised issue for the calls
 * that need them, and are never stamped into a spec.
 *
 * WORKFLOW STATE IS A BOARD FIELD. `setStatus` adds the issue to the board when
 * it is not on it (an issue off the board has no state at all) and sets the
 * Status option by NAME, resolved to an option id against the live field. An
 * unknown name is a loud, named refusal listing the options that DO exist — a
 * positive signal (options listed, target absent), never a guess. The issue's
 * own open/closed is a separate write (`setIssueOpen`); which bucket closes it
 * is config's call (`config.js` `closeReasonFor`), not this module's.
 *
 * Auth is a bearer token. 401 is phrased for the human holding the token;
 * rate limits — a 429, or a 403 carrying `Retry-After` or a spent
 * `X-RateLimit-Remaining` — wait and retry via the kit's shared discipline
 * (`provider-kit/src/http.js`), and one that never recovers is a retryable
 * refusal, distinguishable from every other failure.
 *
 * WHAT WOULD FOOL A 404 HERE: GitHub answers 404, not 403, for a private repo
 * the token cannot see. So a 404 on a READ is "nothing there that this token
 * can see" — the read returns null, the harmless answer — and a 404 on a
 * WRITE is a refusal that names both readings rather than claiming the issue
 * does not exist.
 */

const { withRateLimitRetry, MAX_RETRIES } = require('@skitterbyte/skitterspec-provider-kit/src/http.js')
const { assertBodyFits } = require('./dialect.js')

const API_URL = 'https://api.github.com'
const API_VERSION = '2022-11-28'
const PAGE = 100
// A bound on paging, so a misbehaving server cannot loop us forever. 10 pages
// of 100 is past anything a spec issue carries.
const MAX_PAGES = 10

// A refusal GitHub itself expressed — its `message`, validation `errors`, or
// GraphQL `errors` — kept apart from transport failures so callers can report
// cause, not symptom.
class GitHubRefusal extends Error {
  constructor(message, { status = null, retryable = false, errors = null, created = null } = {}) {
    super(message)
    this.name = 'GitHubRefusal'
    this.status = status
    this.retryable = retryable
    this.errors = errors
    // Set on a refusal that came AFTER something was created (a sub-issue that
    // could not be linked) — the orphan the caller must name.
    this.created = created
  }
}

function refusalFrom(status, body) {
  const parts = []
  if (body && typeof body.message === 'string') parts.push(body.message)
  if (body && Array.isArray(body.errors)) {
    for (const e of body.errors) {
      if (typeof e === 'string') parts.push(e)
      else if (e && (e.message || e.code)) parts.push([e.field, e.message || e.code].filter(Boolean).join(': '))
    }
  }
  const joined = parts.length ? parts.join('; ') : `HTTP ${status}`
  return new GitHubRefusal(`GitHub refused the request: ${joined}`, { status, errors: body && body.errors })
}

// GitHub's rate limits: a 429, or a 403 that says it is one. A plain 403 —
// "Resource not accessible by personal access token" — is NOT retried: it is a
// permissions answer, and waiting changes nothing.
function isLimited(res) {
  if (res.status === 429) return true
  if (res.status !== 403) return false
  const get = res.headers && typeof res.headers.get === 'function' ? (h) => res.headers.get(h) : () => null
  return get('retry-after') != null || get('x-ratelimit-remaining') === '0'
}

// Accept `#12`, `12`, 12, or a normalised issue. Anything else is a caller bug,
// said plainly rather than sent to GitHub as `/issues/NaN`.
function numberOf(ref) {
  if (ref && typeof ref === 'object') return numberOf(ref.number != null ? ref.number : ref.id)
  const m = /^#?(\d+)$/.exec(String(ref == null ? '' : ref).trim())
  if (!m) throw new Error(`not a GitHub issue reference: ${JSON.stringify(ref)} (expected #123 or 123)`)
  return Number(m[1])
}

const identifierOf = (number) => `#${number}`

const BOARD_FRAGMENT = `
fragment Board on ProjectV2 {
  id
  title
  url
  fields(first: 50) {
    nodes {
      ... on ProjectV2SingleSelectField { id name options { id name } }
      ... on ProjectV2FieldCommon { id name }
    }
  }
}`

const BOARD_QUERY = `
query($owner: String!, $number: Int!) {
  repositoryOwner(login: $owner) {
    __typename
    ... on User { projectV2(number: $number) { ...Board } }
    ... on Organization { projectV2(number: $number) { ...Board } }
  }
}
${BOARD_FRAGMENT}`

const ISSUE_QUERY = `
query($owner: String!, $repo: String!, $number: Int!, $status: String!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      id
      databaseId
      number
      title
      body
      url
      state
      stateReason
      assignees(first: 10) { nodes { login name } }
      labels(first: 30) { nodes { name } }
      parent { number }
      subIssues(first: 100) { nodes { number title state } }
      projectItems(first: 20) {
        nodes {
          id
          project { id number owner { __typename ... on User { login } ... on Organization { login } } }
          fieldValueByName(name: $status) { ... on ProjectV2ItemFieldSingleSelectValue { name optionId } }
        }
      }
    }
  }
}`

const ADD_ITEM = `
mutation($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
}`

const SET_OPTION = `
mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(
    input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }
  ) { projectV2Item { id } }
}`

/**
 * Wrap a token and a repo into the typed ops the engine uses. Injected `fetch`
 * and `sleep` make every op testable offline.
 *
 * @param {{ owner, repo, project, statusField?, token, apiUrl?, fetch?, sleep?, maxRetries?, now? }} opts
 */
function makeApiAdapter({
  owner,
  repo,
  project,
  statusField = 'Status',
  token,
  apiUrl = API_URL,
  fetch: fetchImpl,
  sleep,
  now,
  maxRetries = MAX_RETRIES,
}) {
  const doFetch = fetchImpl || globalThis.fetch
  if (typeof doFetch !== 'function') {
    throw new Error('no fetch available — Node 18+ is required for the API transport')
  }
  if (!owner || !repo) {
    throw new Error('no GitHub repo configured — set github.owner and github.repo in specs/.core/github.config.json')
  }
  const base = String(apiUrl).replace(/\/+$/, '')
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

  async function send(method, url, body) {
    const { response: res, exhausted } = await withRateLimitRetry(
      async () => {
        try {
          return await doFetch(url, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': API_VERSION,
              'User-Agent': 'skitterspec',
              ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          })
        } catch (cause) {
          throw new Error(`GitHub unreachable: ${cause && cause.message ? cause.message : cause}`)
        }
      },
      { sleep, maxRetries, isLimited, now },
    )
    if (res.status === 401) {
      throw new Error('GitHub rejected the token (HTTP 401) — check it is valid and has not expired')
    }
    if (exhausted) {
      throw new GitHubRefusal(`GitHub rate-limited this request and did not recover after ${maxRetries} retries`, {
        status: res.status,
        retryable: true,
      })
    }
    return res
  }

  async function parse(res) {
    if (res.status === 204) return {}
    try {
      return await res.json()
    } catch {
      return null
    }
  }

  // REST. `allow404` turns a 404 into null — for READS only (see the header).
  async function rest(method, pathname, { query, body, allow404 = false, withHeaders = false } = {}) {
    const url = new URL(base + pathname)
    for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, String(v))
    const res = await send(method, url.toString(), body)
    if (res.status === 404 && allow404) return withHeaders ? { body: null, headers: res.headers } : null
    const parsed = await parse(res)
    if (res.status === 404) {
      throw new GitHubRefusal(
        `GitHub answered 404 for ${method} ${pathname} — the issue or repo does not exist, ` +
          'or this token cannot see it (GitHub answers 404 for both). Check github.owner/repo and the token\'s `repo` scope.',
        { status: 404 },
      )
    }
    if (!res.ok) throw refusalFrom(res.status, parsed)
    return withHeaders ? { body: parsed, headers: res.headers } : parsed
  }

  // Every page of a list endpoint, bounded (`MAX_PAGES`).
  async function restAll(pathname, query = {}) {
    const out = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const got = await rest('GET', pathname, { query: { ...query, per_page: PAGE, page } })
      const items = Array.isArray(got) ? got : []
      out.push(...items)
      if (items.length < PAGE) break
    }
    return out
  }

  // GraphQL. A NOT_FOUND error with `allowMissing` resolves to the data as far
  // as it got (the missing node is null there); every other error is a refusal.
  async function graphql(query, variables, { allowMissing = false } = {}) {
    const res = await send('POST', `${base}/graphql`, { query, variables })
    const parsed = await parse(res)
    if (!res.ok) throw refusalFrom(res.status, parsed)
    const errors = (parsed && Array.isArray(parsed.errors) && parsed.errors) || []
    const fatal = errors.filter((e) => !(allowMissing && e && e.type === 'NOT_FOUND'))
    if (fatal.length) {
      const scopes = fatal.some((e) => e && e.type === 'INSUFFICIENT_SCOPES')
      throw new GitHubRefusal(
        `GitHub refused the request: ${fatal.map((e) => (e && e.message) || String(e)).join('; ')}` +
          (scopes ? ' — a classic token needs the `repo` and `project` scopes' : ''),
        { errors: fatal },
      )
    }
    return (parsed && parsed.data) || {}
  }

  const sameLogin = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase()

  // The board item for THIS repo's board among an issue's project items:
  // matched by number AND owner, because two owners can each have a board 7.
  function boardItemOf(raw) {
    const items = (raw && raw.projectItems && raw.projectItems.nodes) || []
    return (
      items.find(
        (n) => n && n.project && n.project.number === project && n.project.owner && sameLogin(n.project.owner.login, owner),
      ) || null
    )
  }

  function normalizeIssue(raw) {
    if (!raw || raw.number == null) return null
    const item = boardItemOf(raw)
    const status = item && item.fieldValueByName && item.fieldValueByName.name != null ? item.fieldValueByName.name : null
    const assignee = raw.assignees && raw.assignees.nodes && raw.assignees.nodes[0]
    return {
      id: String(raw.number),
      number: raw.number,
      identifier: identifierOf(raw.number),
      url: raw.url || null,
      nodeId: raw.id || null,
      databaseId: raw.databaseId != null ? raw.databaseId : null,
      title: raw.title != null ? raw.title : null,
      // An empty body comes back null; to the engine that is the empty text,
      // not an unknown.
      description: raw.body == null ? '' : String(raw.body),
      state: status != null ? { name: status } : null,
      open: raw.state === 'OPEN',
      stateReason: raw.stateReason ? String(raw.stateReason).toLowerCase() : null,
      onBoard: !!item,
      boardItemId: item ? item.id : null,
      assignee: assignee ? { id: assignee.login, name: assignee.name || assignee.login } : null,
      labels: ((raw.labels && raw.labels.nodes) || []).map((l) => l && l.name).filter(Boolean),
      parent: raw.parent && raw.parent.number != null ? { id: String(raw.parent.number), identifier: identifierOf(raw.parent.number) } : null,
      subtasks: ((raw.subIssues && raw.subIssues.nodes) || []).map((s) => ({
        id: String(s.number),
        identifier: identifierOf(s.number),
        title: s.title != null ? s.title : null,
        open: s.state === 'OPEN',
      })),
    }
  }

  // The REST create payload from engine-shaped input. Only PRESENT keys are
  // sent — `undefined` means "say nothing", `null` means "clear it" (assignee).
  function issuePayload(input, { forCreate = false } = {}) {
    const body = {}
    if (input.title !== undefined) body.title = input.title
    if (input.description !== undefined) {
      assertBodyFits(input.description, input.title ? `"${input.title}"` : 'this issue body')
      body.body = input.description == null ? '' : input.description
    }
    if (input.assigneeId !== undefined) body.assignees = input.assigneeId == null ? [] : [input.assigneeId]
    if (input.labels !== undefined) body.labels = input.labels || []
    // Issue types exist on org-owned repos only; sending one elsewhere is a
    // 422, so it is sent only when the caller names one.
    if (forCreate && input.type) body.type = input.type
    return body
  }

  const created = (raw) => ({
    id: String(raw.number),
    identifier: identifierOf(raw.number),
    url: raw.html_url || null,
    nodeId: raw.node_id || null,
    databaseId: raw.id != null ? raw.id : null,
  })

  let boardCache = null

  async function resolveBoard() {
    if (boardCache) return boardCache
    if (!project) {
      throw new GitHubRefusal('no board configured — set github.project to the board number from its URL')
    }
    const data = await graphql(BOARD_QUERY, { owner, number: project }, { allowMissing: true })
    const ownerNode = data.repositoryOwner
    const board = ownerNode && ownerNode.projectV2
    if (!board || !board.id) {
      throw new GitHubRefusal(
        `no board ${project} owned by ${owner} that this token can see — check github.project ` +
          '(the number in the board URL) and that the token has the `project` scope',
      )
    }
    boardCache = {
      id: board.id,
      title: board.title || null,
      url: board.url || null,
      fields: ((board.fields && board.fields.nodes) || [])
        .filter((f) => f && f.id && f.name)
        .map((f) => ({ id: f.id, name: f.name, options: Array.isArray(f.options) ? f.options.map((o) => ({ id: o.id, name: o.name })) : null })),
    }
    return boardCache
  }

  async function singleSelect(fieldName) {
    const board = await resolveBoard()
    const want = String(fieldName || '').toLowerCase().trim()
    const field = board.fields.find((f) => String(f.name).toLowerCase().trim() === want)
    if (!field || !field.options) {
      const singles = board.fields.filter((f) => f.options).map((f) => `"${f.name}"`).join(', ') || '(none)'
      throw new GitHubRefusal(
        `the board has no single-select field "${fieldName}" — single-select fields: ${singles}. ` +
          'Create it on the board, or point github.statusField at the right one.',
      )
    }
    return { board, field }
  }

  async function optionFor(fieldName, optionName) {
    const { board, field } = await singleSelect(fieldName)
    const want = String(optionName || '').toLowerCase().trim()
    const option = field.options.find((o) => String(o.name).toLowerCase().trim() === want)
    if (!option) {
      const names = field.options.map((o) => `"${o.name}"`).join(', ') || '(none)'
      throw new GitHubRefusal(
        `the board's "${field.name}" field has no option "${optionName}" — options: ${names}. ` +
          'Add the option on the board, or fix the name in github.config.json `states`.',
      )
    }
    return { board, field, option }
  }

  async function readRaw(ref) {
    const data = await graphql(ISSUE_QUERY, { owner, repo, number: numberOf(ref), status: statusField }, { allowMissing: true })
    return (data.repository && data.repository.issue) || null
  }

  const adapter = {
    async readIssue(ref) {
      return normalizeIssue(await readRaw(ref))
    },

    async createIssue({ title, description, assigneeId, labels, type }) {
      const raw = await rest('POST', `${repoPath}/issues`, {
        body: issuePayload({ title, description, assigneeId, labels, type }, { forCreate: true }),
      })
      if (!raw || raw.number == null) throw new Error('GitHub returned no issue for the create')
      return created(raw)
    },

    /**
     * Create an issue and link it under `parentRef` as a sub-issue — two
     * calls, because GitHub has no create-as-child. A link that fails AFTER
     * the create leaves a real, unlinked issue behind, so the refusal carries
     * it as `created` and names it: a silent orphan is exactly what a re-run
     * would mint a twin of.
     */
    async createSubIssue(parentRef, { title, description, assigneeId, labels, type }) {
      const child = await adapter.createIssue({ title, description, assigneeId, labels, type })
      try {
        await rest('POST', `${repoPath}/issues/${numberOf(parentRef)}/sub_issues`, {
          body: { sub_issue_id: child.databaseId },
        })
      } catch (error) {
        throw new GitHubRefusal(
          `created ${child.identifier} but could not link it under ${identifierOf(numberOf(parentRef))}: ` +
            `${error && error.message ? error.message : error}. Link it by hand (or close it) before pushing again.`,
          { status: error && error.status, created: child },
        )
      }
      return child
    },

    async updateIssue(ref, updates) {
      const body = issuePayload(updates || {})
      if (!Object.keys(body).length) return {}
      return rest('PATCH', `${repoPath}/issues/${numberOf(ref)}`, { body })
    },

    /**
     * Open or close the issue itself. `reason` is `completed` / `not_planned`
     * when closing; reopening sends `reopened`, which is what GitHub records.
     */
    async setIssueOpen(ref, { open, reason = null }) {
      const body = open ? { state: 'open', state_reason: 'reopened' } : { state: 'closed', ...(reason ? { state_reason: reason } : {}) }
      return rest('PATCH', `${repoPath}/issues/${numberOf(ref)}`, { body })
    },

    async listSubIssues(ref) {
      const raw = await restAll(`${repoPath}/issues/${numberOf(ref)}/sub_issues`)
      return raw.map((s) => ({
        id: String(s.number),
        identifier: identifierOf(s.number),
        title: s.title != null ? s.title : null,
        open: s.state === 'open',
      }))
    },

    /**
     * Issues in this repo whose title contains `query` — the twin-mint guard's
     * lookup. BLIND SPOT: search is eventually consistent, so an issue created
     * seconds ago may not be found. The guard treats "not found" as "mint",
     * which is the harmless branch only because a twin is recoverable and a
     * refused push is not what the caller asked for.
     */
    async searchIssues({ query, limit = 50 }) {
      const quoted = String(query || '').replace(/"/g, '')
      const q = [`repo:${owner}/${repo}`, 'is:issue', quoted ? `in:title "${quoted}"` : null].filter(Boolean).join(' ')
      const raw = await rest('GET', '/search/issues', { query: { q, per_page: Math.min(limit, PAGE) } })
      return ((raw && raw.items) || []).map((i) => ({
        id: String(i.number),
        identifier: identifierOf(i.number),
        title: i.title != null ? i.title : null,
        state: null,
        parent: null,
      }))
    },

    resolveBoard,

    /**
     * The Status field's option names — what `states` validation checks the
     * config against, in the shape the kit's state gate takes.
     */
    async listIssueStates() {
      const { field } = await singleSelect(statusField)
      return field.options.map((o) => ({ id: o.id, name: o.name, category: null }))
    },

    /**
     * Put the issue on the board. `addProjectV2ItemById` returns the EXISTING
     * item when the issue is already there, so this is idempotent by GitHub's
     * own contract — no read is needed to avoid a duplicate.
     */
    async addToBoard(issueOrRef) {
      const issue = issueOrRef && issueOrRef.nodeId ? issueOrRef : await adapter.readIssue(issueOrRef)
      if (!issue || !issue.nodeId) throw new GitHubRefusal(`no issue ${JSON.stringify(issueOrRef)} to add to the board`)
      if (issue.boardItemId) return { itemId: issue.boardItemId, added: false }
      const board = await resolveBoard()
      const data = await graphql(ADD_ITEM, { project: board.id, content: issue.nodeId })
      const item = data.addProjectV2ItemById && data.addProjectV2ItemById.item
      if (!item || !item.id) throw new GitHubRefusal(`GitHub did not return a board item for ${issue.identifier}`)
      return { itemId: item.id, added: true }
    },

    /**
     * Set a single-select field on the issue's board item by option NAME,
     * adding the issue to the board first if it is not on it. `{ changed:
     * false }` when the Status is already that option — the idempotent case.
     * Pass a normalised issue to save the read.
     */
    async setFieldOption(issueOrRef, fieldName, optionName) {
      const { board, field, option } = await optionFor(fieldName, optionName)
      const issue = issueOrRef && issueOrRef.nodeId ? issueOrRef : await adapter.readIssue(issueOrRef)
      if (!issue) throw new GitHubRefusal(`no issue ${JSON.stringify(issueOrRef)} to set "${field.name}" on`)
      const isStatus = String(field.name).toLowerCase() === String(statusField).toLowerCase()
      if (isStatus && issue.state && String(issue.state.name).toLowerCase() === String(option.name).toLowerCase()) {
        return { changed: false }
      }
      const { itemId } = await adapter.addToBoard(issue)
      await graphql(SET_OPTION, { project: board.id, item: itemId, field: field.id, option: option.id })
      return { changed: true }
    },

    async setStatus(issueOrRef, optionName) {
      return adapter.setFieldOption(issueOrRef, statusField, optionName)
    },

    /**
     * Who the token is, and what it may do. `scopes` comes from the
     * `X-OAuth-Scopes` header — present for classic tokens, ABSENT for
     * fine-grained ones, so `null` means "cannot tell", never "no scopes".
     */
    async readViewer() {
      const { body, headers } = await rest('GET', '/user', { withHeaders: true })
      if (!body || !body.login) return null
      const header = headers && typeof headers.get === 'function' ? headers.get('x-oauth-scopes') : null
      return {
        id: body.login,
        login: body.login,
        name: body.name || body.login,
        email: body.email || null,
        scopes: header == null ? null : header.split(',').map((s) => s.trim()).filter(Boolean),
      }
    },

    async listLabels() {
      const raw = await restAll(`${repoPath}/labels`)
      return raw.map((l) => ({ name: l.name, color: l.color || null }))
    },

    async listComments(ref) {
      const raw = await restAll(`${repoPath}/issues/${numberOf(ref)}/comments`)
      return raw.map((c) => ({ id: String(c.id), body: c.body == null ? '' : String(c.body) }))
    },

    async createComment(ref, mdBody) {
      assertBodyFits(mdBody, 'this comment')
      const raw = await rest('POST', `${repoPath}/issues/${numberOf(ref)}/comments`, { body: { body: mdBody } })
      return raw && raw.id != null ? { id: String(raw.id) } : null
    },
  }

  return adapter
}

module.exports = { makeApiAdapter, GitHubRefusal, numberOf, identifierOf, isLimited, API_URL }
