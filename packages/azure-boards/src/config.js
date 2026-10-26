'use strict'

/**
 * `specs/.core/azure-boards.config.json` — the committed, shareable half of
 * this provider's setup. It holds ids, names and env-var NAMES; never a
 * credential (those live in the user-level store — `credentials.js`).
 *
 * The merge/validation machinery is the kit's (`provider-kit/src/config.js`);
 * this module owns what is Azure's: the defaults, the file name, and the
 * vocabularies. Work item types and states are PROCESS-DEFINED (Basic:
 * Issue/Task; Agile: User Story/Task; custom anything), which is why both are
 * config rather than constants — the adapter validates the names against the
 * project's own process at run time.
 */

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const kitConfig = require('@skitterbyte/skitterspec-provider-kit/src/config.js')
const { dialect, htmlToText, looksLikeHtml } = require('./dialect.js')

const CONFIG_FILE = 'specs/.core/azure-boards.config.json'

const OWNERSHIP = Object.freeze(['both', 'pull', 'push', 'none'])
const TASK_MAPPINGS = Object.freeze(['checklist', 'none'])
const PHASE_MAPPINGS = Object.freeze(['subissue', 'deferred', 'inline'])
const TRANSPORTS = Object.freeze(['api', 'mcp'])
const DEFAULT_TOKEN_ENV = 'AZURE_DEVOPS_EXT_PAT'
const DEFAULT_PHASE_MODE = 'subissue'

