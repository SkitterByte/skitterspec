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
 *     open:     { command },   // optional, editor/terminal-agnostic opener
 *     registry: ".spec-env/registry.json",
 *     linkLinear: true,
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
  open: Object.freeze({ command: '' }),
  registry: '.spec-env/registry.json',
  linkLinear: true,
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
    open: { ...DEFAULT_CONFIG.open },
    registry: DEFAULT_CONFIG.registry,
    linkLinear: DEFAULT_CONFIG.linkLinear,
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

  if (isObject(parsed.open)) {
    // command may be intentionally empty (no auto-open)
    assign(base.open, parsed.open, 'command', 'string?')
  }

  assign(base, parsed, 'registry', 'string')
  assign(base, parsed, 'linkLinear', 'boolean')
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
