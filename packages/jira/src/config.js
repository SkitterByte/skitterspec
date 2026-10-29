'use strict'

/**
 * `specs/.core/jira.config.json` — the committed, shareable half of this
 * provider's setup. It holds ids, names and env-var NAMES; never a credential
 * (those live in the user-level store — `credentials.js`).
 *
 * The merge/validation machinery is the kit's (`provider-kit/src/config.js`);
 * this module owns what is Jira's: the defaults, the file name, and the
 * vocabularies.
 */

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const kitConfig = require('@skitterbyte/skitterspec-provider-kit/src/config.js')
const { dialect } = require('./dialect.js')
const { adfToText } = require('./adf.js')

const CONFIG_FILE = 'specs/.core/jira.config.json'

const OWNERSHIP = Object.freeze(['both', 'pull', 'push', 'none'])
const TASK_MAPPINGS = Object.freeze(['checklist', 'none'])
const PHASE_MAPPINGS = Object.freeze(['subissue', 'deferred', 'inline'])
const TRANSPORTS = Object.freeze(['api', 'mcp'])
const DEFAULT_EMAIL_ENV = 'JIRA_EMAIL'
const DEFAULT_TOKEN_ENV = 'JIRA_API_TOKEN'
const DEFAULT_PHASE_MODE = 'subissue'