const DEFAULT_CONFIG = Object.freeze({
  // `orgUrl` is the organization (https://dev.azure.com/<org>); it also keys
  // the credentials-store entry, so one store serves every checkout.
  // `project` is where spec work items land. `workItemType`/`childType` name
  // the types this project's process uses for a spec and its phases; the
  // defaults are the Basic template's, and any process overrides them here.
  // `areaPath` is optional — empty means the project default.
  azure: Object.freeze({
    orgUrl: '',
    project: '',
    workItemType: 'Issue',
    childType: 'Task',
    areaPath: '',
    // The mint type per SPEC KIND (`feature`/`bug`/`hotfix`, from the spec
    // folder's prefix), falling back to `workItemType`. In Agile, Scrum and
    // CMMI a bug is a work item TYPE, so `/spec-bug` minting a User Story
    // files it in the wrong backlog; `{ "bug": "Bug", "hotfix": "Bug" }` is
    // the usual shape there. Empty means one type for everything, as before.
    workItemTypeByKind: Object.freeze({}),
  }),
  // A spec is a WORK ITEM; each phase a CHILD work item under a hierarchy
  // link. `tasks` selects how the phase's checkboxes reach that child's
  // description (markdown checkboxes render natively — still a read-only
  // mirror).
  mapping: Object.freeze({ specFolder: 'issue', phases: DEFAULT_PHASE_MODE, tasks: 'checklist' }),
  // Boards STATE names — the spec item's state (from the folder bucket) and
  // each child's state (from the phase emoji) both map through this table.
  // They must match the process's states exactly; the adapter validates at
  // push/status time and an unknown name is a named refusal listing what the
  // type actually has. `cancelled` defaults to Done because the Basic process
  // carries no Cancelled state — a process that has one overrides this.
  states: Object.freeze({
    backlog: 'To Do',
    'in-progress': 'Doing',
    complete: 'Done',
    cancelled: 'Done',
  }),
  // Intake routes an adopted work item by its work item TYPE and its TAGS
  // (Boards has tags, not labels): `tag` is the inbox filter, the type and tag
  // lists route to /spec-bug and /spec-hotfix, and hotfix wins over bug.
  // `bugTypes` defaults to Agile/Scrum/CMMI's literal `Bug` type because there
  // a bug IS a type — an explicit empty list opts type routing out. Empty tag
  // lists route nothing, as before.
  intake: Object.freeze({
    tag: '',
    bugTags: Object.freeze(['bug']),
    hotfixTags: Object.freeze([]),
    bugTypes: Object.freeze(['Bug']),
    hotfixTypes: Object.freeze([]),
  }),
  snapshot: Object.freeze({ overviewFile: '00-overview.md' }),
  // The frontmatter FIELD VOCABULARY this provider stamps into spec files
  // (sync-core `src/fields.js`). No legacy keys: this provider has no pre-9.0
  // era, so legacy-mirror detection reports nothing by construction.
  fields: Object.freeze({
    identifier: 'azure_identifier',
    url: 'azure_url',
    issueId: 'azure_item_id',
    assigneeId: 'azure_assignee_id',
    assigneeName: 'azure_assignee_name',
  }),
  // `refs.foreignPatterns` names ref shapes that are KNOWN HISTORY rather than
  // unreferenced commits — an ereqs repo migrating off Linear lists its old
  // team key here (e.g. "ERQ-\\d+") so `released` classifies rather than
  // accuses.
  refs: Object.freeze({ foreignPatterns: Object.freeze([]) }),
  release: Object.freeze({
    stages: Object.freeze([]),
    ignorePaths: Object.freeze(['specs/', 'CHANGELOG.md', 'RELEASES.md']),
  }),
  // The release seam's Azure carrier (spec Decision 12): one work item of
  // `workItemType` per release, found by WIQL title lookup, its state moved
  // through `series[].envs`. Phase 5 implements the verbs; the config shape
  // lives here so setup writes one file.
  releases: Object.freeze({ workItemType: 'Release', series: Object.freeze([]) }),
  branch: Object.freeze({ pattern: '{type}/{slug}' }),
  // An env-var NAME, not a value — the official CLI's, so a machine already
  // set up for `az boards` needs nothing new.
  auth: Object.freeze({ tokenEnv: DEFAULT_TOKEN_ENV }),
  apply: Object.freeze({ transport: '' }),
  sync: Object.freeze({
    baseDir: 'specs/.core/azure-base',
    backupDir: 'specs/.core/azure-backups',
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
    azure: { ...DEFAULT_CONFIG.azure },
    mapping: { ...DEFAULT_CONFIG.mapping },
    states: { ...DEFAULT_CONFIG.states },
    intake: {
      tag: DEFAULT_CONFIG.intake.tag,
      bugTags: [...DEFAULT_CONFIG.intake.bugTags],
      hotfixTags: [...DEFAULT_CONFIG.intake.hotfixTags],
      bugTypes: [...DEFAULT_CONFIG.intake.bugTypes],
      hotfixTypes: [...DEFAULT_CONFIG.intake.hotfixTypes],
    },
    snapshot: { ...DEFAULT_CONFIG.snapshot },
    fields: { ...DEFAULT_CONFIG.fields },
    refs: { foreignPatterns: [...DEFAULT_CONFIG.refs.foreignPatterns] },
    release: {
      stages: DEFAULT_CONFIG.release.stages.map((s) => ({ ...s })),
      ignorePaths: [...DEFAULT_CONFIG.release.ignorePaths],
    },
    releases: {
      workItemType: DEFAULT_CONFIG.releases.workItemType,
      series: DEFAULT_CONFIG.releases.series.map((s) => ({ ...s })),
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
const { mergeFieldOwnership, mergePhaseMapping, mergeReleaseStages, mergeReleaseIgnorePaths, mergeKeyedFields } =
  kitConfig.makeMergeHelpers({
    configFile: CONFIG_FILE,
    ownership: OWNERSHIP,
    lifecycleBuckets: LIFECYCLE_BUCKETS,
    phaseMappings: PHASE_MAPPINGS,
  })

// A release series entry carries the tag prefix it scans and the state each
// env moves the release item to. Lenient on extras, strict on shape: a series
// that is not a list of objects is a config error worth naming now.
function mergeReleaseSeries(base, parsed) {
  if (parsed.series === undefined) return
  if (!Array.isArray(parsed.series) || parsed.series.some((s) => !isObject(s))) {
    throw new Error(`Invalid ${CONFIG_FILE}: releases.series must be a list of objects`)
  }
  base.series = parsed.series.map((s) => ({
    tagPrefix: typeof s.tagPrefix === 'string' ? s.tagPrefix : '',
    envs: isObject(s.envs)
      ? Object.fromEntries(Object.entries(s.envs).filter(([, v]) => typeof v === 'string'))
      : {},
  }))
}

/**
 * Merge a parsed config over the defaults. Only known keys are copied (unknown
 * keys ignored for forward-compat). Nested objects are merged field-by-field.
 */
function mergeConfig(base, parsed) {
  if (!isObject(parsed)) return base

  if (isObject(parsed.azure)) {
    assign(base.azure, parsed.azure, 'orgUrl', 'string?')
    assign(base.azure, parsed.azure, 'project', 'string?')
    assign(base.azure, parsed.azure, 'workItemType', 'string')
    assign(base.azure, parsed.azure, 'childType', 'string')
    assign(base.azure, parsed.azure, 'areaPath', 'string?')
    if (isObject(parsed.azure.workItemTypeByKind)) {
      // Only the kinds a spec folder can actually be — an unknown key is
      // dropped rather than carried into `states` validation it can never pass.
      const byKind = {}
      for (const kind of ['feature', 'bug', 'hotfix']) {
        const value = parsed.azure.workItemTypeByKind[kind]
        if (typeof value === 'string' && value.trim()) byKind[kind] = value.trim()
      }
      base.azure.workItemTypeByKind = byKind
    }
    // A trailing slash on the org would double up in every composed URL.
    if (base.azure.orgUrl) base.azure.orgUrl = base.azure.orgUrl.replace(/\/+$/, '')
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

  if (isObject(parsed.states)) {
    for (const key of Object.keys(base.states)) {
      assign(base.states, parsed.states, key, 'string')
    }
  }

  if (isObject(parsed.intake)) {
    assign(base.intake, parsed.intake, 'tag', 'string?')
    if (Array.isArray(parsed.intake.bugTags)) base.intake.bugTags = stringList(parsed.intake.bugTags)
    if (Array.isArray(parsed.intake.hotfixTags)) base.intake.hotfixTags = stringList(parsed.intake.hotfixTags)
    if (Array.isArray(parsed.intake.bugTypes)) base.intake.bugTypes = stringList(parsed.intake.bugTypes)
    if (Array.isArray(parsed.intake.hotfixTypes)) base.intake.hotfixTypes = stringList(parsed.intake.hotfixTypes)
  }

  if (isObject(parsed.snapshot)) {
    assign(base.snapshot, parsed.snapshot, 'overviewFile', 'string')
  }

  if (isObject(parsed.refs)) {
    if (Array.isArray(parsed.refs.foreignPatterns)) {
      base.refs.foreignPatterns = stringList(parsed.refs.foreignPatterns)
    }
  }

  if (isObject(parsed.release)) {
    mergeReleaseStages(base.release, parsed.release)
    mergeReleaseIgnorePaths(base.release, parsed.release)
  }

  if (isObject(parsed.releases)) {
    assign(base.releases, parsed.releases, 'workItemType', 'string')
    mergeReleaseSeries(base.releases, parsed.releases)
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

// Attach the parts of the provider contract that are code, not JSON: the
// markdown dialect, and the `provider` block. Azure identifiers all share the
// constant `AB` prefix (`AB#123`), so unlike Jira's project key there is
// nothing configurable to read it from — retarget is deferred for this
// provider, and the prefix is stated rather than looked up. Runs on BOTH
// loader paths so an absent config still carries them.
function withRuntime(config) {
  config.dialect = dialect
  config.provider = {
    teamKey: 'AB',
    configFile: CONFIG_FILE,
    teamKeyJsonField: '',
  }
  // How sync-core reads a REMOTE work item this provider hands it. `--remote`
  // fetches the raw REST shape — everything under `fields`, the description
  // as markdown or HTML depending on the item's era. Each hook falls back to
  // the flat Linear-like shape, so a pre-reduced payload keeps working.
  config.remote = {
    stateName(item) {
      const st = item && item.fields && item.fields['System.State']
      if (st != null) return typeof st === 'object' ? (st.name != null ? st.name : null) : st
      const flat = item && (item.state != null ? item.state : item.status)
      if (flat == null) return null
      if (typeof flat === 'object') return flat.name != null ? flat.name : flat.type != null ? flat.type : null
      return flat
    },
    description(item) {
      const fields = item && item.fields
      if (fields && typeof fields === 'object' && 'System.Description' in fields) {
        // null IS an answer on this branch: the field was fetched and the
        // description is genuinely empty — clearing one is an edit, not a
        // cannot-tell.
        const d = fields['System.Description']
        if (d == null) return ''
        const text = String(d)
        const fmt = item.multilineFieldsFormat && item.multilineFieldsFormat['System.Description']
        if (fmt && String(fmt).toLowerCase() === 'markdown') return text
        return looksLikeHtml(text) ? htmlToText(text) : text
      }
      return item && typeof item.description === 'string' ? item.description : undefined
    },
  }
  return config
}

function loadAzureConfig(dir = process.cwd()) {
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
  loadAzureConfig,
  mergeConfig,
  defaults,
  releaseStages,
  stageFor,
  releaseIgnorePaths,
  DEFAULT_CONFIG,
  CONFIG_FILE,
  OWNERSHIP,
  TASK_MAPPINGS,
  PHASE_MAPPINGS,
  LIFECYCLE_BUCKETS,
  TRANSPORTS,
  DEFAULT_TOKEN_ENV,
  ENV_CONFIG_DEFAULTS,
  IDENTIFIER_FIELD,
}
