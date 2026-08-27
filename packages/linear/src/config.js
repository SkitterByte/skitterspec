'use strict'

/**
 * Config loader for the one-way Linear sync feature (`/spec-status`, `/spec-push`
 * and the Linear-aware paths of `/spec` and `/spec-go`).
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
 *     linear:   { teamKey, teamId, projectId },
 *     intake:   { label, bugLabels },
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
  // `projectId` is the project picker's DEFAULT, not a mandate: `/spec` and the
  // first `/spec-push` offer the team's projects and pre-select this one; empty
  // means "None (team only)" is pre-selected. It is passed on the issue-create
  // call only and never stored in the spec or the snapshot, so a PM re-homing the
  // issue in Linear is invisible to sync. (The old `initiativeId` grouped
  // Projects, which no longer exist.)
  linear: Object.freeze({ teamKey: '', teamId: '', projectId: '' }),
  // Issue intake (`/spec <ISSUE-REF>`, `/spec --from-issue`). `label` is the
  // inbox filter — issues carrying it are what the web app files; `bugLabels`
  // route an issue to `/spec-bug` instead of `/spec`. Both empty = no inbox to
  // browse (a bare issue ref still works) and no bug routing.
  intake: Object.freeze({ label: '', bugLabels: Object.freeze([]) }),
  // A spec is a Linear ISSUE; each phase is a SUB-ISSUE of it; tasks are not
  // synced (they live only in the repo phase files).
  mapping: Object.freeze({ specFolder: 'issue', phases: 'subissue', tasks: 'none' }),
  // Linear ISSUE workflow-state names — the spec issue's state (from the folder
  // bucket) and each sub-issue's state (from the phase emoji) both map through
  // this one table. They must match the workspace's issue states exactly;
  // `validateStates` checks them at push/status time.
  states: Object.freeze({
    backlog: 'Backlog',
    'in-progress': 'In Progress',
    complete: 'Done',
    cancelled: 'Canceled',
  }),
  snapshot: Object.freeze({ overviewFile: '00-overview.md' }),
  branch: Object.freeze({ pattern: '{type}/{slug}' }),
  sync: Object.freeze({
    baseDir: 'specs/.core/linear-base',
    backupDir: 'specs/.core/linear-backups',
    // One-way (repo → Linear): the projection field set the repo owns and pushes
    // — the issue `description`, its `subIssues` (one per phase, name + goal +
    // state), and the lifecycle `workflowState`. There is no pull. Priority,
    // labels, cycles and comments are Linear-native triage — deliberately NOT in
    // the set, so the PM's triage is never touched. The `push` marker is retained
    // for shape; any key you add joins the pushed projection.
    fieldOwnership: Object.freeze({
      description: 'push',
      subIssues: 'push',
      workflowState: 'push',
    }),
    localOnlySections: Object.freeze(['State log', 'Changelog', 'Open questions']),
    // Fields that are keyed collections (arrays of objects with a stable id),
    // compared/merged per item rather than as one opaque value. Map field name →
    // the item's id property. Empty by default — a workspace opts a field in
    // (e.g. { subIssues: "ref" }) once the body round-trip is wired.
    keyedFields: Object.freeze({}),
  }),
})

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// A fresh, deeply-mutable copy of the defaults to merge onto.
function defaults() {
  return {
    linear: { ...DEFAULT_CONFIG.linear },
    intake: { label: DEFAULT_CONFIG.intake.label, bugLabels: [...DEFAULT_CONFIG.intake.bugLabels] },
    mapping: { ...DEFAULT_CONFIG.mapping },
    states: { ...DEFAULT_CONFIG.states },
    snapshot: { ...DEFAULT_CONFIG.snapshot },
    branch: { ...DEFAULT_CONFIG.branch },
    sync: {
      baseDir: DEFAULT_CONFIG.sync.baseDir,
      backupDir: DEFAULT_CONFIG.sync.backupDir,
      fieldOwnership: { ...DEFAULT_CONFIG.sync.fieldOwnership },
      localOnlySections: [...DEFAULT_CONFIG.sync.localOnlySections],
      keyedFields: { ...DEFAULT_CONFIG.sync.keyedFields },
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

// Normalise an array config value to trimmed, non-empty strings.
function stringList(value) {
  return value.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
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

// Merge (and validate) sync.keyedFields. Each value is the item's id property
// name (a non-empty string); a field listed here is compared per item.
function mergeKeyedFields(base, parsed) {
  if (!isObject(parsed)) return
  for (const [field, idKey] of Object.entries(parsed)) {
    if (typeof idKey !== 'string' || !idKey.trim()) {
      throw new Error(
        `Invalid ${CONFIG_FILE}: sync.keyedFields.${field} = ${JSON.stringify(idKey)} ` +
          '(expected the item id property name, a non-empty string)',
      )
    }
    base[field] = idKey.trim()
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
    assign(base.linear, parsed.linear, 'projectId', 'string?')
  }

  if (isObject(parsed.intake)) {
    assign(base.intake, parsed.intake, 'label', 'string?')
    if (Array.isArray(parsed.intake.bugLabels)) {
      base.intake.bugLabels = stringList(parsed.intake.bugLabels)
    }
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
    mergeKeyedFields(base.sync.keyedFields, parsed.sync.keyedFields)
    if (Array.isArray(parsed.sync.localOnlySections)) {
      base.sync.localOnlySections = stringList(parsed.sync.localOnlySections)
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
