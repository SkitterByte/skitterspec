'use strict'

/**
 * Config loader for the per-spec isolation feature (`/spec-env`).
 *
 * Reads `specs/.core/env.config.json` from the project root and normalises it
 * over frozen defaults. The feature is strictly opt-in: when the file is absent
 * the loader never throws — it returns the defaults with `present:false`, which
 * every caller treats as "feature unused".
 *
 * Mirrors the shape/idiom of `assets/scripts/lib/config.js` (frozen defaults,
 * merge known keys only, forward-compatible on unknown keys). Zero-dependency.
 *
 * Shape (see specs/.core/env.config.md for field docs):
 *   {
 *     worktree: { root, folderPattern },
 *     docker:   { enabled, composeFile, projectNamePattern, portBase,
 *                 portsPerSpec, envFile, backupCommand },
 *     dev:      [ { name, command, portVar, health?, frontPort? } ],  // host dev
 *               // servers started on the spec's port block (empty = none)
 *     proxy:    { enabled, host },  // bundled front-door proxy (spec-env connect)
 *     open:     { command },   // optional, editor/terminal-agnostic opener
 *     registry: ".spec-env/registry.json",
 *     branch:   { pattern, identifierField },  // git branch naming (provider-neutral)
 *     baseBranch: "",          // "" = auto-detect (origin/HEAD → main → master)
 *     guards:   { refuseTeardownIfDirty, refuseTeardownIfUnpushed }
 *   }
 */

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const CONFIG_FILE = join('specs', '.core', 'env.config.json')

const DEFAULT_CONFIG = Object.freeze({
  worktree: Object.freeze({ root: '../{repo}-wt', folderPattern: '{slug}' }),
  docker: Object.freeze({
    enabled: true,
    composeFile: 'docker-compose.yml',
    projectNamePattern: '{repoSlug}_{slug}',
    portBase: 3000,
    portsPerSpec: 10,
    envFile: '.env',
    backupCommand: '',
  }),
  // Host dev servers started on the spec's port block by `spec-env dev up`.
  // Each: { name, command, portVar, health?, frontPort? }. Default: none.
  dev: Object.freeze([]),
  // Front-door proxy (`spec-env connect`): a bundled Node reverse proxy that
  // exposes one connected spec's frontPort processes on the canonical ports.
  proxy: Object.freeze({ enabled: true, host: '127.0.0.1' }),
  open: Object.freeze({ command: '' }),
  registry: '.spec-env/registry.json',
  // Git branch naming, provider-neutral. `pattern` expands {type}/{slug} and,
  // when a tracker provider is linked, {identifier}; `identifierField` names the
  // 00-overview.md frontmatter field a provider writes the ticket id into (empty
  // = no identifier, so patterns referencing {identifier} fall back to type/slug).
  branch: Object.freeze({ pattern: '{type}/{slug}', identifierField: '' }),
  // Integration base branch. Empty = auto-detect (origin/HEAD → main → master).
  baseBranch: '',
  guards: Object.freeze({ refuseTeardownIfDirty: true, refuseTeardownIfUnpushed: true }),
})

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// A fresh, deeply-mutable copy of the defaults to merge onto.
function defaults() {
  return {
    worktree: { ...DEFAULT_CONFIG.worktree },
    docker: { ...DEFAULT_CONFIG.docker },
    dev: [],
    proxy: { ...DEFAULT_CONFIG.proxy },
    open: { ...DEFAULT_CONFIG.open },
    registry: DEFAULT_CONFIG.registry,
    branch: { ...DEFAULT_CONFIG.branch },
    baseBranch: DEFAULT_CONFIG.baseBranch,
    guards: { ...DEFAULT_CONFIG.guards },
  }
}

// Copy a typed field from parsed[key] onto base[key] when it matches `type`.
// Strings are trimmed and must be non-empty to override.
function assign(base, parsed, key, type) {
  const v = parsed[key]
  if (type === 'string') {
    if (typeof v === 'string' && v.trim()) base[key] = v.trim()
  } else if (type === 'string?') {
    // string that may be intentionally empty (e.g. backupCommand)
    if (typeof v === 'string') base[key] = v
  } else if (type === 'boolean') {
    if (typeof v === 'boolean') base[key] = v
  } else if (type === 'number') {
    if (typeof v === 'number' && Number.isFinite(v)) base[key] = v
  }
}

