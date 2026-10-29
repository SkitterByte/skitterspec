'use strict'

/**
 * `specs/.core/github.config.json` — the committed, shareable half of this
 * provider's setup. It holds the repo, the board's number and field NAMES, and
 * env-var NAMES; never a credential (those live in the user-level store —
 * `credentials.js`).
 *
 * The merge/validation machinery is the kit's (`provider-kit/src/config.js`);
 * this module owns what is GitHub's: the defaults, the file name, and the
 * vocabularies.
 *
 * WORKFLOW STATE LIVES ON THE BOARD. A GitHub issue is only open or closed; the
 * named states a spec moves through are options of a Projects v2 single-select
 * field (`github.statusField`, "Status" by default). The board is required —
 * an issue that is not on it has no state at all — and the terminal buckets
 * also close the issue, with the reason `closeReasonFor` names, so the issue
 * list agrees with the board.
 */

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const kitConfig = require('@skitterbyte/skitterspec-provider-kit/src/config.js')
const { dialect } = require('./dialect.js')

const CONFIG_FILE = 'specs/.core/github.config.json'

const OWNERSHIP = Object.freeze(['both', 'pull', 'push', 'none'])
const TASK_MAPPINGS = Object.freeze(['checklist', 'none'])
const PHASE_MAPPINGS = Object.freeze(['subissue', 'deferred', 'inline'])
const TRANSPORTS = Object.freeze(['api', 'mcp'])
const DEFAULT_TOKEN_ENV = 'GITHUB_TOKEN'
// Read after `auth.tokenEnv`, because it is the name the GitHub CLI itself
// honours — a machine with `gh` configured often already exports it.
const FALLBACK_TOKEN_ENV = 'GH_TOKEN'
const DEFAULT_PHASE_MODE = 'subissue'

// The issue's own state for a lifecycle bucket — the half of Decision 3 that
// is not the board. A bucket absent here leaves the issue OPEN.
const CLOSE_REASONS = Object.freeze({ complete: 'completed', cancelled: 'not_planned' })

const DEFAULT_CONFIG = Object.freeze({
  // `owner`/`repo` is where spec issues land; `project` is the Projects v2
  // board's NUMBER (the one in its URL), owned by `owner`. One board per repo.
  // `statusField` names the single-select carrying workflow state. `labels`
  // tell a spec issue from a phase issue on a personal account, where issue
  // types do not exist; `issueTypes`, when set on an org-owned repo, are used
  // as well.
  github: Object.freeze({
    owner: '',
    repo: '',
    project: null,
    statusField: 'Status',
    labels: Object.freeze({ spec: 'spec', phase: 'phase' }),
    issueTypes: Object.freeze({ spec: '', phase: '' }),
  }),
  // A spec is a GitHub ISSUE; each phase a SUB-ISSUE of it, carrying the
  // phase's checkboxes in its body as a task list (rendered live by GitHub —
  // still a read-only mirror).
  mapping: Object.freeze({ specFolder: 'issue', phases: DEFAULT_PHASE_MODE, tasks: 'checklist' }),
  // Board STATUS OPTION names — the spec issue's (from the folder bucket) and
  // each sub-issue's (from the phase emoji) both map through this table. They
  // must match the Status field's options exactly; the adapter resolves them
  // to option ids at run time and refuses an unknown name.
  states: Object.freeze({
    backlog: 'Backlog',
    'in-progress': 'In Progress',
    complete: 'Done',
    cancelled: 'Cancelled',
  }),
  snapshot: Object.freeze({ overviewFile: '00-overview.md' }),
  // The frontmatter FIELD VOCABULARY this provider stamps into spec files
  // (sync-core `src/fields.js`). The identifier is `#123`; node ids and
  // database ids are resolved from it at run time, never stamped.
  fields: Object.freeze({
    identifier: 'github_identifier',
    url: 'github_url',
    issueId: 'github_issue_id',
    assigneeId: 'github_assignee_id',
    assigneeName: 'github_assignee_name',
  }),
  intake: Object.freeze({ label: '', bugLabels: Object.freeze(['bug']), hotfixLabels: Object.freeze([]) }),
  release: Object.freeze({ stages: Object.freeze([]), ignorePaths: Object.freeze(['specs/', 'CHANGELOG.md', 'RELEASES.md']) }),
  branch: Object.freeze({ pattern: '{type}/{slug}' }),
  // An env-var NAME, not a value. A classic PAT with `repo` + `project`: the
  // fine-grained kind is documented only for org-owned boards.
  auth: Object.freeze({ tokenEnv: DEFAULT_TOKEN_ENV }),
  apply: Object.freeze({ transport: '' }),
  sync: Object.freeze({
    baseDir: 'specs/.core/github-base',
    backupDir: 'specs/.core/github-backups',
    fieldOwnership: Object.freeze({
      description: 'push',
      subIssues: 'push',
      workflowState: 'push',
      assignee: 'push',
    }),
    localOnlySections: Object.freeze(['State log', 'Changelog', 'Open questions']),
    keyedFields: Object.freeze({}),
  }),
})

