'use strict'

/**
 * The user-level credentials store — where a Linear API key lives when it is
 * not in the environment.
 *
 * The repo's `specs/.core/linear.config.json` is COMMITTED and deliberately
 * holds only the NAME of an env var, never a key. That is what makes it safe to
 * share, so a key can never go there. This store is the alternative: one file
 * per machine, outside every repo, at
 * `$XDG_CONFIG_HOME/skitterspec/credentials.json` (else `~/.config/…`), keyed by
 * Linear team id so one file serves every checkout.
 *
 * Reads never throw. `resolveApiKey` already treats "no key" as a NORMAL state
 * meaning "fall back to MCP" rather than an error, so every failure here returns
 * a structured reason the caller can report or ignore — a missing store is not a
 * problem, it is the default.
 *
 * Nothing in this module ever returns a key inside an error, and callers must
 * keep it out of logs, plans, snapshots and stamped frontmatter.
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
 * Read the store.
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

/**
 * The key recorded for one team, or null. Never throws, and never reports the
 * value it did or didn't find.
 */
function keyForTeam(store, teamId) {
  if (!teamId) return null
  const teams = store && store.teams
  const entry = teams && typeof teams === 'object' ? teams[teamId] : null
  if (!entry || typeof entry !== 'object') return null
  const key = entry.key
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

// Last 4 characters, for reporting that a key exists without revealing it.
function fingerprint(key) {
  if (typeof key !== 'string' || !key) return null
  return `…${key.slice(-4)}`
}


/**
 * Record a key for one team, creating the store at `0600` and its directory at
 * `0700`. Other teams' entries are preserved.
 *
 * Refuses rather than writing when the existing store is unreadable or
 * over-permissive — the same guard as reading, because silently rewriting a
 * world-readable file would leave the leak in place.
 *
 * Returns `{ ok: true, path, created }` or `{ ok: false, reason }`. The key is
 * never echoed back in either.
 */
function writeKey(file, teamId, key, deps = {}) {
  const mkdir = deps.mkdir || fs.mkdirSync
  const write = deps.write || fs.writeFileSync
  const chmod = deps.chmod || fs.chmodSync
  const exists = deps.exists || fs.existsSync

  if (!teamId) return { ok: false, reason: 'no team id — nothing to key the entry by' }
  if (typeof key !== 'string' || !key.trim()) return { ok: false, reason: 'empty key — nothing stored' }

  const created = !exists(file)
  let store = { version: 1, teams: {} }
  if (!created) {
    const current = readStore(file, deps)
    if (!current.ok) return { ok: false, reason: current.reason, code: current.code }
    store = current.store
    if (!store.teams || typeof store.teams !== 'object') store.teams = {}
    if (!store.version) store.version = 1
  }

  store.teams[teamId] = { ...(store.teams[teamId] || {}), key: key.trim() }

  mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  write(file, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 })
  // `mode` on writeFileSync only applies when the file is CREATED, so an
  // existing file keeps its mode — narrow it explicitly.
  chmod(file, 0o600)
  return { ok: true, path: file, created }
}

/**
 * Remove one team's entry, leaving every other team intact. A store or entry
 * that isn't there is a clean no-op, not an error.
 */
function removeKey(file, teamId, deps = {}) {
  const write = deps.write || fs.writeFileSync
  const current = readStore(file, deps)
  if (!current.ok) {
    if (current.code === 'absent') return { ok: true, path: file, removed: false }
    return { ok: false, reason: current.reason, code: current.code }
  }
  const teams = current.store.teams
  if (!teams || !teams[teamId]) return { ok: true, path: file, removed: false }
  delete teams[teamId]
  write(file, JSON.stringify(current.store, null, 2) + '\n', { mode: 0o600 })
  return { ok: true, path: file, removed: true }
}

/**
 * Resolve one team's key from the store: a stored `key` first, else running its
 * `keyCommand` and taking stdout.
 *
 * `keyCommand` is honoured ONLY from this user-level store — never from the
 * repo's committed `linear.config.json`. That file travels with the repo, so a
 * command named there would let a cloned repo run arbitrary code on the machine
 * of anyone who ran `spec-sync`. The repo config keeps naming only an env var.
 *
 * A command that fails, times out or prints nothing resolves to no key, which is
 * the ordinary "fall back to MCP" state — but its stderr is carried back so a
 * broken command is diagnosable rather than mysteriously inert. Its **stdout is
 * never** put in an error: that is the key.
 *
 * @returns {object} `{ key, source }` with source `'store'` | `'command'`, or
 *   `{ key: null, source: null, reason }`.
 */
function resolveTeamKey(store, teamId, deps = {}) {
  const direct = keyForTeam(store, teamId)
  if (direct) return { key: direct, source: 'store' }

  const entry = store && store.teams && typeof store.teams === 'object' ? store.teams[teamId] : null
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

// 60s: a password manager may prompt for biometric or a master password, and a
// hang here would look like the CLI itself wedging.
const COMMAND_TIMEOUT_MS = 60_000

// Linear personal API keys are `lin_api_` + a long token.
const LITERAL_KEY_RE = /lin_api_[A-Za-z0-9]{8,}/

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
 * Record a command for one team instead of a key. Unlike a key, a command is not
 * a secret, so this one IS safe to pass as an argument.
 */
function writeKeyCommand(file, teamId, command, deps = {}) {
  const mkdir = deps.mkdir || fs.mkdirSync
  const write = deps.write || fs.writeFileSync
  const chmod = deps.chmod || fs.chmodSync
  const exists = deps.exists || fs.existsSync

  if (!teamId) return { ok: false, reason: 'no team id — nothing to key the entry by' }
  if (typeof command !== 'string' || !command.trim()) {
    return { ok: false, reason: 'empty command — nothing stored' }
  }
  // Refusing `--key` makes `--command "echo lin_api_…"` the obvious workaround,
  // and it is worse: a command is NOT treated as a secret — `status` prints it
  // back, and it sits in the store in clear. Catch the shortcut at the door.
  if (LITERAL_KEY_RE.test(command)) {
    return {
      ok: false,
      reason:
        'that command has a Linear key written into it.\n' +
        '  A command is displayed by `credentials status` and is not treated as a\n' +
        '  secret — embedding a key there exposes it. To store a key, run\n' +
        '  `credentials set` with no arguments and paste at the hidden prompt.',
    }
  }

  const created = !exists(file)
  let store = { version: 1, teams: {} }
  if (!created) {
    const current = readStore(file, deps)
    if (!current.ok) return { ok: false, reason: current.reason, code: current.code }
    store = current.store
    if (!store.teams || typeof store.teams !== 'object') store.teams = {}
    if (!store.version) store.version = 1
  }

  // A command REPLACES a stored key for that team — keeping both would mean the
  // key silently wins and the command never runs.
  store.teams[teamId] = { keyCommand: command.trim() }

  mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  write(file, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 })
  chmod(file, 0o600)
  return { ok: true, path: file, created }
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

module.exports = {
  storePath,
  readStore,
  keyForTeam,
  fingerprint,
  writeKey,
  writeKeyCommand,
  resolveTeamKey,
  removeKey,
  storeMode,
  DIR_NAME,
  FILE_NAME,
}
