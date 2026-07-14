'use strict'

/**
 * Config loader for the Linear hybrid-sync feature (`/spec-status`, `/spec-pull`,
 * `/spec-push` and the Linear-aware paths of `/spec` and `/spec-go`).
 *
 * Reads `specs/.core/linear.config.json` from the project root and normalises it
 * over frozen defaults. The feature is strictly opt-in: when the file is absent
 * the loader never throws — it returns the defaults with `present:false`, which
 * every caller treats as "Linear sync unused".
 *
 * Mirrors the shape/idiom of `src/env/config.js` (frozen defaults, merge known
 * keys only, forward-compatible on unknown keys). Zero-dependency. The one place
 * it is stricter: a `sync.fieldOwnership` value outside `both|pull|push` is a
 * hard error — the engine's whole safety model rests on those enums.
 *
 * Shape (see assets/core/linear.config.md for field docs):
 *   {
 *     linear:   { teamKey, teamId, initiativeId },
 *     mapping:  { specFolder, phases, tasks },
 *     states:   { backlog, "in-progress", complete, cancelled },
 *     snapshot: { overviewFile },
 *     branch:   { pattern },
 *     sync: {
 *       baseDir, backupDir,
 *       fieldOwnership: { <field>: "both" | "pull" | "push" },
 *       localOnlySections: string[]
 *     }
 *   }
 */

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const CONFIG_FILE = join('specs', '.core', 'linear.config.json')

const OWNERSHIP = Object.freeze(['both', 'pull', 'push'])

const DEFAULT_CONFIG = Object.freeze({
  linear: Object.freeze({ teamKey: '', teamId: '', initiativeId: '' }),
  mapping: Object.freeze({ specFolder: 'project', phases: 'milestone', tasks: 'issue' }),
  states: Object.freeze({
    backlog: 'Backlog',
    'in-progress': 'In Progress',
    complete: 'Done',
    cancelled: 'Cancelled',
  }),
  snapshot: Object.freeze({ overviewFile: '00-overview.md' }),
  branch: Object.freeze({ pattern: '{type}/{slug}' }),
  sync: Object.freeze({
    baseDir: 'specs/.core/linear-base',
    backupDir: 'specs/.core/linear-backups',
    fieldOwnership: Object.freeze({
      description: 'both',
      milestones: 'both',
      phaseBodies: 'both',
      acceptanceCriteria: 'both',
      taskBreakdown: 'both',
      workflowState: 'pull',
      priority: 'pull',
      labels: 'pull',
    }),
    localOnlySections: Object.freeze(['State log', 'Changelog', 'Open questions']),
  }),
})

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// A fresh, deeply-mutable copy of the defaults to merge onto.
function defaults() {
  return {
    linear: { ...DEFAULT_CONFIG.linear },
    mapping: { ...DEFAULT_CONFIG.mapping },
    states: { ...DEFAULT_CONFIG.states },
    snapshot: { ...DEFAULT_CONFIG.snapshot },
    branch: { ...DEFAULT_CONFIG.branch },
    sync: {
      baseDir: DEFAULT_CONFIG.sync.baseDir,
      backupDir: DEFAULT_CONFIG.sync.backupDir,
      fieldOwnership: { ...DEFAULT_CONFIG.sync.fieldOwnership },
      localOnlySections: [...DEFAULT_CONFIG.sync.localOnlySections],
    },
  }
}

// Copy a typed field from parsed[key] onto base[key] when it matches `type`.
// Strings are trimmed and must be non-empty to override; `string?` may be empty.
function assign(base, parsed, key, type) {
  const v = parsed[key]
  if (type === 'string') {
    if (typeof v === 'string' && v.trim()) base[key] = v.trim()
  } else if (type === 'string?') {
    if (typeof v === 'string') base[key] = v
  } else if (type === 'boolean') {
    if (typeof v === 'boolean') base[key] = v
  }
}

// Merge (and validate) sync.fieldOwnership. Any key the caller lists joins the
// compared field set; the value MUST be one of both|pull|push.
function mergeFieldOwnership(base, parsed) {
  if (!isObject(parsed)) return
  for (const [field, dir] of Object.entries(parsed)) {
    if (!OWNERSHIP.includes(dir)) {
      throw new Error(
        `Invalid ${CONFIG_FILE}: sync.fieldOwnership.${field} = ${JSON.stringify(dir)} ` +
          `(expected one of ${OWNERSHIP.join('|')})`,
      )
    }
    base[field] = dir
  }
}

/**
 * Merge a parsed config over the defaults. Only known keys are copied (unknown
 * keys ignored for forward-compat). Nested objects are merged field-by-field.
 */
function mergeConfig(base, parsed) {
  if (!isObject(parsed)) return base

  if (isObject(parsed.linear)) {
    assign(base.linear, parsed.linear, 'teamKey', 'string?')
    assign(base.linear, parsed.linear, 'teamId', 'string?')
    assign(base.linear, parsed.linear, 'initiativeId', 'string?')
  }

  if (isObject(parsed.mapping)) {
    assign(base.mapping, parsed.mapping, 'specFolder', 'string')
    assign(base.mapping, parsed.mapping, 'phases', 'string')
    assign(base.mapping, parsed.mapping, 'tasks', 'string')
  }

  if (isObject(parsed.states)) {
    for (const key of Object.keys(base.states)) {
      assign(base.states, parsed.states, key, 'string')
    }
  }

  if (isObject(parsed.snapshot)) {
    assign(base.snapshot, parsed.snapshot, 'overviewFile', 'string')
  }

  if (isObject(parsed.branch)) {
    assign(base.branch, parsed.branch, 'pattern', 'string')
  }

  if (isObject(parsed.sync)) {
    assign(base.sync, parsed.sync, 'baseDir', 'string')
    assign(base.sync, parsed.sync, 'backupDir', 'string')
    mergeFieldOwnership(base.sync.fieldOwnership, parsed.sync.fieldOwnership)
    if (Array.isArray(parsed.sync.localOnlySections)) {
      base.sync.localOnlySections = parsed.sync.localOnlySections
        .filter((s) => typeof s === 'string' && s.trim())
        .map((s) => s.trim())
    }
  }

  return base
}

/**
 * Load and normalise `specs/.core/linear.config.json` from `dir` (default cwd).
 * Returns `{ config, present }`:
 *   - missing file → `{ config: defaults, present: false }` (opt-out; never throws)
 *   - present      → `{ config: merged,   present: true }`
 * Malformed JSON or a bad `fieldOwnership` enum → throws a clear Error.
 */
function loadLinearConfig(dir = process.cwd()) {
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
  loadLinearConfig,
  mergeConfig,
  DEFAULT_CONFIG,
  CONFIG_FILE,
  OWNERSHIP,
}