const DEFAULT_CONFIG = Object.freeze({
  // `siteUrl` is the Jira Cloud site (https://<site>.atlassian.net); it also
  // keys the credentials-store entry, so one store serves every checkout.
  // `projectKey` is where spec issues land — Jira's project is the analogue of
  // Linear's team, so there is no separate project picker: placement is decided
  // here, once. `issueType`/`subtaskType` name the types this site uses for a
  // spec and its phases; workflows and type names vary per site, which is why
  // both are config rather than constants.
  jira: Object.freeze({ siteUrl: '', projectKey: '', issueType: 'Task', subtaskType: 'Subtask' }),
  // A spec is a Jira ISSUE; each phase a SUBTASK of it. `tasks` selects how the
  // phase's checkboxes reach that subtask's description (as an ADF task list —
  // live checkboxes, still a read-only mirror).
  mapping: Object.freeze({ specFolder: 'issue', phases: DEFAULT_PHASE_MODE, tasks: 'checklist' }),
  // Jira STATUS names — the spec issue's status (from the folder bucket) and
  // each subtask's status (from the phase emoji) both map through this table.
  // They must match the project's workflow statuses exactly; `validateStates`
  // checks them at push/status time. `cancelled` defaults to Done because the
  // default Jira workflows carry no Cancelled status — a site that has one
  // overrides this.
  states: Object.freeze({
    backlog: 'To Do',
    'in-progress': 'In Progress',
    complete: 'Done',
    cancelled: 'Done',
  }),
  snapshot: Object.freeze({ overviewFile: '00-overview.md' }),
  // The frontmatter FIELD VOCABULARY this provider stamps into spec files
  // (sync-core `src/fields.js`). No legacy keys: this provider has no pre-9.0
  // era, so legacy-mirror detection reports nothing by construction.
  fields: Object.freeze({
    identifier: 'jira_identifier',
    url: 'jira_url',
    issueId: 'jira_issue_id',
    assigneeId: 'jira_assignee_id',
    assigneeName: 'jira_assignee_name',
  }),
  release: Object.freeze({ ignorePaths: Object.freeze(['specs/', 'CHANGELOG.md', 'RELEASES.md']) }),
  branch: Object.freeze({ pattern: '{type}/{slug}' }),
  // Env-var NAMES, not values: Jira Cloud authenticates with an email + API
  // token pair (basic auth), so there are two of them.
  auth: Object.freeze({ emailEnv: DEFAULT_EMAIL_ENV, tokenEnv: DEFAULT_TOKEN_ENV }),
  apply: Object.freeze({ transport: '' }),
  sync: Object.freeze({
    baseDir: 'specs/.core/jira-base',
    backupDir: 'specs/.core/jira-backups',
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
  return {
    jira: { ...DEFAULT_CONFIG.jira },
    mapping: { ...DEFAULT_CONFIG.mapping },
    states: { ...DEFAULT_CONFIG.states },
    stateAliases: {},
    snapshot: { ...DEFAULT_CONFIG.snapshot },
    fields: { ...DEFAULT_CONFIG.fields },
    release: {
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
const { mergeStates, mergeFieldOwnership, mergePhaseMapping, mergeReleaseIgnorePaths, mergeKeyedFields } =
  kitConfig.makeMergeHelpers({
    configFile: CONFIG_FILE,
    ownership: OWNERSHIP,
    lifecycleBuckets: LIFECYCLE_BUCKETS,
    phaseMappings: PHASE_MAPPINGS,
  })

/**
 * Merge a parsed config over the defaults. Only known keys are copied (unknown
 * keys ignored for forward-compat). Nested objects are merged field-by-field.
 */
function mergeConfig(base, parsed) {
  if (!isObject(parsed)) return base

  if (isObject(parsed.jira)) {
    assign(base.jira, parsed.jira, 'siteUrl', 'string?')
    assign(base.jira, parsed.jira, 'projectKey', 'string?')
    assign(base.jira, parsed.jira, 'issueType', 'string')
    assign(base.jira, parsed.jira, 'subtaskType', 'string')
    // A trailing slash on the site would double up in every composed URL.
    if (base.jira.siteUrl) base.jira.siteUrl = base.jira.siteUrl.replace(/\/+$/, '')
  }

  if (isObject(parsed.mapping)) {
    assign(base.mapping, parsed.mapping, 'specFolder', 'string')
    assign(base.mapping, parsed.mapping, 'tasks', 'string')
    if (!TASK_MAPPINGS.includes(base.mapping.tasks)) {
      throw new Error(
        `Invalid ${CONFIG_FILE}: mapping.tasks = ${JSON.stringify(base.mapping.tasks)} ` +
          `(expected one of ${TASK_MAPPINGS.join('|')})`,
      )
    }
    mergePhaseMapping(base.mapping, parsed.mapping)
  }

  mergeStates(base, parsed)

  if (isObject(parsed.snapshot)) {
    assign(base.snapshot, parsed.snapshot, 'overviewFile', 'string')
  }

  if (isObject(parsed.release)) {
    mergeReleaseIgnorePaths(base.release, parsed.release)
  }

  if (isObject(parsed.branch)) {
    assign(base.branch, parsed.branch, 'pattern', 'string')
  }

  if (isObject(parsed.auth)) {
    assign(base.auth, parsed.auth, 'emailEnv', 'string')
    assign(base.auth, parsed.auth, 'tokenEnv', 'string')
  }

  if (isObject(parsed.apply)) {
    assign(base.apply, parsed.apply, 'transport', 'string?')
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
    if (Array.isArray(parsed.sync.localOnlySections)) {
      base.sync.localOnlySections = stringList(parsed.sync.localOnlySections)
    }
    mergeKeyedFields(base.sync.keyedFields, parsed.sync.keyedFields)
  }

  return base
}

// Attach the parts of the provider contract that are code, not JSON: the ADF
// dialect, and the `provider` block retarget reads (Jira's project key is the
// identifier prefix, the analogue of Linear's team key). Runs on BOTH loader
// paths so an absent config still carries them.
function withRuntime(config) {
  config.dialect = dialect
  config.provider = {
    teamKey: (config.jira && config.jira.projectKey) || '',
    configFile: CONFIG_FILE,
    teamKeyJsonField: 'projectKey',
  }
  // How sync-core reads a REMOTE issue this provider hands it. `--remote` is
  // documented as "fetch the issue JSON", which is the raw REST shape —
  // everything under `fields`, the description as ADF — where the default
  // readers expect the flat Linear-like shape. Without these hooks every
  // drift check routes to its silent cannot-tell branch, so `status
  // --remote` can never report anything. Each hook falls back to the flat
  // shape, so a pre-reduced payload keeps working.
  config.remote = {
    stateName(issue) {
      const st = issue && issue.fields && issue.fields.status
      if (st && typeof st === 'object' && st.name != null) return st.name
      const flat = issue && (issue.state != null ? issue.state : issue.status)
      if (flat == null) return null
      if (typeof flat === 'object') return flat.name != null ? flat.name : flat.type != null ? flat.type : null
      return flat
    },
    description(issue) {
      const fields = issue && issue.fields
      if (fields && typeof fields === 'object' && 'description' in fields) {
        // null IS an answer on this branch: Jira returns it when the field
        // was fetched and the description is genuinely empty — clearing a
        // description on Jira is an edit, not a cannot-tell.
        const d = fields.description
        return d == null ? '' : typeof d === 'string' ? d : adfToText(d)
      }
      return issue && typeof issue.description === 'string' ? issue.description : undefined
    },
  }
  return config
}

function loadJiraConfig(dir = process.cwd()) {
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

// The bookkeeping path prefixes `released` ignores.
const releaseIgnorePaths = (config) => (config.release && config.release.ignorePaths) || []

module.exports = {
  loadJiraConfig,
  mergeConfig,
  defaults,
  releaseIgnorePaths,
  DEFAULT_CONFIG,
  CONFIG_FILE,
  OWNERSHIP,
  TASK_MAPPINGS,
  PHASE_MAPPINGS,
  LIFECYCLE_BUCKETS,
  TRANSPORTS,
  DEFAULT_EMAIL_ENV,
  DEFAULT_TOKEN_ENV,
  ENV_CONFIG_DEFAULTS,
  IDENTIFIER_FIELD,
}
