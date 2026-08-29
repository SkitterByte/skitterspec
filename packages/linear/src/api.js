'use strict'

/**
 * The Linear GraphQL boundary — the one place that knows concrete Linear API
 * shapes, exactly as `mcp.js` is the one place that knows concrete tool names.
 *
 * Both fulfil the SAME typed operation contract (`makeAdapter`'s return), so
 * `spec-sync apply` is written once against an adapter and never learns which
 * transport it got. That is the whole point: the MCP path stays supported, and
 * the API path exists because routing every issue description through the model
 * as generated tokens makes push throughput a function of decode speed rather
 * than of Linear's API.
 *
 * Auth: a personal API key goes in `Authorization` **raw, with no `Bearer`
 * prefix** — verified against Linear's own docs (https://linear.app/developers/graphql),
 * which is the opposite of the OAuth access-token convention. Sending
 * `Bearer lin_api_…` fails authentication.
 *
 * `fetch` is injected so tests exercise every operation offline and
 * deterministically; production passes the global.
 */

const { DEFAULT_KEY_ENV } = require('./config.js')

const ENDPOINT = 'https://api.linear.app/graphql'

// Rate-limit handling. Enough retries to ride out a burst without turning a
// genuinely stuck run into an unbounded one.
const MAX_RETRIES = 5
const MAX_BACKOFF_MS = 60_000

/**
 * Resolve the personal API key from the environment.
 *
 * Returns `{ ok: true, key, envVar }`, or `{ ok: false, envVar, error }` when
 * unset — a value the caller branches on rather than an exception, because "no
 * key" is a normal state that means "use MCP", not a failure.
 *
 * The key is never part of the returned error, and callers must keep it out of
 * logs, plans, snapshots and stamped frontmatter.
 */
function resolveApiKey(config, env = process.env) {
  const envVar = (config && config.auth && config.auth.keyEnv) || DEFAULT_KEY_ENV
  const key = env[envVar]
  if (typeof key !== 'string' || !key.trim()) {
    return {
      ok: false,
      envVar,
      error: `no Linear API key — set ${envVar}, or apply the plan over MCP with --via mcp`,
    }
  }
  return { ok: true, key: key.trim(), envVar }
}

// Fields we read back on every write. `identifier` and `url` are what the skill
// stamps into the spec; `description` is what `spec-sync verify` compares.
const ISSUE_FIELDS = 'id identifier url title description state { id name }'

/**
 * A GraphQL caller bound to one key. Throws a clear Error on transport failure,
 * on an HTTP error, and on a GraphQL `errors` payload — an `apply` that half
 * succeeds must be loud, never silent.
 */
