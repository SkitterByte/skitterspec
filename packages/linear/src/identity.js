'use strict'

/**
 * "Who am I in this Linear workspace?" — the question assignment rests on.
 *
 * The answer is DERIVED, not configured. A Linear personal API key is issued to
 * a person, so the workspace can be asked directly (`viewer` on the API path,
 * `get_user "me"` over MCP). That is why assignment needs no repo config in the
 * common case, and why there is no `linear.userId`: `specs/.core/linear.config.json`
 * is committed, so an id written there would follow the repo to every teammate
 * who clones it and assign their specs to whoever set it up.
 *
 * Resolution order, first hit wins:
 *
 *   1. the user-level credentials store  (`source: 'store'`)  — no network
 *   2. the credential itself, via `viewer` (`source: 'viewer'`)
 *   3. nothing                            (`source: 'unknown'`)
 *
 * **Unknown is a normal state, not a failure** — the same contract
 * `resolveApiKey` holds for a missing key. A shared/bot key answers `viewer`
 * with the bot; an offline machine answers with nothing; neither is a broken
 * install, and both are why `spec-sync whoami --set` exists. So this returns a
 * structured result the caller branches on, never an exception.
 *
 * It also NEVER PROMPTS and NEVER WRITES. Prompting belongs to the skill that
 * has a human in front of it, and caching belongs to the command that decided
 * the answer was worth keeping — a resolver that wrote to disk as a side effect
 * of being asked a question would cache a bot's identity the first time CI ran.
 */

const { resolveApiKey, makeApiAdapter } = require('./api.js')
const { storePath, readStore, userForTeam } = require('./credentials.js')

/**
 * Resolve the current user's Linear identity.
 *
 * @returns {Promise<object>} `{ ok: true, id, name, source }` where `source` is
 *   `'store'` or `'viewer'`; otherwise `{ ok: false, source: 'unknown', reason }`.
 *   `reason` explains what was tried, so "no key" and "Linear rejected the key"
 *   stay distinguishable — an unexplained "unknown" is what makes people
 *   re-enter a name that was never the problem.
 */
async function resolveIdentity(config, env = process.env, deps = {}) {
  const teamId = (config && config.linear && config.linear.teamId) || ''
  // The store is keyed by team, so with no teamId there is nothing to look up.
  // Fall through rather than fail: `viewer` does not need a team, and a repo
  // mid-setup should still be able to answer who you are.
  const file = (deps.storePath || storePath)(env)

  if (teamId) {
    const result = (deps.readStore || readStore)(file)
    if (result.ok) {
      const cached = (deps.userForTeam || userForTeam)(result.store, teamId)
      if (cached) return { ok: true, id: cached.id, name: cached.name, source: 'store', path: file }
    }
    // A store that is present but unusable (over-permissive, malformed) is NOT
    // reported as an identity failure — the key resolution below hits the same
    // file and reports it properly. Duplicating it here would print the same
    // permissions warning twice for one cause.
  }

  const key = (deps.resolveApiKey || resolveApiKey)(config, env)
  if (!key.ok) {
    return { ok: false, source: 'unknown', reason: key.error, envVar: key.envVar, path: file }
  }

  const adapter = deps.adapter || makeApiAdapter({ apiKey: key.key, fetch: deps.fetch })
  let viewer
  try {
    viewer = await adapter.readViewer()
  } catch (error) {
    // Offline, revoked key, Linear down. All are "cannot tell", which routes to
    // the harmless branch: the caller skips assignment rather than guessing.
    return { ok: false, source: 'unknown', reason: error.message, path: file }
  }

  const id = viewer && typeof viewer.id === 'string' ? viewer.id.trim() : ''
  if (!id) {
    return { ok: false, source: 'unknown', reason: 'Linear returned no viewer for this key', path: file }
  }
  return {
    ok: true,
    id,
    name: displayNameOf(viewer),
    email: (viewer && viewer.email) || null,
    source: 'viewer',
    path: file,
  }
}

/**
 * The name to show for a Linear user, preferring the one Linear itself puts on
 * an issue. Falls back through `displayName` and `email` so a user with an odd
 * profile still reads as a person rather than a UUID.
 */
function displayNameOf(user) {
  if (!user || typeof user !== 'object') return null
  for (const field of ['name', 'displayName', 'email']) {
    const value = user[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

module.exports = { resolveIdentity, displayNameOf }