const IDENTIFIER_FIELD = DEFAULT_CONFIG.fields.identifier

// The per-spec-isolation keys THIS PROVIDER needs a project to declare, merged
// into env.config.json.example at dist-compose time (see build-dist.js).
const ENV_CONFIG_DEFAULTS = Object.freeze({
  branch: Object.freeze({ identifierField: IDENTIFIER_FIELD }),
  spec: Object.freeze({
    companionPaths: Object.freeze([`${DEFAULT_CONFIG.sync.baseDir}/{identifier}.base.json`]),
  }),
})

const LIFECYCLE_BUCKETS = Object.freeze(Object.keys(DEFAULT_CONFIG.states))

// A fresh, deeply-mutable copy of the defaults to merge onto.
function defaults() {
  const g = DEFAULT_CONFIG.github
  return {
    github: { ...g, labels: { ...g.labels }, issueTypes: { ...g.issueTypes } },
    mapping: { ...DEFAULT_CONFIG.mapping },
    states: { ...DEFAULT_CONFIG.states },
    stateAliases: {},
    snapshot: { ...DEFAULT_CONFIG.snapshot },
    fields: { ...DEFAULT_CONFIG.fields },
    intake: {
      label: DEFAULT_CONFIG.intake.label,
      bugLabels: [...DEFAULT_CONFIG.intake.bugLabels],
      hotfixLabels: [...DEFAULT_CONFIG.intake.hotfixLabels],
    },
    release: {
      stages: DEFAULT_CONFIG.release.stages.map((s) => ({ ...s })),
      ignorePaths: [...DEFAULT_CONFIG.release.ignorePaths],
    },
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

const { isObject, stringList, assign } = kitConfig
const { mergeStates, mergeFieldOwnership, mergePhaseMapping, mergeReleaseStages, mergeReleaseIgnorePaths, mergeKeyedFields } =
  kitConfig.makeMergeHelpers({
    configFile: CONFIG_FILE,
    ownership: OWNERSHIP,
    lifecycleBuckets: LIFECYCLE_BUCKETS,
    phaseMappings: PHASE_MAPPINGS,
  })

function invalid(key, value, expected) {
  return new Error(`Invalid ${CONFIG_FILE}: ${key} = ${JSON.stringify(value)} (expected ${expected})`)
}

/**
 * Merge a parsed config over the defaults. Only known keys are copied (unknown
 * keys ignored for forward-compat). Nested objects are merged field-by-field.
 */
function mergeConfig(base, parsed) {
  if (!isObject(parsed)) return base

  if (isObject(parsed.github)) {
    assign(base.github, parsed.github, 'owner', 'string?')
    assign(base.github, parsed.github, 'repo', 'string?')
    assign(base.github, parsed.github, 'statusField', 'string')
    if ('project' in parsed.github) {
      const n = parsed.github.project
      // The board's NUMBER, from its URL — not its node id. A string of digits
      // is accepted because that is what gets pasted out of a URL.
      if (n === null || n === '') base.github.project = null
      else if (Number.isInteger(n) && n > 0) base.github.project = n
      else if (typeof n === 'string' && /^\d+$/.test(n.trim()) && Number(n) > 0) base.github.project = Number(n)
      else throw invalid('github.project', n, 'the board number from its URL, e.g. 7')
    }
    if (isObject(parsed.github.labels)) {
      assign(base.github.labels, parsed.github.labels, 'spec', 'string?')
      assign(base.github.labels, parsed.github.labels, 'phase', 'string?')
    }
    if (isObject(parsed.github.issueTypes)) {
      assign(base.github.issueTypes, parsed.github.issueTypes, 'spec', 'string?')
      assign(base.github.issueTypes, parsed.github.issueTypes, 'phase', 'string?')
    }
  }

  if (isObject(parsed.mapping)) {
    assign(base.mapping, parsed.mapping, 'specFolder', 'string')
    assign(base.mapping, parsed.mapping, 'tasks', 'string')
    if (!TASK_MAPPINGS.includes(base.mapping.tasks)) {
      throw invalid('mapping.tasks', base.mapping.tasks, `one of ${TASK_MAPPINGS.join('|')}`)
    }
    mergePhaseMapping(base.mapping, parsed.mapping)
  }

  mergeStates(base, parsed)

  if (isObject(parsed.snapshot)) {
    assign(base.snapshot, parsed.snapshot, 'overviewFile', 'string')
  }

  if (isObject(parsed.intake)) {
    assign(base.intake, parsed.intake, 'label', 'string?')
    if (Array.isArray(parsed.intake.bugLabels)) base.intake.bugLabels = stringList(parsed.intake.bugLabels)
    if (Array.isArray(parsed.intake.hotfixLabels)) base.intake.hotfixLabels = stringList(parsed.intake.hotfixLabels)
  }

  if (isObject(parsed.release)) {
    mergeReleaseStages(base.release, parsed.release)
    mergeReleaseIgnorePaths(base.release, parsed.release)
  }

  if (isObject(parsed.branch)) {
    assign(base.branch, parsed.branch, 'pattern', 'string')
  }

  if (isObject(parsed.auth)) {
    assign(base.auth, parsed.auth, 'tokenEnv', 'string')
  }

  if (isObject(parsed.apply)) {
    assign(base.apply, parsed.apply, 'transport', 'string?')
    if (base.apply.transport && !TRANSPORTS.includes(base.apply.transport)) {
      throw invalid('apply.transport', base.apply.transport, `one of ${TRANSPORTS.join('|')}`)
    }
  }

  if (isObject(parsed.sync)) {
    assign(base.sync, parsed.sync, 'baseDir', 'string')
    assign(base.sync, parsed.sync, 'backupDir', 'string')
    mergeFieldOwnership(base.sync.fieldOwnership, parsed.sync.fieldOwnership)
    if (Array.isArray(parsed.sync.localOnlySections)) {
      base.sync.localOnlySections = stringList(parsed.sync.localOnlySections)
    }
    mergeKeyedFields(base.sync.keyedFields, parsed.sync.keyedFields)
  }

  return base
}

/**
 * The issue's own state for a board Status name: `'completed'` /
 * `'not_planned'` for the names the terminal buckets map to, `null` (stays or
 * becomes open) for every other name.
 *
 * Keyed through `states`, so a project that renames "Done" to "Shipped" closes
 * on "Shipped". WHAT WOULD FOOL IT: two buckets mapped to the SAME option name
 * — `complete` and `cancelled` both "Done" — are indistinguishable from the
 * name alone, so the first terminal bucket in `CLOSE_REASONS` order wins and
 * a cancelled spec closes as `completed`. Callers that know the bucket pass it
 * instead (`closeReasonForBucket`), which has no such ambiguity.
 */
function closeReasonFor(config, stateName) {
  const want = String(stateName || '').toLowerCase().trim()
  if (!want) return null
  for (const [bucket, reason] of Object.entries(CLOSE_REASONS)) {
    const name = config && config.states && config.states[bucket]
    if (name && String(name).toLowerCase().trim() === want) return reason
  }
  return null
}

const closeReasonForBucket = (bucket) => CLOSE_REASONS[bucket] || null

/**
 * What marks an issue as a spec or a phase on create: its label (always, when
 * one is configured) and its issue type (only when one is configured — issue
 * types exist on org-owned repos alone, and naming one on a personal repo is a
 * 422). `kind` is `'spec'` or `'phase'`.
 */
function markersFor(config, kind) {
  const g = (config && config.github) || {}
  const label = g.labels && typeof g.labels[kind] === 'string' ? g.labels[kind].trim() : ''
  const type = g.issueTypes && typeof g.issueTypes[kind] === 'string' ? g.issueTypes[kind].trim() : ''
  return { labels: label ? [label] : [], type: type || null }
}

// Attach the parts of the provider contract that are code, not JSON: the GFM
// dialect, and the `provider` block retarget reads. GitHub refs carry no team
// key — `#123` — so `teamKey` is empty and the kit's foreign-key partition
// never fires; a cross-repo ref is excluded by the ref pattern instead
// (provider-kit `GITHUB_REF_RE`). Runs on BOTH loader paths so an absent
// config still carries them.
function withRuntime(config) {
  config.dialect = dialect
  config.provider = {
    teamKey: '',
    configFile: CONFIG_FILE,
    teamKeyJsonField: 'repo',
  }
  // How sync-core reads a REMOTE issue handed to it raw. The workflow state is
  // the BOARD's Status value, not the issue's open/closed — reading `state`
  // off a REST issue would report "open"/"closed" and every drift check would
  // compare that against "In Progress". The adapter's normalised shape carries
  // `state: { name }` already; the raw GraphQL shape carries it under
  // `projectItems`. Anything else is a cannot-tell (undefined).
  config.remote = {
    stateName(issue) {
      if (!issue || typeof issue !== 'object') return null
      if (issue.state && typeof issue.state === 'object') return issue.state.name != null ? issue.state.name : null
      const items = issue.projectItems && issue.projectItems.nodes
      if (Array.isArray(items)) {
        const want = config.github && config.github.project
        const item = items.find((n) => n && n.project && n.project.number === want)
        const v = item && item.fieldValueByName
        return v && v.name != null ? v.name : null
      }
      return undefined
    },
    description(issue) {
      if (!issue || typeof issue !== 'object') return undefined
      if (typeof issue.description === 'string') return issue.description
      // `body: null` IS an answer: GitHub returns it for an issue whose body
      // was cleared, which is an edit, not a cannot-tell.
      if ('body' in issue) return issue.body == null ? '' : String(issue.body)
      return undefined
    },
  }
  return config
}

function loadGithubConfig(dir = process.cwd()) {
  const base = defaults()
  const file = join(dir, CONFIG_FILE)

  let raw
  try {
    raw = readFileSync(file, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return { config: withRuntime(base), present: false }
    throw error
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid ${CONFIG_FILE}: ${error.message}`)
  }

  return { config: withRuntime(mergeConfig(base, parsed)), present: true }
}

// The declared deployment ladder (possibly empty) and its rungs — same
// accessors the other providers expose, reading this provider's config.
const releaseStages = (config) => (config.release && config.release.stages) || []
const stageFor = (config, key) => releaseStages(config).find((s) => s.key === key) || null
const releaseIgnorePaths = (config) => (config.release && config.release.ignorePaths) || []

module.exports = {
  loadGithubConfig,
  mergeConfig,
  defaults,
  withRuntime,
  closeReasonFor,
  closeReasonForBucket,
  markersFor,
  releaseStages,
  stageFor,
  releaseIgnorePaths,
  DEFAULT_CONFIG,
  CONFIG_FILE,
  CLOSE_REASONS,
  OWNERSHIP,
  TASK_MAPPINGS,
  PHASE_MAPPINGS,
  LIFECYCLE_BUCKETS,
  TRANSPORTS,
  DEFAULT_TOKEN_ENV,
  FALLBACK_TOKEN_ENV,
  ENV_CONFIG_DEFAULTS,
  IDENTIFIER_FIELD,
}
