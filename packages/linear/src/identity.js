'use strict'

/**
 * "Who am I in this Linear workspace?" — the Linear binding of the kit's
 * identity resolver (`provider-kit/src/identity.js`, which carries the
 * three-tier contract: store → viewer → unknown, unknown being a normal state).
 *
 * The answer is DERIVED, not configured. A Linear personal API key is issued to
 * a person, so the workspace can be asked directly (`viewer` on the API path,
 * `get_user "me"` over MCP). That is why assignment needs no repo config in the
 * common case, and why there is no `linear.userId`: `specs/.core/linear.config.json`
 * is committed, so an id written there would follow the repo to every teammate
 * who clones it and assign their specs to whoever set it up.
 */

const { resolveIdentity: kitResolveIdentity, defaultDisplayName } = require('@skitterbyte/skitterspec-provider-kit/src/identity.js')
const { resolveApiKey, makeApiAdapter } = require('./api.js')
const { storePath, readStore, userForTeam } = require('./credentials.js')

/**
 * Resolve the current user's Linear identity.
 *
 * @returns {Promise<object>} `{ ok: true, id, name, source }` with `source`
 *   `'store'` or `'viewer'`; otherwise `{ ok: false, source: 'unknown', reason }`.
 *   `reason` explains what was tried, so "no key" and "Linear rejected the key"
 *   stay distinguishable — an unexplained "unknown" is what makes people
 *   re-enter a name that was never the problem.
 */
async function resolveIdentity(config, env = process.env, deps = {}) {
  // The store is keyed by team, so with no teamId there is nothing to look up.
  // Fall through rather than fail: `viewer` does not need a team, and a repo
  // mid-setup should still be able to answer who you are.
  const teamId = (config && config.linear && config.linear.teamId) || ''
  const file = (deps.storePath || storePath)(env)
  return kitResolveIdentity({
    scopeId: teamId,
    file,
    readStore: (f) => (deps.readStore || readStore)(f),
    userFor: (store, id) => (deps.userForTeam || userForTeam)(store, id),
    resolveCredential: () => (deps.resolveApiKey || resolveApiKey)(config, env),
    readViewer: (key) => {
      const adapter = deps.adapter || makeApiAdapter({ apiKey: key.key, fetch: deps.fetch })
      return adapter.readViewer()
    },
    nameOf: displayNameOf,
  })
}

/**
 * The name to show for a Linear user, preferring the one Linear itself puts on
 * an issue.
 */
const displayNameOf = defaultDisplayName

module.exports = { resolveIdentity, displayNameOf }
