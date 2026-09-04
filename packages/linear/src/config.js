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
 *     intake:   { label, bugLabels, hotfixLabels },
 *     mapping:  { specFolder, phases, tasks },
 *     states:   { backlog, "in-progress", complete, cancelled },
 *     release:  { stages: [{ key, state }] },
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

// How a phase's task list is projected into its sub-issue description.
//   checklist — mirror the tasks as a read-only markdown checklist (default)
//   none      — sub-issue description is the phase's `**Goal:**` line alone
// Tasks are never read back either way; the repo stays the source of truth and a
// box ticked in the tracker is overwritten by the next push.
const TASK_MAPPINGS = Object.freeze(['checklist', 'none'])

// When a phase becomes a sub-issue.
//   subissue — always, from the spec's first push (default)
//   deferred — only once the work starts: a spec sitting in `backlog` (or
//              `cancelled` without ever having started) projects the issue
//              alone, so adopting sync on a long backlog costs one call per
//              spec instead of one per spec PLUS one per phase. A phase that
//              already carries an id keeps projecting either way — one-way sync
//              has no delete, so withholding a LINKED sub-issue would freeze it
//              in the tracker rather than remove it.
//   inline   — never: each phase becomes a SECTION of the spec issue's own
//              description instead, and the `## Phases` index stays as its table
//              of contents. For work nobody will pick up phase by phase — 250
//              finished specs are 250 issues worth reading and 669 sub-issues
//              worth nobody's attention. Keeps an already-linked phase's
//              sub-issue for the same reason `deferred` does.
//
// `mapping.phases` takes one of these as a scalar (one mode for the whole repo)
// OR a map keyed by lifecycle bucket — `{ "backlog": "subissue", "complete":
// "deferred" }` — because a repo can want assignable sub-issues for work in
// flight and something else entirely for work that finished long ago. A bucket
// the map omits gets DEFAULT_PHASE_MODE, so a partial map adds an exception
// rather than silently suppressing phases everywhere it is silent.
const PHASE_MAPPINGS = Object.freeze(['subissue', 'deferred', 'inline'])
const DEFAULT_PHASE_MODE = 'subissue'

// How `spec-sync apply` reaches Linear. `api` talks to the GraphQL API directly;
// `mcp` prints the plan for the skill to apply over MCP, as it always has.
const TRANSPORTS = Object.freeze(['api', 'mcp'])

// The environment variable a Linear personal API key is read from, unless
// `auth.keyEnv` names another. The config names the VARIABLE, never the key —
// nothing secret is ever written to the repo.
const DEFAULT_KEY_ENV = 'LINEAR_API_KEY'

// The project's OWN deployment ladder: where a ticket goes AFTER its spec is
// complete — deployed to test, approved for demo, live in prod. Deliberately an
// open, ORDERED list in the project's vocabulary rather than a fixed set: one
// team's `On Test`/`Ready for Demo` is another's `staging`, and most projects
// have none at all. Empty (the default) means the project declared no ladder,
// and every stage-aware path is simply unused.
//
// It is NOT keyed by lifecycle bucket, unlike `states` and `mapping.phases`.
// A deployment stage is a fact about an ENVIRONMENT, and no folder under
// `specs/` can ever derive one — which is why it must not join
// LIFECYCLE_BUCKETS.
const DEFAULT_RELEASE_STAGES = Object.freeze([])

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
  // route an issue to `/spec-bug` instead of `/spec`, and `hotfixLabels` route it
  // to `/spec-hotfix` — a bug that has to be patched on the released version, not
  // fixed on main. All empty = no inbox to browse (a bare issue ref still works)
  // and no routing. `hotfixLabels` wins over `bugLabels` on an issue carrying
  // both: production is the more specific destination, and the cost of getting it
  // wrong is asymmetric — a fix that lands only on main never reaches prod.
  intake: Object.freeze({ label: '', bugLabels: Object.freeze([]), hotfixLabels: Object.freeze([]) }),
  // A spec is a Linear ISSUE; each phase is a SUB-ISSUE of it; tasks are not
  // synced (they live only in the repo phase files).
  // A spec is an ISSUE; each phase a SUB-ISSUE of it. `tasks` selects how the
  // phase's checkboxes reach that sub-issue's description — see TASK_MAPPINGS.
  mapping: Object.freeze({ specFolder: 'issue', phases: DEFAULT_PHASE_MODE, tasks: 'checklist' }),
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
  // See DEFAULT_RELEASE_STAGES above. `stages` is ordered: the order is recorded
  // for reporting and doctor's ladder check, and deliberately NOT enforced — a
  // rollback from test and a hotfix going straight to prod are both legitimate.
  release: Object.freeze({ stages: DEFAULT_RELEASE_STAGES }),
  branch: Object.freeze({ pattern: '{type}/{slug}' }),
  // `keyEnv` names the env var holding the personal API key. It is a NAME, not a
  // key: putting the secret itself here would commit it.
  auth: Object.freeze({ keyEnv: DEFAULT_KEY_ENV }),
  // `transport` is the default for `spec-sync apply --via`. Empty means "decide
  // at run time": use the API when a key is present, MCP when it isn't.
  apply: Object.freeze({ transport: '' }),
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