function makeClient({ apiKey, fetch: fetchImpl, endpoint = ENDPOINT, sleep, maxRetries = MAX_RETRIES }) {
  const doFetch = fetchImpl || globalThis.fetch
  if (typeof doFetch !== 'function') {
    throw new Error('no fetch available — Node 18+ is required for the API transport')
  }
  // Injected so the retry path is testable without real delays.
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))

  return async function call(query, variables) {
    for (let attempt = 0; ; attempt++) {
      let res
      try {
        res = await doFetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Raw, no `Bearer` — see the module comment.
            Authorization: apiKey,
          },
          body: JSON.stringify({ query, variables }),
        })
      } catch (cause) {
        throw new Error(`Linear API unreachable: ${cause && cause.message ? cause.message : cause}`)
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Linear rejected the API key (HTTP ${res.status}) — check the value of your key environment variable`,
        )
      }
      // Rate limited. A bulk backfill is exactly the workload that hits this, and
      // failing the run would strand a half-mirrored bucket — so wait and retry
      // rather than surfacing it. Linear says how long to wait; honour that over
      // guessing, and fall back to exponential backoff when it doesn't.
      if (res.status === 429 && attempt < maxRetries) {
        await wait(retryDelay(res, attempt))
        continue
      }
      if (res.status === 429) {
        throw new Error(`Linear rate-limited this request and did not recover after ${maxRetries} retries`)
      }
      if (!res.ok) throw new Error(`Linear API returned HTTP ${res.status}`)
      const body = await res.json()
      if (body && Array.isArray(body.errors) && body.errors.length) {
        throw new Error(`Linear API error: ${body.errors.map((e) => e.message).join('; ')}`)
      }
      return body && body.data
    }
  }
}

// How long to wait before retrying a 429: the server's `Retry-After` (seconds)
// when it sends one, else exponential backoff from 1s.
function retryDelay(res, attempt) {
  const header = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null
  const seconds = header != null ? Number(header) : NaN
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS)
  return Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS)
}

/**
 * Wrap a GraphQL client into the typed ops the engine uses — the same set
 * `mcp.js`'s `makeAdapter` returns, so the two are interchangeable.
 */
function makeApiAdapter({ apiKey, fetch: fetchImpl, endpoint, sleep, maxRetries } = {}) {
  const call = makeClient({ apiKey, fetch: fetchImpl, endpoint, sleep, maxRetries })

  // Issue mutations return the created/updated issue under a payload wrapper.
  const unwrap = (data, field) => (data && data[field] && data[field].issue) || null

  return {
    async readIssue(id) {
      const data = await call(`query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`, { id })
      return (data && data.issue) || null
    },
    async createIssue(issue) {
      const data = await call(
        `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
        { input: issue },
      )
      return unwrap(data, 'issueCreate')
    },
    async updateIssue(id, updates) {
      const data = await call(
        `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
        { id, input: updates },
      )
      return unwrap(data, 'issueUpdate')
    },
    // A phase sub-issue is an ordinary issue carrying `parentId`. Same mutation,
    // so there is no separate sub-issue surface to keep in step.
    async createSubIssue(parentId, subIssue) {
      return this.createIssue({ ...subIssue, parentId })
    },
    async updateSubIssue(id, updates) {
      return this.updateIssue(id, updates)
    },
    async listSubIssues(parentId) {
      const data = await call(
        `query($id: String!) { issue(id: $id) { children { nodes { ${ISSUE_FIELDS} } } } }`,
        { id: parentId },
      )
      return (data && data.issue && data.issue.children && data.issue.children.nodes) || []
    },
    // The intake inbox. A free-text term uses Linear's `searchIssues` query; a
    // label/team filter alone uses `issues`. Two queries rather than one because
    // Linear exposes text search as its own root field, not an `IssueFilter` key.
    async searchIssues({ label, query, teamId } = {}) {
      const filter = {}
      if (label) filter.labels = { name: { eq: label } }
      if (teamId) filter.team = { id: { eq: teamId } }
      if (query) {
        const data = await call(
          `query($term: String!, $filter: IssueFilter) {
             searchIssues(term: $term, filter: $filter) { nodes { ${ISSUE_FIELDS} } } }`,
          { term: query, filter },
        )
        return (data && data.searchIssues && data.searchIssues.nodes) || []
      }
      const data = await call(
        `query($filter: IssueFilter) { issues(filter: $filter) { nodes { ${ISSUE_FIELDS} } } }`,
        { filter },
      )
      return (data && data.issues && data.issues.nodes) || []
    },
    async listProjects(teamId) {
      const data = teamId
        ? await call(`query($id: String!) { team(id: $id) { projects { nodes { id name } } } }`, { id: teamId })
        : await call('query { projects { nodes { id name } } }')
      if (data && data.team) return (data.team.projects && data.team.projects.nodes) || []
      return (data && data.projects && data.projects.nodes) || []
    },
    // The workspace's issue workflow states, in the shape `--workspace-states`
    // already accepts, so the existing state check is reused rather than forked.
    async listIssueStates(teamId) {
      const data = teamId
        ? await call(`query($id: String!) { team(id: $id) { states { nodes { id name type } } } }`, { id: teamId })
        : await call('query { workflowStates { nodes { id name type } } }')
      if (data && data.team) return (data.team.states && data.team.states.nodes) || []
      return (data && data.workflowStates && data.workflowStates.nodes) || []
    },
  }
}

/**
 * The workspace's state NAMES, for `validateStates` — the same array
 * `--workspace-states` carries on the MCP path. On the API path nobody has to
 * fetch it by hand.
 */
async function fetchWorkspaceStates(adapter, teamId) {
  const states = await adapter.listIssueStates(teamId)
  return states.map((s) => s && s.name).filter((n) => typeof n === 'string' && n)
}

/**
 * Map a local lifecycle bucket to a Linear state ID.
 *
 * MCP accepted a state NAME; the GraphQL API needs an id, so this is the one
 * extra hop the API transport adds. Resolved against the states actually fetched
 * from the workspace, so a `config.states` value the workspace lacks fails here
 * with the same vocabulary the state check already uses.
 */
function stateIdFor(bucket, config, states) {
  const name = config && config.states && config.states[bucket]
  if (!name) return null
  const hit = states.find((s) => s && s.name === name)
  if (!hit) {
    throw new Error(
      `no Linear state named ${JSON.stringify(name)} for bucket ${JSON.stringify(bucket)} — ` +
        `workspace has: ${states.map((s) => s.name).join(', ')}`,
    )
  }
  return hit.id
}

module.exports = {
  ENDPOINT,
  MAX_RETRIES,
  resolveApiKey,
  makeClient,
  makeApiAdapter,
  fetchWorkspaceStates,
  stateIdFor,
}
