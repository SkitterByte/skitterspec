'use strict'

/**
 * The user-level credentials store, shared by every skitterspec provider —
 * where an API credential lives when it is not in the environment.
 *
 * A repo's committed provider config deliberately holds only the NAME of an
 * env var, never a credential. This store is the alternative: one file per
 * machine, outside every repo, at
 * `$XDG_CONFIG_HOME/skitterspec/credentials.json` (else `~/.config/…`).
 *
 * TWO SCHEMAS, one file. v1 — `{ version: 1, teams: { <scopeId>: entry } }` —
 * predates providers being plural, so every v1 entry belongs to the one
 * provider that existed then (the factory names it as `legacyV1Owner`). v2
 * namespaces: `{ version: 2, providers: { <name>: { teams: {…} } } }`. Reads
 * understand both. Writes by the legacy owner keep a v1 store v1 — older CLIs
 * still read it, and its tests pin the shape — while the FIRST write by any
 * other provider migrates the file to v2, folding the v1 entries under the
 * legacy owner. That is the moment two providers actually share the file, and
 * before it nothing changes shape underneath anyone.
 *
 * An entry's `key` may be a string (a bare API key) or an object (a compound
 * credential such as email + token) — the store passes it through opaquely.
 *
 * Reads never throw: every failure returns a structured reason, and a missing
 * store is the normal default, not a problem. Nothing here ever returns a key
 * inside an error, and callers must keep it out of logs, plans, snapshots and
 * stamped frontmatter.
 */

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DIR_NAME = 'skitterspec'
const FILE_NAME = 'credentials.json'

// Modes wider than owner-only. Checked ssh-style: a store other users can read
// is refused rather than read, because silently using it would hide the leak,
// and silently chmod'ing someone's file is not ours to do.
const GROUP_OR_WORLD = 0o077

// 60s: a password manager may prompt for biometric or a master password, and a
// hang here would look like the CLI itself wedging.
const COMMAND_TIMEOUT_MS = 60_000

/**
 * Absolute path of the store. Honours `$XDG_CONFIG_HOME`, else `~/.config`.
 * `env` and `homedir` are injected so tests never touch a real home directory.
 */
function storePath(env = process.env, homedir = os.homedir) {
  const xdg = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim()
  const base = xdg || path.join(homedir(), '.config')
  return path.join(base, DIR_NAME, FILE_NAME)
}

/**
 * Read the store (schema-agnostic).
 *
 * @returns {object} `{ ok: true, store, path }` — parsed and owner-only;
 *   `{ ok: false, reason, code, path }` otherwise. `code` is one of:
 *   `absent` (no file — the normal default, not a problem), `permissions`
 *   (group/world readable), `unreadable`, `malformed`.
 */
function readStore(file, { stat = fs.statSync, read = fs.readFileSync } = {}) {
  let info
  try {
    info = stat(file)
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { ok: false, code: 'absent', path: file, reason: `no credentials store at ${file}` }
    }
    return { ok: false, code: 'unreadable', path: file, reason: `cannot read ${file}: ${err.message}` }
  }

  if (info.mode & GROUP_OR_WORLD) {
    const mode = (info.mode & 0o777).toString(8)
    return {
      ok: false,
      code: 'permissions',
      path: file,
      reason:
        `credentials store ${file} is mode ${mode} — readable by other users.\n` +
        `  Run: chmod 600 ${file}`,
    }
  }

  let raw
  try {
    raw = read(file, 'utf-8')
  } catch (err) {
    return { ok: false, code: 'unreadable', path: file, reason: `cannot read ${file}: ${err.message}` }
  }

  let store
  try {
    store = JSON.parse(raw)
  } catch (err) {
    return { ok: false, code: 'malformed', path: file, reason: `invalid JSON in ${file}: ${err.message}` }
  }
  if (!store || typeof store !== 'object' || Array.isArray(store)) {
    return { ok: false, code: 'malformed', path: file, reason: `invalid credentials store in ${file}` }
  }
  return { ok: true, store, path: file }
}