// The lifecycle buckets a per-bucket `mapping.phases` map may key on. Derived
// from `states` rather than restated: both maps key on the spec's folder bucket,
// so they cannot drift apart.
const LIFECYCLE_BUCKETS = Object.freeze(Object.keys(DEFAULT_CONFIG.states))

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// A fresh, deeply-mutable copy of the defaults to merge onto.
function defaults() {
  return {
    linear: { ...DEFAULT_CONFIG.linear },
    intake: {
      label: DEFAULT_CONFIG.intake.label,
      bugLabels: [...DEFAULT_CONFIG.intake.bugLabels],
      hotfixLabels: [...DEFAULT_CONFIG.intake.hotfixLabels],
    },
    mapping: { ...DEFAULT_CONFIG.mapping },
    states: { ...DEFAULT_CONFIG.states },
    snapshot: { ...DEFAULT_CONFIG.snapshot },
    release: { stages: DEFAULT_CONFIG.release.stages.map((s) => ({ ...s })) },
    branch: { ...DEFAULT_CONFIG.branch },
    auth: { ...DEFAULT_CONFIG.auth },
    apply: { ...DEFAULT_CONFIG.apply },
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

// Merge (and validate) `mapping.phases` in either of its two forms: a scalar
// mode for the whole repo, or a map of lifecycle bucket → mode. Loud on a bad
// key or value, like fieldOwnership and mapping.tasks — a misspelt bucket would
// otherwise read as a deliberate default and go on minting the sub-issues the
// config was written to stop.
function mergePhaseMapping(base, parsed) {
  const value = parsed.phases
  if (typeof value === 'string') {
    if (value.trim()) base.phases = value.trim()
  } else if (isObject(value)) {
    const byBucket = {}
    for (const [bucket, mode] of Object.entries(value)) {
      if (!LIFECYCLE_BUCKETS.includes(bucket)) {
        throw new Error(
          `Invalid ${CONFIG_FILE}: mapping.phases.${bucket} is not a lifecycle bucket ` +
            `(expected one of ${LIFECYCLE_BUCKETS.join('|')})`,
        )
      }
      if (!PHASE_MAPPINGS.includes(mode)) {
        throw new Error(
          `Invalid ${CONFIG_FILE}: mapping.phases.${bucket} = ${JSON.stringify(mode)} ` +
            `(expected one of ${PHASE_MAPPINGS.join('|')})`,
        )
      }
      byBucket[bucket] = mode
    }
    base.phases = byBucket
  } else if (value !== undefined) {
    throw new Error(
      `Invalid ${CONFIG_FILE}: mapping.phases = ${JSON.stringify(value)} ` +
        `(expected one of ${PHASE_MAPPINGS.join('|')}, or a map of lifecycle bucket to mode)`,
    )
  }
  if (typeof base.phases === 'string' && !PHASE_MAPPINGS.includes(base.phases)) {
    throw new Error(
      `Invalid ${CONFIG_FILE}: mapping.phases = ${JSON.stringify(base.phases)} ` +
        `(expected one of ${PHASE_MAPPINGS.join('|')}, or a map of lifecycle bucket to mode)`,
    )
  }
}

// Merge (and validate) `release.stages` — the project's deployment ladder.
//
// Loud on a malformed entry, like fieldOwnership and mapping.phases above: this
// list names Linear states, and Linear SILENTLY IGNORES an unknown state. A
// half-typed ladder would push clean and move nothing, which is exactly the
// failure `validateStates` exists to stop — so a bad shape fails here, at load,
// rather than at the first deploy nobody is watching.
//
// An ABSENT `release` block is not an error: it is the opt-out, and the whole
// feature is unused without it.
function mergeReleaseStages(base, parsed) {
  const value = parsed.stages
  if (value === undefined) return
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid ${CONFIG_FILE}: release.stages = ${JSON.stringify(value)} ` +
        '(expected an array of { key, state })',
    )
  }
  const stages = []
  const seen = new Set()
  value.forEach((entry, i) => {
    if (!isObject(entry)) {
      throw new Error(
        `Invalid ${CONFIG_FILE}: release.stages[${i}] = ${JSON.stringify(entry)} ` +
          '(expected { key, state })',
      )
    }
    for (const field of ['key', 'state']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) {
        throw new Error(
          `Invalid ${CONFIG_FILE}: release.stages[${i}].${field} = ${JSON.stringify(entry[field])} ` +
            '(expected a non-empty string)',
        )
      }
    }
    const key = entry.key.trim()
    if (seen.has(key)) {
      throw new Error(
        `Invalid ${CONFIG_FILE}: release.stages[${i}].key = ${JSON.stringify(key)} is a duplicate ` +
          '(a stage key is how CI names the rung, so it must be unique)',
      )
    }
    seen.add(key)
    stages.push({ key, state: entry.state.trim() })
  })
  base.stages = stages
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
    if (Array.isArray(parsed.intake.hotfixLabels)) {
      base.intake.hotfixLabels = stringList(parsed.intake.hotfixLabels)
    }
  }

  if (isObject(parsed.mapping)) {
    assign(base.mapping, parsed.mapping, 'specFolder', 'string')
    assign(base.mapping, parsed.mapping, 'tasks', 'string')
    // Loud on a typo, like fieldOwnership above. Quietly falling back would make
    // a misspelt value look like a deliberate `none` — the same silent
    // degradation the phase-status lint exists to stamp out.
    if (!TASK_MAPPINGS.includes(base.mapping.tasks)) {
      throw new Error(
        `Invalid ${CONFIG_FILE}: mapping.tasks = ${JSON.stringify(base.mapping.tasks)} ` +
          `(expected one of ${TASK_MAPPINGS.join('|')})`,
      )
    }
    mergePhaseMapping(base.mapping, parsed.mapping)
  }

  if (isObject(parsed.states)) {
    for (const key of Object.keys(base.states)) {
      assign(base.states, parsed.states, key, 'string')
    }
  }

  if (isObject(parsed.snapshot)) {
    assign(base.snapshot, parsed.snapshot, 'overviewFile', 'string')
  }

  if (isObject(parsed.release)) {
    mergeReleaseStages(base.release, parsed.release)
  }

  if (isObject(parsed.branch)) {
    assign(base.branch, parsed.branch, 'pattern', 'string')
  }

  if (isObject(parsed.auth)) {
    assign(base.auth, parsed.auth, 'keyEnv', 'string')
  }

  if (isObject(parsed.apply)) {
    assign(base.apply, parsed.apply, 'transport', 'string?')
    // Loud on a typo, like the mapping enums: a misspelt transport must not
    // quietly fall back to MCP and look like a deliberate choice.
    if (base.apply.transport && !TRANSPORTS.includes(base.apply.transport)) {
      throw new Error(
        `Invalid ${CONFIG_FILE}: apply.transport = ${JSON.stringify(base.apply.transport)} ` +
          `(expected one of ${TRANSPORTS.join('|')})`,
      )
    }
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
 * Malformed JSON, a bad `fieldOwnership` enum, or a malformed `release.stages`
 * entry → throws a clear Error.
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

/**
 * The project's declared deployment ladder, always an array (empty = none
 * declared). Callers read this rather than reaching into the config, so an
 * older config object without a `release` block cannot throw.
 */
function releaseStages(config) {
  const stages = config && config.release && config.release.stages
  return Array.isArray(stages) ? stages : []
}

/** The ladder rung with this key, or null. */
function stageFor(config, key) {
  return releaseStages(config).find((s) => s.key === key) || null
}

module.exports = {
  loadLinearConfig,
  releaseStages,
  stageFor,
  mergeConfig,
  defaults,
  DEFAULT_CONFIG,
  CONFIG_FILE,
  OWNERSHIP,
  TASK_MAPPINGS,
  PHASE_MAPPINGS,
  LIFECYCLE_BUCKETS,
  TRANSPORTS,
  DEFAULT_KEY_ENV,
}