/**
 * Normalise a parsed `dev` array into well-formed process entries. Each entry
 * needs non-empty string `name`, `command`, and `portVar`; `health` (string) and
 * `frontPort` (finite number) are optional. Malformed entries are dropped
 * (lenient, like the rest of the loader) so a stray entry can't crash provisioning.
 */
function normalizeDev(parsed) {
  const out = []
  for (const raw of parsed) {
    if (!isObject(raw)) continue
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    const command = typeof raw.command === 'string' ? raw.command.trim() : ''
    const portVar = typeof raw.portVar === 'string' ? raw.portVar.trim() : ''
    if (!name || !command || !portVar) continue
    const entry = { name, command, portVar }
    if (typeof raw.health === 'string' && raw.health.trim()) entry.health = raw.health.trim()
    if (typeof raw.frontPort === 'number' && Number.isFinite(raw.frontPort)) {
      entry.frontPort = raw.frontPort
    }
    out.push(entry)
  }
  return out
}

/**
 * Merge a parsed config over the defaults. Only known keys are copied (unknown
 * keys ignored for forward-compat). Nested objects are merged field-by-field.
 */
function mergeConfig(base, parsed) {
  if (!isObject(parsed)) return base

  if (isObject(parsed.worktree)) {
    assign(base.worktree, parsed.worktree, 'root', 'string')
    assign(base.worktree, parsed.worktree, 'folderPattern', 'string')
  }

  if (isObject(parsed.docker)) {
    assign(base.docker, parsed.docker, 'enabled', 'boolean')
    assign(base.docker, parsed.docker, 'composeFile', 'string')
    assign(base.docker, parsed.docker, 'projectNamePattern', 'string')
    assign(base.docker, parsed.docker, 'portBase', 'number')
    assign(base.docker, parsed.docker, 'portsPerSpec', 'number')
    assign(base.docker, parsed.docker, 'envFile', 'string')
    assign(base.docker, parsed.docker, 'backupCommand', 'string?')
  }

  if (Array.isArray(parsed.dev)) {
    base.dev = normalizeDev(parsed.dev)
  }

  if (isObject(parsed.proxy)) {
    assign(base.proxy, parsed.proxy, 'enabled', 'boolean')
    assign(base.proxy, parsed.proxy, 'host', 'string')
  }

  if (isObject(parsed.open)) {
    // command may be intentionally empty (no auto-open)
    assign(base.open, parsed.open, 'command', 'string?')
  }

  if (isObject(parsed.branch)) {
    assign(base.branch, parsed.branch, 'pattern', 'string')
    assign(base.branch, parsed.branch, 'identifierField', 'string')
  }

  assign(base, parsed, 'registry', 'string')
  assign(base, parsed, 'baseBranch', 'string')

  if (isObject(parsed.guards)) {
    assign(base.guards, parsed.guards, 'refuseTeardownIfDirty', 'boolean')
    assign(base.guards, parsed.guards, 'refuseTeardownIfUnpushed', 'boolean')
  }

  return base
}

/**
 * Load and normalise `specs/.core/env.config.json` from `dir` (default cwd).
 * Returns `{ config, present }`:
 *   - missing file → `{ config: defaults, present: false }` (opt-out; never throws)
 *   - present      → `{ config: merged,   present: true }`
 * Malformed JSON → throws a clear Error (callers exit non-zero).
 */
function loadEnvConfig(dir = process.cwd()) {
  const base = defaults()
  const file = join(dir, CONFIG_FILE)

  let raw
  try {
    raw = readFileSync(file, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return { config: base, present: false }
    throw error
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid ${CONFIG_FILE}: ${error.message}`)
  }

  return { config: mergeConfig(base, parsed), present: true }
}

module.exports = {
  loadEnvConfig,
  mergeConfig,
  DEFAULT_CONFIG,
  CONFIG_FILE,
}