/** The store's permission bits as an octal string, or null when absent. */
function storeMode(file, deps = {}) {
  const stat = deps.stat || fs.statSync
  try {
    return (stat(file).mode & 0o777).toString(8)
  } catch {
    return null
  }
}

// Last 4 characters, for reporting that a key exists without revealing it.
// Compound (object) credentials have no meaningful tail — null, never a dump.
function fingerprint(key) {
  if (typeof key !== 'string' || !key) return null
  return `…${key.slice(-4)}`
}

// The provider's scope map (`teams`) inside a parsed store, resolving both
// schemas. Returns `null` when the store holds nothing for this provider —
// which for a v1 store is every provider except the legacy owner.
function scopeMapOf(store, provider, legacyV1Owner) {
  if (!store || typeof store !== 'object') return null
  if (store.providers && typeof store.providers === 'object') {
    const entry = store.providers[provider]
    return entry && typeof entry.teams === 'object' ? entry.teams : null
  }
  if (provider !== legacyV1Owner) return null
  return store.teams && typeof store.teams === 'object' ? store.teams : null
}

function defaultRunCommand(command, timeout) {
  const r = spawnSync('sh', ['-c', command], { encoding: 'utf-8', timeout })
  if (r.error) return { ok: false, error: r.error.message }
  if (r.status !== 0) {
    // stderr only — stdout is the secret, and must not reach an error message.
    const detail = (r.stderr || '').trim().split('\n')[0] || `exit ${r.status}`
    return { ok: false, error: detail }
  }
  return { ok: true, stdout: r.stdout }
}

/**
 * A store bound to one provider. `legacyV1Owner` names the provider whose
 * entries a v1 store holds — the one that predates the namespace; a provider
 * IS that owner exactly when the names match.
 */
