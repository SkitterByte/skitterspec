'use strict'

/**
 * "Who am I in this workspace?" — the resolution shape every provider's
 * assignment rests on.
 *
 * Three tiers, first hit wins:
 *
 *   1. the user-level credentials store  (`source: 'store'`)  — no network
 *   2. the credential itself, via the tracker's "who am I" call
 *                                        (`source: 'viewer'`)
 *   3. nothing                           (`source: 'unknown'`)
 *
 * **Unknown is a normal state, not a failure.** A shared/bot key answers the
 * viewer call with the bot; an offline machine answers with nothing; neither is
 * a broken install. So this returns a structured result the caller branches on,
 * never an exception — and it NEVER PROMPTS and NEVER WRITES. Prompting belongs
 * to the skill with a human in front of it, and caching belongs to the command
 * that decided the answer was worth keeping: a resolver that wrote to disk as a
 * side effect would cache a bot's identity the first time CI ran.
 *
 * Everything tracker-shaped arrives as a hook: how a credential resolves, how
 * the viewer is fetched, and how a user object yields a display name.
 */

/**
 * @param {object} hooks
 *   - `scopeId`            the credentials-store scope (e.g. a team id) — '' skips tier 1
 *   - `file`               the store path (carried through on every result)
 *   - `readStore(file)`    kit credentials read
 *   - `userFor(store,id)`  the provider store binding's identity read
 *   - `resolveCredential()`  → `{ ok, error?, envVar?, … }` — the provider's key resolution
 *   - `readViewer(credential)` → the tracker's current user (may throw)
 *   - `nameOf(viewer)`     display name of a user object
 * @returns {Promise<object>} `{ ok: true, id, name, email?, source, path }` or
 *   `{ ok: false, source: 'unknown', reason, envVar?, path }`.
 */
async function resolveIdentity({ scopeId, file, readStore, userFor, resolveCredential, readViewer, nameOf }) {
  if (scopeId) {
    const result = readStore(file)
    if (result.ok) {
      const cached = userFor(result.store, scopeId)
      if (cached) return { ok: true, id: cached.id, name: cached.name, source: 'store', path: file }
    }
    // A store that is present but unusable (over-permissive, malformed) is NOT
    // reported as an identity failure — credential resolution hits the same
    // file and reports it properly. Duplicating it here would print the same
    // permissions warning twice for one cause.
  }

  const credential = resolveCredential()
  if (!credential.ok) {
    return { ok: false, source: 'unknown', reason: credential.error, envVar: credential.envVar, path: file }
  }

  let viewer
  try {
    viewer = await readViewer(credential)
  } catch (error) {
    // Offline, revoked key, tracker down. All are "cannot tell", which routes
    // to the harmless branch: the caller skips assignment rather than guessing.
    return { ok: false, source: 'unknown', reason: error.message, path: file }
  }

  const id = viewer && typeof viewer.id === 'string' ? viewer.id.trim() : ''
  if (!id) {
    return { ok: false, source: 'unknown', reason: 'the tracker returned no viewer for this key', path: file }
  }
  return {
    ok: true,
    id,
    name: (nameOf || defaultDisplayName)(viewer),
    email: (viewer && viewer.email) || null,
    source: 'viewer',
    path: file,
  }
}

/**
 * The name to show for a tracker user. Falls back through `displayName` and
 * `email` so a user with an odd profile still reads as a person rather than a
 * UUID.
 */
function defaultDisplayName(user) {
  if (!user || typeof user !== 'object') return null
  for (const field of ['name', 'displayName', 'email']) {
    const value = user[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

module.exports = { resolveIdentity, defaultDisplayName }