function makeCredentialsStore({ provider, legacyV1Owner }) {
  if (!provider) throw new Error('makeCredentialsStore: provider name required')
  const ownsV1 = provider === legacyV1Owner

  const mapOf = (store) => scopeMapOf(store, provider, legacyV1Owner)

  function entryFor(store, scopeId) {
    if (!scopeId) return null
    const map = mapOf(store)
    const entry = map ? map[scopeId] : null
    return entry && typeof entry === 'object' ? entry : null
  }

  function keyFor(store, scopeId) {
    const entry = entryFor(store, scopeId)
    if (!entry) return null
    const key = entry.key
    if (typeof key === 'string') return key.trim() || null
    return null
  }

  // A compound (object) credential, for providers whose auth is more than one
  // string. Strings resolve through `keyFor`; this never trims or reshapes.
  function credentialFor(store, scopeId) {
    const entry = entryFor(store, scopeId)
    if (!entry) return null
    return entry.key && typeof entry.key === 'object' ? entry.key : null
  }

  function userFor(store, scopeId) {
    const entry = entryFor(store, scopeId)
    if (!entry) return null
    const user = entry.user
    if (!user || typeof user !== 'object') return null
    // The id is what an assignment is actually made with, so an entry without
    // one is not a partial identity — it is no identity at all.
    const id = typeof user.id === 'string' && user.id.trim() ? user.id.trim() : null
    if (!id) return null
    const name = typeof user.name === 'string' && user.name.trim() ? user.name.trim() : null
    return { id, name }
  }

  /**
   * Resolve one scope's key from the store: a stored `key` first, else running
   * its `keyCommand` and taking stdout.
   *
   * `keyCommand` is honoured ONLY from this user-level store — never from a
   * repo's committed config, which travels with the repo and would let a cloned
   * repo run arbitrary code. A command that fails, times out or prints nothing
   * resolves to no key — the ordinary "fall back" state — but its stderr is
   * carried back so a broken command is diagnosable. Its **stdout is never**
   * put in an error: that is the key.
   */
  function resolveKey(store, scopeId, deps = {}) {
    const direct = keyFor(store, scopeId)
    if (direct) return { key: direct, source: 'store' }

    const entry = entryFor(store, scopeId)
    const command = entry && typeof entry.keyCommand === 'string' ? entry.keyCommand.trim() : ''
    if (!command) return { key: null, source: null }

    const run = deps.run || defaultRunCommand
    const result = run(command, deps.timeoutMs || COMMAND_TIMEOUT_MS)
    if (!result.ok) {
      return { key: null, source: null, command, reason: `keyCommand failed: ${result.error}` }
    }
    const key = (result.stdout || '').trim()
    if (!key) {
      return { key: null, source: null, command, reason: 'keyCommand produced no output' }
    }
    return { key, source: 'command', command }
  }

  // Read-modify-write of this provider's scope map, with the schema rules from
  // the module header. `mutate(entry)` returns the scope's next entry, or the
  // literal string 'delete' to drop it; `mutate` receives the current entry (or
  // null). Refuses on an unreadable or over-permissive store, exactly like a
  // read — silently rewriting a world-readable file would leave the leak.
  function mutateEntry(file, scopeId, mutate, deps = {}) {
    const mkdir = deps.mkdir || fs.mkdirSync
    const write = deps.write || fs.writeFileSync
    const chmod = deps.chmod || fs.chmodSync
    const exists = deps.exists || fs.existsSync

    const created = !exists(file)
    let store = null
    if (!created) {
      const current = readStore(file, deps)
      if (!current.ok) return { ok: false, reason: current.reason, code: current.code }
      store = current.store
    }

    // Decide the shape this write leaves behind.
    const isV2 = !!(store && store.providers && typeof store.providers === 'object')
    if (!store) {
      store = ownsV1 ? { version: 1, teams: {} } : { version: 2, providers: {} }
    } else if (!isV2 && !ownsV1) {
      // The first write by a second provider: fold the v1 entries under their
      // owner and namespace the file. This is the one moment the shape changes.
      const legacyTeams = store.teams && typeof store.teams === 'object' ? store.teams : {}
      store = { version: 2, providers: { [legacyV1Owner]: { teams: legacyTeams } } }
    }

    let map
    if (store.providers && typeof store.providers === 'object') {
      if (!store.providers[provider] || typeof store.providers[provider] !== 'object') {
        store.providers[provider] = { teams: {} }
      }
      if (!store.providers[provider].teams || typeof store.providers[provider].teams !== 'object') {
        store.providers[provider].teams = {}
      }
      if (!store.version || store.version < 2) store.version = 2
      map = store.providers[provider].teams
    } else {
      if (!store.teams || typeof store.teams !== 'object') store.teams = {}
      if (!store.version) store.version = 1
      map = store.teams
    }

    const current = map[scopeId] && typeof map[scopeId] === 'object' ? map[scopeId] : null
    const next = mutate(current)
    if (next === 'delete') {
      if (!current) return { ok: true, path: file, created: false, removed: false }
      delete map[scopeId]
    } else if (next !== undefined) {
      map[scopeId] = next
    }

    mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    write(file, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 })
    // `mode` on writeFileSync only applies when the file is CREATED, so an
    // existing file keeps its mode — narrow it explicitly.
    chmod(file, 0o600)
    return { ok: true, path: file, created, removed: next === 'delete' }
  }

  /** Record a credential (string key or compound object) for one scope. */
  function writeKey(file, scopeId, key, deps = {}) {
    if (!scopeId) return { ok: false, reason: 'no team id — nothing to key the entry by' }
    const isCompound = key && typeof key === 'object'
    const value = isCompound ? key : typeof key === 'string' ? key.trim() : ''
    if (!value || (isCompound && !Object.keys(value).length)) {
      return { ok: false, reason: 'empty key — nothing stored' }
    }
    return mutateEntry(file, scopeId, (entry) => ({ ...(entry || {}), key: value }), deps)
  }

  /** Record the identity for one scope, preserving its credential. */
  function writeUser(file, scopeId, user, deps = {}) {
    if (!scopeId) return { ok: false, reason: 'no team id — nothing to key the entry by' }
    const id = user && typeof user.id === 'string' ? user.id.trim() : ''
    if (!id) return { ok: false, reason: 'no user id — nothing stored' }
    const name = user && typeof user.name === 'string' ? user.name.trim() : ''
    return mutateEntry(
      file,
      scopeId,
      (entry) => ({ ...(entry || {}), user: name ? { id, name } : { id } }),
      deps,
    )
  }

  /**
   * Record a command for one scope instead of a key. Unlike a key, a command is
   * not a secret, so this one IS safe to pass as an argument. `literalKeyRe`
   * (with `literalKeyAdvice`) is the provider's own key shape — a command with
   * a key written into it is refused at the door, because a command is
   * displayed by `credentials status` and never treated as a secret.
   */
  function writeKeyCommand(file, scopeId, command, deps = {}, { literalKeyRe, literalKeyAdvice } = {}) {
    if (!scopeId) return { ok: false, reason: 'no team id — nothing to key the entry by' }
    if (typeof command !== 'string' || !command.trim()) {
      return { ok: false, reason: 'empty command — nothing stored' }
    }
    if (literalKeyRe && literalKeyRe.test(command)) {
      return { ok: false, reason: literalKeyAdvice || 'that command has a key written into it.' }
    }
    // A command REPLACES a stored key for that scope — keeping both would mean
    // the key silently wins and the command never runs.
    return mutateEntry(file, scopeId, () => ({ keyCommand: command.trim() }), deps)
  }

  /** Remove one scope's entry entirely. Absent store or entry is a clean no-op. */
  function removeKey(file, scopeId, deps = {}) {
    const current = readStore(file, deps)
    if (!current.ok) {
      if (current.code === 'absent') return { ok: true, path: file, removed: false }
      return { ok: false, reason: current.reason, code: current.code }
    }
    if (!entryFor(current.store, scopeId)) return { ok: true, path: file, removed: false }
    const r = mutateEntry(file, scopeId, () => 'delete', deps)
    return r.ok ? { ok: true, path: file, removed: true } : r
  }

  /**
   * Forget the identity recorded for one scope, leaving its KEY in place.
   * Deliberately not `removeKey`'s shape: that one drops the whole entry, which
   * is right when the key is being revoked; here it would sign the user out
   * entirely because they corrected their own name.
   */
  function removeUser(file, scopeId, deps = {}) {
    const current = readStore(file, deps)
    if (!current.ok) {
      if (current.code === 'absent') return { ok: true, path: file, removed: false }
      return { ok: false, reason: current.reason, code: current.code }
    }
    const entry = entryFor(current.store, scopeId)
    if (!entry || !entry.user) return { ok: true, path: file, removed: false }
    const r = mutateEntry(
      file,
      scopeId,
      (e) => {
        const next = { ...(e || {}) }
        delete next.user
        return next
      },
      deps,
    )
    return r.ok ? { ok: true, path: file, removed: true } : r
  }

  return {
    provider,
    storePath,
    readStore,
    storeMode,
    fingerprint,
    entryFor,
    keyFor,
    credentialFor,
    userFor,
    resolveKey,
    writeKey,
    writeUser,
    writeKeyCommand,
    removeKey,
    removeUser,
  }
}

module.exports = {
  makeCredentialsStore,
  storePath,
  readStore,
  storeMode,
  fingerprint,
  defaultRunCommand,
  COMMAND_TIMEOUT_MS,
  DIR_NAME,
  FILE_NAME,
  GROUP_OR_WORLD,
}
