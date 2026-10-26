'use strict'

/**
 * `skitterspec-azure-boards spec-sync <sub>` — the Azure Boards provider's
 * engine CLI.
 *
 * Built on the provider kit: spec resolution, transport precedence, the flag
 * parser with its unknown-flag refusal, the credentials prompts and the apply
 * orchestration are all shared machinery; what this file owns is Azure's — the
 * direct state writes, the WIQL, the config file it names in refusals, and
 * which operations the MCP transport cannot express.
 *
 * Exit-code semantics mirror the other providers' table: `ref` prints the bare
 * identifier on stdout ONLY on success (so `$(spec-sync ref)` cannot splice an
 * error into a commit body); `verify` warns and never fails on losses;
 * `preserve` exits 0 on every cannot-tell; dry-runs are the default wherever a
 * write exists; an unknown `--flag` refuses before anything runs.
 *
 * `released` is DELIBERATELY not shipped yet: the kit's trailer scan hardcodes
 * the `KEY-N` identifier shape, and `AB#123` needs the provider-supplied ref
 * pattern `feat-github-provider` phase 1 builds. Scanning with the wrong
 * pattern would count every azure ref as unreferenced — an accusation against
 * a healthy repo — so the subcommand refuses and names the dependency instead
 * (spec Decision 2: never hoist that seam from here).
 */

const fs = require('node:fs')
const path = require('node:path')

const {
  push,
  recordPush,
  readBase,
  isEmptyPlan,
  validateStates,
  stateSuggestions,
  remoteWorkflowState,
  remoteDescriptionEdited,
  writeFrontmatter,
  stampSubIssueId,
  listPhaseFiles,
  normalizeLocal,
} = require('@skitterbyte/skitterspec-sync-core')
const kit = require('@skitterbyte/skitterspec-provider-kit')
const { BUCKETS, findSpecFolder, currentBranch } = require('@skitterbyte/skitterspec-common/src/env/resolve.js')

const { makeAssignmentCommands } = require('@skitterbyte/skitterspec-provider-kit/src/assignment.js')
const { makeReleaseCommands } = require('@skitterbyte/skitterspec-provider-kit/src/releases.js')
const { IDENTIFIER_RE } = require('@skitterbyte/skitterspec-provider-kit/src/released.js')

const { loadAzureConfig, mergeConfig, defaults, CONFIG_FILE, LIFECYCLE_BUCKETS } = require('./config.js')
const {
  resolveCredential,
  writeCredential,
  removeCredential,
  storePath,
  storeMode,
  fingerprint,
  writeUser,
  removeUser,
  orgOf,
} = require('./credentials.js')
const { resolveIdentity, displayNameOf } = require('./identity.js')
const { makeApiAdapter } = require('./api.js')

const BIN = 'skitterspec-azure-boards'

const PROGRAM = 'spec-sync'
const specHelpers = kit.makeSpecHelpers({ program: PROGRAM })
const { resolveSnapshotDir, specIdentifier, listSpecs, resolveOrExit, warnToErr, verifyLines } = specHelpers

// A work item identifier: the constant AB prefix and a number. A bare number
// is accepted on input and normalised, so a stamp can be copied from the
// browser URL (which shows only the number).
const ID_RE = /^AB#\d+$/
const BARE_ID_RE = /^\d+$/

// The ref shape a `Refs:` trailer carries for this provider — the pattern the
// kit's trailer scan takes (the AB#n wiring phase 3 refused without). `\b`
// before the A keeps "LAB#1" from reading as a ref.
const AZURE_REF_RE = /\bAB#\d+\b/g

// `refs.foreignPatterns` compiled, with the kit's `KEY-N` shape always
// included: a repo migrating off Linear or Jira has those trailers all through
// its history, and they are referenced — just not to this tracker. A pattern
// that does not compile is a config error named up front, never silently
// dropped (dropping one would re-count its history as unreferenced).
function foreignPatternsOf(config) {
  const patterns = [IDENTIFIER_RE]
  const bad = []
  for (const raw of (config.refs && config.refs.foreignPatterns) || []) {
    try {
      patterns.push(new RegExp(raw, 'g'))
    } catch {
      bad.push(raw)
    }
  }
  return { patterns, bad }
}

// What the API adapter actually takes: the numeric id behind an identifier.
const apiId = (idOrIdentifier) => String(idOrIdentifier).replace(/^AB#/, '')
const asIdentifier = (value) => (BARE_ID_RE.test(String(value)) ? `AB#${value}` : String(value))

// ---------------------------------------------------------------------------
// The state gate. Azure refuses an unknown STATE at write time — after the
// description write has already landed — so a half-typed `states` table would
// mirror the prose and strand the state move. Same discipline as the other
// providers: validate against the project's real states first.
function stateCheckFailure(config, flags) {
  if (flags.skipStateCheck) return null
  if (!flags.workspaceStates) {
    return [
      `${PROGRAM} plan: refusing — the configured work item states have not been validated`,
      "  pass --workspace-states <file> (a JSON array of the types' state",
      '  names — `spec-sync states --json` prints exactly that), or',
      '  --skip-state-check to push anyway.',
      '  Azure refuses an unknown state only at write time, after the',
      '  description write has landed: the push would half-apply.',
    ]
  }
  if (!fs.existsSync(flags.workspaceStates)) {
    return [`${PROGRAM} plan: refusing — no such --workspace-states file: ${flags.workspaceStates}`]
  }
  let names
  try {
    names = JSON.parse(fs.readFileSync(flags.workspaceStates, 'utf-8'))
  } catch (error) {
    return [`${PROGRAM} plan: refusing — --workspace-states is not valid JSON: ${error.message}`]
  }
  const list = Array.isArray(names) ? names : []
  const missing = validateStates(config, list)
  if (missing.length) {
    const lines = [`${PROGRAM} plan: refusing — configured state name(s) not in the project`, '']
    for (const { label, configured, suggestion } of stateSuggestions(config, list)) {
      lines.push(`  ${label}: "${configured}" is not a state these types have`)
      if (suggestion) lines.push(`    use "${suggestion}" instead`)
    }
    lines.push('', `  available: ${list.join(', ') || '(the project reported none)'}`, `  Fix ${CONFIG_FILE} -> states.`)
    return lines
  }
  return null
}

// ---------------------------------------------------------------------------
// Apply ops: the kit orchestration with Azure's tracker calls. State is moved
// by a direct `System.State` write after the create/update, and `transitionTo`
// is idempotent when the item already sits on the target.
// A spec's KIND, read off its folder prefix — the same convention the
// lifecycle skills stamp into `> **Type:**`, but greppable with no file read.
function specKindOf(snapshotDir) {
  const name = path.basename(String(snapshotDir || ''))
  if (name.startsWith('bug-')) return 'bug'
  if (name.startsWith('hotfix-')) return 'hotfix'
  return 'feature'
}

function applyOps({ adapter, config, out, kind = 'feature' }) {
  // The mint type for THIS spec's kind (its folder prefix), falling back to
  // the one configured type. The twin search uses the same type, so a bug
  // never refuses over a feature that happens to share its title.
  const mintType =
    (config.azure.workItemTypeByKind && config.azure.workItemTypeByKind[kind]) || config.azure.workItemType
  const stateFor = (bucket) => {
    const name = config.states && config.states[bucket]
    if (!name) {
      throw new Error(`no state configured for the "${bucket}" bucket — fix ${CONFIG_FILE} -> states`)
    }
    return name
  }
  const settle = async (idOrIdentifier, bucket) => {
    if (!bucket) return
    await adapter.transitionTo(apiId(idOrIdentifier), stateFor(bucket))
  }
  // Azure refuses the WHOLE patch over one bad `System.AssignedTo` value
  // ("… is an unknown identity", live repro), which used to take the
  // description and state down with it. A refused assignee is a cosmetic gap
  // `/spec-claim` closes later; the rest of the push is not — so retry the
  // same write once without the assignee and say so. Only that exact refusal
  // is retried: any other error still fails the apply.
  const skippingRefusedAssignee = async (input, send) => {
    const assignee = 'assigneeId' in input ? input.assigneeId : undefined
    try {
      return await send(input)
    } catch (error) {
      if (assignee === undefined || !/unknown identity/i.test(String(error && error.message))) throw error
      const { assigneeId, ...rest } = input
      const result = await send(rest)
      if (out) out.write(`  !! assignee skipped: Azure refused '${assignee}' for Assigned To — the rest of the push landed\n`)
      return result
    }
  }
  return {
    prevalidateStates: (buckets) => {
      for (const bucket of buckets) stateFor(bucket)
    },
    searchTwin: (title) => adapter.searchIssues({ query: title, workItemType: mintType }),
    twinAdvice: (twin, wanted, specName) =>
      `${twin.identifier} is already titled "${wanted}" and no spec claims it — ` +
      `stamp it onto the spec with \`spec-sync stamp ${specName} --issue ${twin.identifier}\`, ` +
      'or pass --force-new to create a second',
    missingIssueMessage: (identifier) => `no Azure work item found for ${identifier}`,
    remoteEditedLine: (identifier) =>
      `  !! ${identifier}'s description was edited on Azure Boards since the last push — this replaces it`,
    mintIssue: async ({ title, issue }) => {
      const created = await skippingRefusedAssignee(
        {
          title,
          description: issue && issue.description != null ? issue.description : undefined,
          assigneeId: issue && issue.assignee ? issue.assignee : undefined,
          workItemType: mintType,
          areaPath: config.azure.areaPath || undefined,
        },
        (input) => adapter.createIssue(input),
      )
      await settle(created.id, issue && issue.state)
      return created
    },
    updateIssue: async (existing, issue) => {
      const updates = {}
      if (issue.description !== undefined) updates.description = issue.description
      // Null is meaningful here — it is how Boards unassigns — so the key is
      // forwarded whenever the plan carries it, never truthiness-tested.
      if ('assignee' in issue) updates.assigneeId = issue.assignee ?? null
      if (Object.keys(updates).length) {
        await skippingRefusedAssignee(updates, (input) => adapter.updateIssue(apiId(existing.identifier), input))
      }
      await settle(existing.identifier, issue.state)
    },
    mintSubIssue: async (parentId, sub) => {
      const created = await adapter.createSubIssue(apiId(parentId), {
        title: sub.name,
        description: sub.goal != null ? sub.goal : undefined,
        childType: config.azure.childType,
        areaPath: config.azure.areaPath || undefined,
      })
      await settle(created.id, sub.state)
      return created
    },
    updateSubIssue: async (sub) => {
      const updates = {}
      if (sub.name != null) updates.title = sub.name
      if (sub.goal != null) updates.description = sub.goal
      if (Object.keys(updates).length) await adapter.updateIssue(apiId(sub.id), updates)
      await settle(sub.id, sub.state)
    },
  }
}

function apiAdapterFor(config, flags) {
  if (flags.adapter) return { ok: true, adapter: flags.adapter }
  const cred = resolveCredential(config, flags.env || process.env)
  if (!cred.ok) return { ok: false, error: cred.error }
  return {
    ok: true,
    adapter: makeApiAdapter({
      orgUrl: config.azure.orgUrl,
      project: config.azure.project,
      token: cred.token,
      releaseType: (config.releases && config.releases.workItemType) || 'Release',
      fetch: flags.fetch,
    }),
  }
}

// ---------------------------------------------------------------------------
// `released [<range>]` — which tickets a commit range contains, off the
// `Refs:` trailers (kit `src/released.js` owns the parsing rules). Refs are
// `AB#n`; `KEY-N` trailers from an earlier tracker count as historical.
function readCommitRange(dir, range) {
  const { execFileSync } = require('node:child_process')
  const SEP = '\x00SKITTERSPEC\x00'
  let raw
  try {
    raw = execFileSync('git', ['-C', dir, 'log', `--format=%x00SKITTERSPEC%x00%H%n%B%x00END%x00`, '--name-only', range], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    const detail = (error.stderr || '').toString().trim().split('\n')[0] || error.message
    return { ok: false, error: detail }
  }
  const commits = []
  for (const chunk of raw.split(SEP)) {
    if (!chunk.trim()) continue
    const endAt = chunk.indexOf('\x00END\x00')
    if (endAt < 0) continue
    const head = chunk.slice(0, endAt)
    const paths = chunk
      .slice(endAt + ' END '.length)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const nl = head.indexOf('\n')
    const sha = head.slice(0, nl < 0 ? head.length : nl).trim()
    const body = nl < 0 ? '' : head.slice(nl + 1)
    commits.push({ sha, subject: body.split('\n')[0] || '', body, paths })
  }
  return { ok: true, commits }
}

function specSyncReleased(dir, config, rangeArg, flags, out) {
  const range = rangeArg || 'HEAD'
  const foreign = foreignPatternsOf(config)
  if (foreign.bad.length) {
    out.write(`${PROGRAM} released: refs.foreignPatterns has invalid pattern(s): ${foreign.bad.join(', ')} — fix ${CONFIG_FILE}\n`)
    return 1
  }
  const read = readCommitRange(dir, range)
  if (!read.ok) {
    out.write(`${PROGRAM} released: ${read.error}\n`)
    return 1
  }
  const report = kit.ticketsInRange(read.commits, {
    ignorePaths: (config.release && config.release.ignorePaths) || [],
    refPattern: AZURE_REF_RE,
    foreignPatterns: foreign.patterns,
  })
  if (flags.json) {
    out.write(JSON.stringify(report, null, 2) + '\n')
    return 0
  }
  const lines = [`${PROGRAM} released: ${range} — ${report.total} commit(s)`]
  for (const t of report.tickets) lines.push(`  ${t.ref}  (${t.commits} commit(s))`)
  if (!report.tickets.length) lines.push('  no referenced tickets')
  if (report.unreferenced) lines.push(`  ${report.unreferenced} commit(s) carry no Refs: trailer`)
  if (report.historical) lines.push(`  ${report.historical} commit(s) reference an earlier tracker`)
  if (report.ignored) lines.push(`  ${report.ignored} bookkeeping commit(s) ignored`)
  out.write(lines.join('\n') + '\n')
  return 0
}

// ---------------------------------------------------------------------------
// `release create | deployed | complete` — the kit's release seam
// (`provider-kit/src/releases.js`), carried by a work item of
// `releases.workItemType` (spec Decision 12): skitterspec decides the ticket
// set, the item holds it, `deployed` moves the ITEM's state, `complete`
// closes it.
const releases = makeReleaseCommands({
  tracker: 'Azure Boards',
  program: PROGRAM,
  readCommits: (dir, range) => readCommitRange(dir, range),
  ticketOptions: (config) => ({
    ignorePaths: (config.release && config.release.ignorePaths) || [],
    refPattern: AZURE_REF_RE,
    foreignPatterns: foreignPatternsOf(config).patterns,
  }),
  teamKey: () => '',
  listSpecs: (dir, config) => listSpecs(dir, config),
  series: (config) => (config.releases && config.releases.series) || [],
  adapterFor: (config, flags) => apiAdapterFor(config, flags),
  describe: (t) => `${t.ref}${t.title ? ` ${t.title}` : ''}`,
  // The release verbs are CI commands and the engine never calls MCP tools —
  // so over MCP this is impossible, not merely slower, and says so (exit 1).
  impossibleOverMcp: (config, flags) =>
    kit.resolveTransport(flags, config, true) === 'mcp'
      ? 'transport = mcp — the release verbs write over the API; set a PAT (CI: a pipeline secret) and re-run'
      : null,
})

// ---------------------------------------------------------------------------
// Assignment: `assign`, `whoami` and `users` are the kit's
// (`provider-kit/src/assignment.js`); this is Azure's binding. The id is the
// IDENTITY GUID (System.AssignedTo also takes a uniqueName, but the GUID
// survives renames), the store scope the org URL, and the user list the org's
// identities. No `validateAssignee` hook: Azure validates the identity at
// write time and the push relays its refusal — the Linear behaviour.
const assignment = makeAssignmentCommands({
  tracker: 'Azure Boards',
  configFile: CONFIG_FILE,
  bin: BIN,
  idHint: '<identity-id-or-email>',
  credentialNoun: 'PAT',
  scopeJsonKey: 'org',
  scopeLineLabel: 'org:',
  scopeOf: (config) => {
    const id = orgOf(config)
    return {
      id,
      label: id,
      missing: `spec-sync whoami: no azure.orgUrl in ${CONFIG_FILE}.\n  Identity is stored per org — run \`spec-sync init-config\` first.`,
    }
  },
  storePath: (env) => storePath(env),
  writeUser: (file, scope, user, deps) => writeUser(file, scope, user, deps),
  removeUser: (file, scope, deps) => removeUser(file, scope, deps),
  resolveIdentity: (config, env, deps) => resolveIdentity(config, env, deps),
  resolveCredential: (config, env) => resolveCredential(config, env),
  makeAdapter: (config, cred, flags) =>
    makeApiAdapter({ orgUrl: config.azure.orgUrl, project: config.azure.project, token: cred.token, fetch: flags.fetch }),
  displayNameOf: (u) => displayNameOf(u),
  usersOverMcp: 'search identities with core_get_identity_ids over MCP, or read them off the org\'s Users page',
})

// The state names EVERY configured type can hold, deduped — one map serves the
// spec item and its children, so a name only has to exist on one of them to be
// writable somewhere, and validation checks against the union. The per-kind
// mint types are in the union too, so a `workItemTypeByKind` entry's states
// are validated before the first write, exactly like the base pair.
async function unionStates(adapter, config) {
  const types = [
    ...new Set(
      [
        config.azure.workItemType,
        config.azure.childType,
        ...Object.values(config.azure.workItemTypeByKind || {}),
      ].filter(Boolean),
    ),
  ]
  const byName = new Map()
  for (const type of types) {
    for (const s of await adapter.listIssueStates(type)) {
      if (!byName.has(s.name)) byName.set(s.name, s)
    }
  }
  return [...byName.values()]
}

// ---------------------------------------------------------------------------
// Subcommands. Each returns an exit code and writes only to the streams it is
// handed, so every branch is testable offline.

function specSyncNormalize(dir, config, specArg, out, err) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  warnToErr(snapshotDir, config, err)
  out.write(JSON.stringify(normalizeLocal(snapshotDir, config), null, 2) + '\n')
  return 0
}

function specSyncPlan(dir, config, specArg, flags, out, err) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  const refused = stateCheckFailure(config, flags)
  if (refused) {
    out.write(refused.join('\n') + '\n')
    return 1
  }
  warnToErr(snapshotDir, config, err)
  const identifier = specIdentifier(snapshotDir, config)
  const r = push({ dir, snapshotDir, identifier, config })
  if (flags.json || !out.isTTY) {
    out.write(JSON.stringify(r.plan, null, 2) + '\n')
    return 0
  }
  if (r.empty) {
    out.write(`${PROGRAM} plan: ${identifier} — nothing to push\n`)
    return 0
  }
  const c = r.plan.subIssues.create.length
  const u = r.plan.subIssues.update.length
  out.write(
    `${PROGRAM} plan: ${identifier} — ${r.plan.issue ? 'item update, ' : ''}${c} child create(s), ${u} update(s)\n` +
      '  apply it: spec-sync plan <spec> --json > plan.json && spec-sync apply <spec> --plan plan.json\n',
  )
  return 0
}

// Does the project's OWN env.config.json claim the snapshot this apply just
// wrote? If not, `spec-env stage` classifies `<baseDir>/<id>.base.json` as
// another spec's and `/commit` leaves it behind — found live on a project that
// adopted this provider over a Linear-era isolation config. One line, after a
// successful apply, naming the exact keys to set.
//
// Fires only on POSITIVE signals: env.config.json present and parseable, the
// identifier stamped, and an explicit pattern set that provably misses the
// file. A key the project leaves unset is covered by the provider's runtime
// env defaults (common src/env/config.js), so absence stays silent — as does
// a project with no isolation at all (`.claude/rules/negative-checks.md`).
function companionCoverageNote(dir, config, snapshotDir, out) {
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf-8'))
  } catch {
    return
  }
  if (!parsed || typeof parsed !== 'object') return
  const overviewFile = (config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const identifier = specHelpers.linkedIdentifier(path.join(snapshotDir, overviewFile), config)
  if (!identifier) return

  const defaultPattern = `${config.sync.baseDir}/{identifier}.base.json`
  const rawPatterns = parsed.spec && parsed.spec.companionPaths
  const patterns = Array.isArray(rawPatterns) ? rawPatterns : [defaultPattern]
  const rawField = parsed.branch && parsed.branch.identifierField
  const field = typeof rawField === 'string' && rawField ? rawField : config.fields.identifier

  const slug = path.basename(snapshotDir).replace(/^(feat|bug|hotfix)-/, '')
  const basePath = `${config.sync.baseDir}/${identifier}.base.json`
  const claimed = patterns.some((p) => {
    if (typeof p !== 'string') return false
    const expanded = p.split('{identifier}').join(identifier).split('{slug}').join(slug)
    if (expanded !== basePath) return false
    // Stage reads `{identifier}` through branch.identifierField, so a pattern
    // that names the right file through the wrong field still claims nothing.
    return !p.includes('{identifier}') || field === config.fields.identifier
  })
  if (claimed) return
  out.write(
    `  note: ${basePath} is not claimed by env.config.json — spec-env stage and /commit will treat it as another spec's.\n` +
      `        set branch.identifierField: "${config.fields.identifier}" and add "${defaultPattern}" to spec.companionPaths\n`,
  )
}

async function specSyncApply(dir, config, specArg, flags, out, err) {
  if (!flags.plan && !flags.all) {
    out.write(`${PROGRAM} apply: pass --plan <file> (from \`plan --json\`), or --all <bucket>\n`)
    return 1
  }
  const cred = apiAdapterFor(config, flags)
  const transport = kit.resolveTransport(flags, config, cred.ok)
  if (transport === 'mcp') {
    if (flags.all) {
      out.write(`${PROGRAM} apply --all: the MCP transport cannot bulk-apply — set credentials and re-run\n`)
      return 1
    }
    out.write(
      `${PROGRAM} apply: transport = mcp — nothing written by the engine.\n` +
        '  Apply the plan with the Azure DevOps MCP tools (wit_work_item_write\n' +
        '  create/update/add_child), then stamp the returned ids with\n' +
        '  `spec-sync stamp` and record with `spec-sync record`.\n',
    )
    return 0
  }
  if (!cred.ok) {
    out.write(`${PROGRAM} apply: ${cred.error}\n`)
    return 1
  }

  const applyOne = (snapshotDir, plan) =>
    kit.applySpecPlan({
      dir,
      config,
      snapshotDir,
      plan,
      adapter: cred.adapter,
      ops: applyOps({ adapter: cred.adapter, config, out, kind: specKindOf(snapshotDir) }),
      forceNew: !!flags.forceNew,
      program: PROGRAM,
    })

  if (flags.all) {
    const bucket = String(flags.all)
    if (!BUCKETS.includes(bucket)) {
      out.write(`${PROGRAM} apply --all: not a lifecycle bucket: ${bucket}\n`)
      return 1
    }
    const specs = listSpecs(dir, config).filter((s) => s.bucket === bucket)
    let failed = 0
    for (const spec of specs) {
      const snapshotDir = resolveSnapshotDir(spec.spec, dir)
      const identifier = specIdentifier(snapshotDir, config)
      const r = push({ dir, snapshotDir, identifier, config })
      if (r.empty) continue
      out.write(`${PROGRAM} apply: ${spec.spec}\n`)
      try {
        const applied = await applyOne(snapshotDir, r.plan)
        out.write(applied.lines.join('\n') + '\n')
        companionCoverageNote(dir, config, snapshotDir, out)
      } catch (error) {
        failed++
        out.write(`  !! ${error.message}\n`)
        if (error.orphans && error.orphans.length) {
          out.write(`  created but not stamped: ${error.orphans.join(', ')} — stamp before re-running\n`)
        }
      }
    }
    out.write(`${PROGRAM} apply --all ${bucket}: ${specs.length} spec(s), ${failed} failed\n`)
    return failed ? 1 : 0
  }

  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  let plan
  try {
    plan = JSON.parse(fs.readFileSync(flags.plan, 'utf-8'))
  } catch (error) {
    out.write(`${PROGRAM} apply: cannot read --plan: ${error.message}\n`)
    return 1
  }
  if (isEmptyPlan(plan)) {
    out.write(`${PROGRAM} apply: empty plan — nothing to do\n`)
    return 0
  }
  out.write(`${PROGRAM} apply: transport = api\n`)
  warnToErr(snapshotDir, config, err)
  try {
    const applied = await applyOne(snapshotDir, plan)
    out.write(applied.lines.join('\n') + '\n')
    companionCoverageNote(dir, config, snapshotDir, out)
    return 0
  } catch (error) {
    out.write(`${PROGRAM} apply: ${error.message}\n`)
    if (error.orphans && error.orphans.length) {
      out.write(
        `  created but not stamped: ${error.orphans.join(', ')} — stamp them with \`spec-sync stamp\` before re-running,\n` +
          '  or the next apply mints duplicates\n',
      )
    }
    return 1
  }
}

async function specSyncStamp(dir, config, specArg, flags, out) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  // Validate EVERYTHING before writing ANYTHING: a half-stamped spec mints
  // duplicates on the next push, which is worse than a refused stamp.
  const problems = []
  let issueId = null
  if (!flags.issue) problems.push('--issue <AB#n | n> is required')
  else {
    issueId = asIdentifier(String(flags.issue).trim())
    if (!ID_RE.test(issueId)) problems.push(`--issue ${flags.issue} is not a work item id (AB#123, or the bare number)`)
  }
  if (flags.url && !/^https?:\/\//i.test(flags.url)) problems.push(`--url must be http(s): ${flags.url}`)
  const subs = []
  for (const pair of flags.subs || []) {
    const [ref, ...rest] = String(pair).split('=')
    const id = asIdentifier(rest.join('=').trim())
    const file = listPhaseFiles(snapshotDir).find(
      (f) => f.replace(/\.md$/, '') === String(ref).trim().replace(/\.md$/, ''),
    )
    if (!file) problems.push(`--sub ${pair}: no phase file named ${ref}`)
    else if (!ID_RE.test(id)) problems.push(`--sub ${pair}: ${rest.join('=').trim() || '(empty)'} is not a work item id`)
    else subs.push({ file, id })
  }
  // The live half of the same promise: when credentials resolve, an id Azure
  // positively answers "no such item" to is refused — a wrong stamp's whole
  // failure mode is a duplicate minted LATER, far from the typo. Offline use
  // stays first-class: no credentials, or an unreachable Azure, is a
  // cannot-tell and stamps exactly as before (negative-checks rule 4).
  let verified = false
  if (!problems.length) {
    const cred = apiAdapterFor(config, flags)
    if (cred.ok) {
      try {
        const ids = [[issueId, '--issue'], ...subs.map((sub) => [sub.id, `--sub ${path.basename(sub.file)}`])]
        for (const [id, label] of ids) {
          if ((await cred.adapter.readIssue(apiId(id))) == null) {
            problems.push(`${label} ${id}: Azure has no such work item — check the number in the browser URL`)
          }
        }
        verified = !problems.length
      } catch {
        out.write(`${PROGRAM} stamp: could not check the id(s) against Azure — stamping anyway\n`)
      }
    }
  }
  if (problems.length) {
    out.write([`${PROGRAM} stamp: refusing — nothing written`, ...problems.map((p) => `  ${p}`)].join('\n') + '\n')
    return 1
  }
  const fields = config.fields
  const org = config.azure.orgUrl
  const url =
    flags.url ||
    (org && config.azure.project
      ? `${org}/${encodeURIComponent(config.azure.project)}/_workitems/edit/${apiId(issueId)}`
      : null)
  writeFrontmatter(snapshotDir, config, {
    [fields.identifier]: issueId,
    ...(url ? { [fields.url]: url } : {}),
    [fields.issueId]: apiId(issueId),
  })
  for (const { file, id } of subs) stampSubIssueId(snapshotDir, file, apiId(id), config)
  out.write(
    `${PROGRAM} stamp: ${issueId} stamped onto ${path.basename(snapshotDir)} (+${subs.length} child stamp(s))` +
      `${verified ? ' — verified against Azure' : ''}\n`,
  )
  return 0
}

function specSyncRecord(dir, config, specArg, out) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  const file = recordPush({ dir, snapshotDir, identifier: specIdentifier(snapshotDir, config), config })
  out.write(`${PROGRAM} record: snapshot written — ${path.relative(dir, file)}\n`)
  return 0
}

function specSyncStatus(dir, config, specArg, flags, out, err) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  const identifier = specIdentifier(snapshotDir, config)
  const lines = [`${PROGRAM} status: ${identifier}`]
  warnToErr(snapshotDir, config, err)

  if (flags.workspaceStates) {
    const refused = stateCheckFailure(config, { workspaceStates: flags.workspaceStates })
    if (refused) {
      out.write(refused.join('\n') + '\n')
      return 1
    }
    lines.push('  states: every configured state exists in the project')
  }

  const r = push({ dir, snapshotDir, identifier, config })
  if (r.empty) lines.push('  push: in sync — nothing would push')
  else {
    const c = r.plan.subIssues.create.length
    const u = r.plan.subIssues.update.length
    lines.push(`  push: pending — ${r.plan.issue ? 'item update, ' : ''}${c} child create(s), ${u} update(s)`)
  }

  if (flags.remote) {
    let remote
    try {
      remote = JSON.parse(fs.readFileSync(flags.remote, 'utf-8'))
    } catch (error) {
      out.write(`${PROGRAM} status: cannot read --remote: ${error.message}\n`)
      return 1
    }
    const bucket = remoteWorkflowState(remote, config)
    const local = r.projection.status
    if (bucket && local && bucket !== local) {
      lines.push(`  drift: Azure says "${bucket}", the repo says "${local}" (repo wins on next push)`)
    } else if (bucket) {
      lines.push('  drift: none — Azure agrees with the repo')
    }
    // SILENT ON EVERYTHING EXCEPT A POSITIVE ANSWER: `remoteDescriptionEdited`
    // returns null for every cannot-tell, and none of those is evidence.
    if (remoteDescriptionEdited(readBase(dir, identifier, config), remote, config) === true) {
      lines.push(
        `  drift: ${identifier}'s description was edited on Azure Boards since the last push`,
        '         (repo wins on next push — read it before pushing)',
      )
    }
  }
  out.write(lines.join('\n') + '\n')
  return 0
}

function specSyncVerify(dir, config, specArg, flags, out) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  if (!flags.stored) {
    out.write(`${PROGRAM} verify: pass --stored <file> ({ issue, subIssues: { ref: text } })\n`)
    return 1
  }
  let stored
  try {
    stored = JSON.parse(fs.readFileSync(flags.stored, 'utf-8'))
  } catch (error) {
    out.write(`${PROGRAM} verify: cannot read --stored: ${error.message}\n`)
    return 1
  }
  // A snapshot passed as --stored compares hashes against text and reports
  // total loss on a healthy mirror — refuse the shape explicitly.
  if (stored && stored.issueFields) {
    out.write(
      `${PROGRAM} verify: that looks like a .base.json snapshot, not a read-back —\n` +
        '  pass the DESCRIPTIONS the tracker returned ({ issue, subIssues: { ref: text } })\n',
    )
    return 1
  }
  out.write(verifyLines(snapshotDir, config, stored || {}, specIdentifier(snapshotDir, config)).join('\n') + '\n')
  // Warn, never fail: losses are for a human to read, and failing the command
  // would fail the push that just succeeded.
  return 0
}

function specSyncLinked(dir, config, flags, out) {
  const specs = listSpecs(dir, config)
  if (flags.json) {
    out.write(JSON.stringify(specs, null, 2) + '\n')
    return 0
  }
  if (!specs.length) {
    out.write(`${PROGRAM} linked: no specs found under specs/\n`)
    return 0
  }
  const lines = [`${PROGRAM} linked:`]
  for (const s of specs) lines.push(`  ${s.identifier || '—'}\t${s.spec}  (${s.bucket})`)
  lines.push(`  ${specs.filter((s) => s.identifier).length}/${specs.length} linked`)
  out.write(lines.join('\n') + '\n')
  return 0
}

async function specSyncStates(dir, config, flags, out) {
  const cred = apiAdapterFor(config, flags)
  const transport = kit.resolveTransport(flags, config, cred.ok)
  if (transport === 'mcp') {
    out.write(
      `${PROGRAM} states: transport = mcp — fetch the types' states with the\n` +
        '  Azure DevOps MCP tools and write the names to a JSON array file for\n' +
        '  --workspace-states.\n',
    )
    return 0
  }
  if (!cred.ok) {
    out.write(`${PROGRAM} states: ${cred.error}\n`)
    return 1
  }
  if (!config.azure.project) {
    out.write(`${PROGRAM} states: no azure.project configured — fix ${CONFIG_FILE}\n`)
    return 1
  }
  let states
  try {
    states = await unionStates(cred.adapter, config)
  } catch (error) {
    out.write(`${PROGRAM} states: ${error.message}\n`)
    return 1
  }
  const names = states.map((s) => s.name)
  if (flags.json) {
    // The bare array --workspace-states consumes.
    out.write(JSON.stringify(names, null, 2) + '\n')
    return 0
  }
  const catOf = new Map(states.map((s) => [s.name, s.category || null]))
  const lines = [
    `${PROGRAM} states: ${config.azure.project} (${config.azure.workItemType} + ${config.azure.childType})`,
    ...names.map((n) => `  ${n}${catOf.get(n) ? `  [${catOf.get(n)}]` : ''}`),
  ]
  // The bucket map — the one visual answer to "is skitterspec wired to what
  // this project actually has?". Every bucket gets a row and a verdict, a
  // missing state names its closest match, and the remap is one command.
  const suggestions = new Map(stateSuggestions(config, names).map((x) => [x.bucket, x.suggestion]))
  const buckets = Object.entries(config.states)
  const bw = Math.max(...buckets.map(([b]) => b.length))
  const nw = Math.max(...buckets.map(([, n]) => String(n).length))
  lines.push('', '  map: lifecycle bucket -> Boards state')
  const missing = []
  for (const [bucket, name] of buckets) {
    const ok = names.includes(name)
    if (!ok) missing.push(bucket)
    const tail = ok
      ? `ok${catOf.get(name) ? ` [${catOf.get(name)}]` : ''}`
      : `MISSING from these types${suggestions.get(bucket) ? ` — closest: "${suggestions.get(bucket)}"` : ''}`
    lines.push(`  ${bucket.padEnd(bw)} -> ${String(name).padEnd(nw)}  ${tail}`)
  }
  if (missing.length) lines.push(`  remap: ${PROGRAM} init-config --force --state <bucket>="<state>"`)
  out.write(lines.join('\n') + '\n')
  return 0
}

async function specSyncList(dir, config, flags, out) {
  const cred = apiAdapterFor(config, flags)
  const transport = kit.resolveTransport(flags, config, cred.ok)
  if (transport === 'mcp' || !cred.ok) {
    // Degrades rather than refusing: a listing is a convenience, and with no
    // credentials there is simply nothing to list from here.
    out.write(`${PROGRAM} list: needs the API transport — ${cred.ok ? 'pass --via api' : cred.error.split('\n')[0]}\n`)
    return 0
  }
  if (!config.azure.project) {
    out.write(`${PROGRAM} list: no azure.project configured — fix ${CONFIG_FILE}\n`)
    return 1
  }
  let items
  try {
    items = await cred.adapter.searchIssues({
      query: '',
      workItemType: config.azure.workItemType,
      limit: flags.limit || 50,
    })
    const stateNames = flags.stateArgs || []
    if (stateNames.length) {
      const want = new Set(stateNames.map((s) => s.toLowerCase()))
      items = items.filter((i) => i.state && want.has(String(i.state.name).toLowerCase()))
    } else if (!flags.all) {
      const terminal = new Set(
        [config.states.complete, config.states.cancelled].filter(Boolean).map((s) => s.toLowerCase()),
      )
      items = items.filter((i) => !i.state || !terminal.has(String(i.state.name).toLowerCase()))
    }
  } catch (error) {
    out.write(`${PROGRAM} list: ${error.message}\n`)
    return 1
  }
  const linked = new Map(listSpecs(dir, config).filter((s) => s.identifier).map((s) => [s.identifier, s]))
  const rows = items
    .filter((i) => !i.parent)
    .map((i) => ({
      identifier: i.identifier,
      title: i.title,
      state: i.state ? i.state.name : null,
      spec: linked.has(i.identifier) ? linked.get(i.identifier).spec : null,
    }))
  if (flags.json) {
    out.write(JSON.stringify(rows, null, 2) + '\n')
    return 0
  }
  if (!rows.length) {
    out.write(`${PROGRAM} list: nothing matched\n`)
    return 0
  }
  const lines = [`${PROGRAM} list: ${config.azure.project}`]
  for (const r of rows) {
    lines.push(`  ${r.identifier}\t${r.state || '—'}\t${r.title || ''}${r.spec ? `  -> ${r.spec}` : ''}`)
  }
  out.write(lines.join('\n') + '\n')
  return 0
}

// The `Refs:` trailer's source of truth: the ticket for the spec this branch
// (or the named spec) belongs to. Bare identifier on stdout ONLY on success —
// every no-ref case writes stderr and exits 1, so `$(spec-sync ref)` cannot
// splice an error into a commit body.
function specSyncRef(dir, config, specArg, flags, out, err) {
  let snapshotDir = null
  if (specArg) {
    snapshotDir = resolveSnapshotDir(specArg, dir)
    if (!snapshotDir) {
      err.write(`${PROGRAM} ref: spec not found: ${specArg}\n`)
      return 1
    }
  } else {
    // `currentBranch` takes a git READER bound to the checkout, not a path.
    const { execFileSync } = require('node:child_process')
    const git = (argv) => {
      try {
        return execFileSync('git', ['-C', dir, ...argv], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
      } catch {
        return null
      }
    }
    const branch = currentBranch(git)
    if (!branch) {
      err.write(`${PROGRAM} ref: not on a branch\n`)
      return 1
    }
    const slug = branch.includes('/') ? branch.slice(branch.indexOf('/') + 1) : branch
    const type = branch.includes('/') ? branch.slice(0, branch.indexOf('/')) : null
    const name = type ? `${type}-${slug}` : slug
    const found = findSpecFolder(name, dir)
    if (!found) {
      err.write(`${PROGRAM} ref: no spec matches branch ${branch}\n`)
      return 1
    }
    snapshotDir = found.path
  }
  const overviewFile = (config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const id = specHelpers.linkedIdentifier(path.join(snapshotDir, overviewFile), config)
  if (!id) {
    err.write(`${PROGRAM} ref: ${path.basename(snapshotDir)} has no ${config.fields.identifier} — omit the trailer\n`)
    return 1
  }
  if (flags.json) out.write(JSON.stringify({ identifier: id }) + '\n')
  else out.write(id + '\n')
  return 0
}

// ---------------------------------------------------------------------------
// `preserve <spec>` — post the item's current description back onto the item
// as a comment BEFORE the linking push replaces it. Every cannot-tell exits 0:
// a missing link, an unreachable Azure, an item with no description, and an
// already-preserved report are all states to report, not failures.
const PRESERVE_HEADING = '**Original report**'
const PRESERVE_MARKER = 'preserved by skitterspec before the spec replaced this description'

async function specSyncPreserve(dir, config, specArg, flags, out) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  const overviewFile = (config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const identifier = specHelpers.linkedIdentifier(path.join(snapshotDir, overviewFile), config)
  const done = (msg) => {
    out.write(`${PROGRAM} preserve: ${msg}\n`)
    return 0
  }
  if (!identifier) return done(`${path.basename(snapshotDir)} is not linked — nothing to preserve`)

  let original = null
  if (flags.text) {
    try {
      original = fs.readFileSync(flags.text, 'utf-8')
    } catch (error) {
      out.write(`${PROGRAM} preserve: cannot read --text: ${error.message}\n`)
      return 1
    }
  }

  const cred = apiAdapterFor(config, flags)
  const transport = kit.resolveTransport(flags, config, cred.ok)
  if (transport === 'mcp' && original == null) {
    return done(
      'transport = mcp — read the item description with the work item read tool, save it to a\n' +
        '  file, and re-run with --text <file>; the comment is then posted for you\n' +
        `  (or post it yourself with the comment tool, headed "${PRESERVE_HEADING}")`,
    )
  }
  if (!cred.ok) return done(`no credentials — ${cred.error.split('\n')[0]}; nothing preserved`)

  try {
    const comments = await cred.adapter.listComments(apiId(identifier))
    if (comments.some((c) => c.body && c.body.includes(PRESERVE_MARKER))) {
      return done(`${identifier} — already preserved, nothing to do`)
    }
    if (original == null) {
      const item = await cred.adapter.readIssue(apiId(identifier))
      if (!item) return done(`${identifier} not found on Azure — nothing preserved`)
      original = item.description
    }
    if (original == null || !String(original).trim()) {
      return done(`${identifier} has no description — nothing to preserve`)
    }
    await cred.adapter.createComment(apiId(identifier), `${PRESERVE_HEADING}\n\n_${PRESERVE_MARKER}_\n\n${original}`)
    return done(`${identifier} — original report preserved as a comment (${String(original).length} characters kept)`)
  } catch (error) {
    return done(`could not reach Azure (${String(error.message).split('\n')[0]}); nothing preserved`)
  }
}

// ---------------------------------------------------------------------------
// Credentials: `status` is a READINESS check (exit 1 with none); `set`
// prompts with hidden input; `unset` removes the org's entry.
async function specSyncCredentials(dir, config, action, flags, out) {
  // The store is USER-LEVEL — a machine credential must be storable before any
  // repo is configured — so the org (the store's scope key) may come from the
  // flag as well as the config. SETUP.md's ordering depends on this.
  const org = (flags.orgUrl || (config.azure && config.azure.orgUrl) || '').replace(/\/+$/, '')
  if (!org) {
    out.write(
      `${PROGRAM} credentials: no org to key the entry by — pass --org-url\n` +
        `  https://dev.azure.com/<org>, or configure ${CONFIG_FILE} first\n` +
        '  (/spec-azure-setup, or spec-sync init-config).\n',
    )
    return 1
  }
  const env = flags.env || process.env
  const file = storePath(env)

  if (action === 'status') {
    const resolved = resolveCredential(config.azure && config.azure.orgUrl ? config : { azure: { orgUrl: org }, auth: config.auth }, env)
    const mode = storeMode(file)
    const payload = {
      store: file,
      mode,
      org,
      credentials: resolved.ok
        ? { present: true, source: resolved.source, token: fingerprint(resolved.token) }
        : { present: false },
    }
    if (flags.json) {
      out.write(JSON.stringify(payload, null, 2) + '\n')
      return resolved.ok ? 0 : 1
    }
    const lines = [`${PROGRAM} credentials:`]
    lines.push(`  store:  ${file}${mode ? ` (${mode})` : ' (not created yet)'}`)
    lines.push(`  org:    ${org}`)
    if (resolved.ok) {
      const where = resolved.source === 'env' ? `environment (${resolved.envVars.join(', ')})` : 'store'
      lines.push(`  token:  set — ${fingerprint(resolved.token)} from the ${where}`)
    } else {
      lines.push('  token:  not set')
      lines.push('')
      lines.push('  Run this yourself, in your own terminal — not through an assistant:')
      lines.push('    skitterspec-azure-boards spec-sync credentials set')
    }
    out.write(lines.join('\n') + '\n')
    return resolved.ok ? 0 : 1
  }

  if (action === 'set') {
    if (flags.keyArgGiven) {
      out.write(
        `${PROGRAM} credentials: --key is not supported, on purpose.\n` +
          '  A secret in the command line is visible in shell history and to `ps`.\n' +
          '  Run `credentials set` with no arguments and paste at the prompt (input\n' +
          '  is hidden), or pipe it: `… | credentials set --stdin`.\n',
      )
      return 1
    }
    let token = ''
    const input = flags.input || process.stdin
    if (flags.stdin) {
      // A TTY on stdin is positive evidence that nothing was piped: `--stdin`
      // then waits for an EOF a terminal never sends. Refuse and name the two
      // working forms rather than blocking forever.
      if (input.isTTY) {
        out.write(
          `${PROGRAM} credentials: --stdin expects a pipe, but stdin is a terminal.\n` +
            '  Run it without --stdin to be prompted, or pipe the token:\n' +
            '    <command that prints the token> | skitterspec-azure-boards spec-sync credentials set --stdin\n',
        )
        return 1
      }
      token = (await kit.readAllStdin(input)).trim()
    } else {
      if (!input.isTTY) {
        out.write(
          `${PROGRAM} credentials: not a terminal — cannot prompt.\n` +
            '  Run it in your own terminal, or pipe the token with --stdin.\n',
        )
        return 1
      }
      token = (await kit.promptHidden(`Azure DevOps PAT for ${org} (hidden): `, input, out)).trim()
    }
    if (!token) {
      out.write(`${PROGRAM} credentials: empty token — nothing stored.\n`)
      return 1
    }
    const r = writeCredential(file, org, token)
    if (!r.ok) {
      out.write(`${PROGRAM} credentials: ${r.reason}\n`)
      return 1
    }
    out.write(`${PROGRAM} credentials: stored for ${org} in ${r.path} (600)\n`)
    return 0
  }

  if (action === 'unset') {
    const r = removeCredential(file, org)
    if (!r.ok) {
      out.write(`${PROGRAM} credentials: ${r.reason}\n`)
      return 1
    }
    out.write(
      r.removed
        ? `${PROGRAM} credentials: removed the entry for ${org} from ${r.path}\n`
        : `${PROGRAM} credentials: nothing stored for ${org} — nothing to remove\n`,
    )
    return 0
  }

  out.write('Usage: skitterspec-azure-boards spec-sync credentials <status|set|unset> [--stdin] [--json]\n')
  return 1
}

// ---------------------------------------------------------------------------
async function specSyncInitConfig(dir, flags, out) {
  const file = path.join(dir, CONFIG_FILE)
  if (fs.existsSync(file) && !flags.force) {
    out.write(`${PROGRAM} init-config: ${CONFIG_FILE} already exists — pass --force to overwrite\n`)
    return 1
  }
  if (!flags.orgUrl || !flags.project) {
    out.write(`${PROGRAM} init-config: --org-url and --project are required\n`)
    return 1
  }
  // Only the keys the operator set are written; everything else stays a
  // loader default, validated through the loader's own merge so a bad value
  // fails HERE rather than on the first push.
  const parsed = { azure: { orgUrl: flags.orgUrl, project: flags.project } }
  if (flags.workItemType) parsed.azure.workItemType = flags.workItemType
  if (flags.childType) parsed.azure.childType = flags.childType
  if (flags.kindTypes && Object.keys(flags.kindTypes).length) parsed.azure.workItemTypeByKind = flags.kindTypes
  if (flags.bugTypes || flags.hotfixTypes) {
    parsed.intake = {}
    if (flags.bugTypes) parsed.intake.bugTypes = flags.bugTypes
    if (flags.hotfixTypes) parsed.intake.hotfixTypes = flags.hotfixTypes
  }
  if (flags.stateNames && Object.keys(flags.stateNames).length) {
    for (const bucket of Object.keys(flags.stateNames)) {
      if (!LIFECYCLE_BUCKETS.includes(bucket)) {
        out.write(
          `${PROGRAM} init-config: --state ${bucket}=… is not a lifecycle bucket (${LIFECYCLE_BUCKETS.join('|')})\n`,
        )
        return 1
      }
    }
    parsed.states = flags.stateNames
  }
  let merged
  try {
    merged = mergeConfig(defaults(), parsed)
  } catch (error) {
    out.write(`${PROGRAM} init-config: ${error.message}\n`)
    return 1
  }

  // Validate the states map against the types' REAL states whenever the
  // credentials can reach them — a map this command could have checked must
  // not sail through to fail at doctor or, worse, at the first half-applied
  // push. Refuses with per-bucket suggestions and writes NOTHING; it never
  // picks a mapping itself (`/spec-azure-setup` is the surface that asks).
  // Unreachable or credential-less is a cannot-tell: the config is still
  // written, with one line saying what was not checked.
  const probe = { azure: { orgUrl: merged.azure.orgUrl }, auth: merged.auth }
  const cred = flags.adapter ? { ok: true } : resolveCredential(probe, flags.env || process.env)
  if (cred.ok) {
    const adapter =
      flags.adapter ||
      makeApiAdapter({ orgUrl: merged.azure.orgUrl, project: merged.azure.project, token: cred.token, fetch: flags.fetch })
    let names = null
    try {
      names = (await unionStates(adapter, merged)).map((st) => st.name)
    } catch (error) {
      out.write(
        `${PROGRAM} init-config: could not check the types' states (${String(error.message).split('\n')[0]}) — doctor --check-remote will\n`,
      )
    }
    if (names) {
      const missing = [...new Set(validateStates(merged, names))]
      if (missing.length) {
        const lines = [`${PROGRAM} init-config: refusing — nothing written`, '']
        for (const { label, configured, suggestion } of stateSuggestions(merged, names)) {
          lines.push(`  ${label}: "${configured}" is not a state in ${merged.azure.project}`)
          if (suggestion) lines.push(`    try --state ${label}="${suggestion}"`)
        }
        lines.push(
          '',
          `  available: ${names.join(', ')}`,
          '  Map every lifecycle bucket to one of those with --state <bucket>=<name>,',
          '  or run /spec-azure-setup to be walked through it.',
        )
        out.write(lines.join('\n') + '\n')
        return 1
      }
    }
  } else {
    out.write(`${PROGRAM} init-config: states not checked against the project (no credentials) — doctor --check-remote will\n`)
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + '\n')
  out.write(`${PROGRAM} init-config: wrote ${CONFIG_FILE}\n`)
  // A worktree forks from a COMMIT, so an uncommitted config is invisible in
  // every spec worktree — where the sync skills actually run. Say so here,
  // once, rather than letting each worktree report "Azure sync is off".
  out.write(`  commit it — spec worktrees fork from commits, and sync is off wherever this file is absent\n`)
  return 0
}

// ---------------------------------------------------------------------------
// Doctor: readiness across the layers this provider owns. The row framework
// and the missing-is-not-broken discipline are the kit's.
async function specSyncDoctor(dir, flags, out) {
  const { doctorRow: row, combineDoctorChecks } = kit
  const checks = []
  let loaded = null
  try {
    loaded = loadAzureConfig(dir)
  } catch (error) {
    checks.push(row('tracker', 'Azure config', 'broken', error.message, `fix ${CONFIG_FILE}`))
  }
  if (loaded) {
    if (!loaded.present) {
      checks.push(
        row(
          'tracker',
          'Azure config',
          'missing',
          `${CONFIG_FILE} not present — Azure Boards sync is off`,
          'skitterspec-azure-boards spec-sync init-config --org-url … --project …',
        ),
      )
    } else if (!loaded.config.azure.orgUrl || !loaded.config.azure.project) {
      checks.push(row('tracker', 'Azure config', 'broken', 'orgUrl or project is empty', `fix ${CONFIG_FILE}`))
    } else {
      checks.push(row('tracker', 'Azure config', 'ok', `${loaded.config.azure.project} @ ${loaded.config.azure.orgUrl}`))
      // A worktree forks from a COMMIT, so a config that exists only in the
      // working tree is invisible in every spec worktree — where the sync
      // skills actually run — and sync there reports itself off with no clue
      // pointing back here. The positive signal is git tracking the file;
      // every cannot-tell (no git repo, no git binary, a crashed call) stays
      // silent rather than accusing a healthy setup (negative-checks rule 4).
      // WHAT WOULD FOOL THIS: tracked-but-modified — worktrees then see the
      // last committed mapping, not this one. Lesser and not warned on.
      try {
        const { execFileSync } = require('node:child_process')
        const tracked = execFileSync('git', ['-C', dir, 'ls-files', '--', CONFIG_FILE], {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
        const inRepo = execFileSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
        if (inRepo === 'true' && !tracked) {
          checks.push(
            row(
              'tracker',
              'Config committed',
              'warn',
              `${CONFIG_FILE} is untracked — invisible in spec worktrees, sync is off there`,
              `git add -- ${CONFIG_FILE} && git commit`,
            ),
          )
        }
      } catch {
        // cannot tell — say nothing
      }
    }
  }
  const config = loaded && loaded.present ? loaded.config : null
  if (config && config.azure.orgUrl) {
    const cred = resolveCredential(config, flags.env || process.env)
    checks.push(
      cred.ok
        ? row('credentials', 'Credentials', 'ok', `PAT ${fingerprint(cred.token)} (${cred.source})`)
        : row('credentials', 'Credentials', 'missing', cred.error.split('\n')[0], 'skitterspec-azure-boards spec-sync credentials set'),
    )
    if (flags.remoteCheck && cred.ok) {
      const adapter =
        flags.adapter ||
        makeApiAdapter({ orgUrl: config.azure.orgUrl, project: config.azure.project, token: cred.token, fetch: flags.fetch })
      try {
        const viewer = await adapter.readViewer()
        checks.push(row('remote', 'Azure reachable', 'ok', viewer ? `as ${viewer.name || viewer.id}` : 'yes'))
        const states = await unionStates(adapter, config)
        // Deduped: complete and cancelled both map to one state by default,
        // and "not in the project: Done, Done" reads as a stutter, not a fact.
        const missing = [...new Set(validateStates(config, states.map((s) => s.name)))]
        checks.push(
          missing.length
            ? row(
                'states',
                'State names',
                'broken',
                `not in these types: ${missing.join(', ')}`,
                `fix ${CONFIG_FILE} -> states (see spec-sync states)`,
              )
            : row('states', 'State names', 'ok', 'every configured state exists'),
        )
        // The capability probe Decision 8 names: identity search is the op
        // that fails first on a narrow token. A 401 here is a WARN, not
        // broken — work item sync is whole without it; only `users` search
        // (phase 4) degrades.
        try {
          await adapter.searchUsers('skitterspec-probe', { limit: 1 })
          checks.push(row('identity', 'Identity search', 'ok', 'PAT can search identities'))
        } catch (error) {
          const msg = String(error.message)
          checks.push(
            /Identity \(Read\)/.test(msg)
              ? row('identity', 'Identity search', 'warn', 'PAT lacks Identity (Read) — user search degrades; whoami and assignment still work')
              : row('identity', 'Identity search', 'warn', msg.split('\n')[0]),
          )
        }
      } catch (error) {
        checks.push(row('remote', 'Azure reachable', 'broken', String(error.message).split('\n')[0], 'check the PAT and orgUrl'))
      }
    } else if (flags.remoteCheck) {
      checks.push(row('remote', 'Azure reachable', 'skipped', 'no credentials to check with'))
    }
  }
  const report = combineDoctorChecks(checks)
  if (flags.json) {
    out.write(JSON.stringify(report, null, 2) + '\n')
    return report.ok ? 0 : 1
  }
  const mark = { ok: 'ok', missing: '--', broken: 'XX', skipped: '..', warn: '!!' }
  const lines = [`${PROGRAM} doctor:`]
  for (const c of report.checks) {
    lines.push(`  ${mark[c.state] || '??'} ${c.label}: ${c.detail}`)
    if (c.fix && c.state !== 'ok') lines.push(`      fix: ${c.fix}`)
  }
  out.write(lines.join('\n') + '\n')
  return report.ok ? 0 : 1
}

// ---------------------------------------------------------------------------
const USAGE = `Usage: skitterspec-azure-boards spec-sync <subcommand>

  normalize <spec>                       print the local projection as JSON
  plan <spec> --workspace-states <f>     what a push would change (dry, JSON)
  apply <spec> --plan <f> | --all <b>    apply a plan over the API
  stamp <spec> --issue AB#n [--sub r=n]  write returned ids into the spec
  record <spec>                          write the last-pushed snapshot
  status <spec> [--remote <f>]           read-only drift report
  verify <spec> --stored <f>             compare a read-back against the repo
  states [--json]                        the configured types' state names
  list [--all | --state NAME]            tracker listing for the project
  linked [--json]                        specs and their linked items (offline)
  ref [<spec>]                           the Refs: trailer value for this branch
  released [<range>]                     tickets a commit range contains
  release create|deployed|complete <tag> the release work item (CI; --apply)
  preserve <spec> [--text <f>]           keep an adopted item's original report
  assign <spec> --to <id> | --release    stamp who is building it
  whoami [--set <id>] [--unset]          who you are on Azure (cached)
  users [<query>]                        search the org's identities
  credentials <status|set|unset>         the PAT (user-level)
  init-config --org-url … --project …    write the config
  doctor [--check-remote] [--json]       readiness report

Not yet shipped for Azure Boards: stage, retarget, reattach, sanitise.
`

async function specSync(rest, io = {}) {
  const out = io.out || process.stdout
  const err = io.err || process.stderr
  const [sub, ...args] = rest
  let dir = io.cwd || process.cwd()

  const { flags, positional, unknown } = parseArgs(args, sub)
  if (unknown.length) {
    out.write(kit.unknownFlagLines(PROGRAM, unknown).join('\n') + '\n')
    return 1
  }
  if (flags.dirOverride) dir = flags.dirOverride
  dir = path.resolve(dir)
  // Injection seam, alongside cwd/out/err: `env` supplies the credential
  // lookup and `adapter`/`fetch` stand in for the network, so every command is
  // exercised end to end offline. Production passes none and gets the real thing.
  flags.env = io.env || process.env
  if (io.adapter) flags.adapter = io.adapter
  if (io.fetch) flags.fetch = io.fetch
  if (io.input) flags.input = io.input
  if (io.tty !== undefined) out.isTTY = io.tty

  if (sub === 'init-config') return specSyncInitConfig(dir, flags, out)
  if (sub === 'doctor') return specSyncDoctor(dir, flags, out)

  let loaded
  try {
    loaded = loadAzureConfig(dir)
  } catch (error) {
    out.write(`${PROGRAM}: ${error.message}\n`)
    return 1
  }
  // Credentials are user-level, not repo-level: storing or checking them must
  // work before the repo opts in, or setup has a circular order.
  if (sub === 'credentials') return specSyncCredentials(dir, loaded.config, positional[0], flags, out)
  if (!loaded.present) {
    // Opt-out, not an error: a repo with no azure config has nothing to sync.
    out.write(`${PROGRAM}: ${CONFIG_FILE} not present — Azure Boards sync is off for this repo\n`)
    return 0
  }
  const config = loaded.config

  switch (sub) {
    case 'normalize':
      return specSyncNormalize(dir, config, positional[0], out, err)
    case 'plan':
      return specSyncPlan(dir, config, positional[0], flags, out, err)
    case 'apply':
      return specSyncApply(dir, config, positional[0], flags, out, err)
    case 'stamp':
      return specSyncStamp(dir, config, positional[0], flags, out)
    case 'record':
      return specSyncRecord(dir, config, positional[0], out)
    case 'status':
      return specSyncStatus(dir, config, positional[0], flags, out, err)
    case 'verify':
      return specSyncVerify(dir, config, positional[0], flags, out)
    case 'linked':
      return specSyncLinked(dir, config, flags, out)
    case 'states':
      return specSyncStates(dir, config, flags, out)
    case 'list':
      return specSyncList(dir, config, flags, out)
    case 'ref':
      return specSyncRef(dir, config, positional[0], flags, out, err)
    case 'released':
      return specSyncReleased(dir, config, positional[0], flags, out)
    case 'release': {
      // A bad foreign pattern is refused HERE, before the kit runs: dropping
      // one silently would re-count that tracker's history as unreferenced.
      const foreign = foreignPatternsOf(config)
      if (foreign.bad.length) {
        out.write(`${PROGRAM} release: refs.foreignPatterns has invalid pattern(s): ${foreign.bad.join(', ')} — fix ${CONFIG_FILE}\n`)
        return 1
      }
      return releases.run(dir, config, positional, flags, out)
    }
    case 'preserve':
      return specSyncPreserve(dir, config, positional[0], flags, out)
    case 'assign':
      return assignment.assign(dir, config, positional[0], flags, out)
    case 'whoami':
      return assignment.whoami(dir, config, flags, out)
    case 'users':
      return assignment.users(dir, config, positional[0], flags, out)
    case 'credentials':
      return specSyncCredentials(dir, config, positional[0], flags, out)
    default:
      out.write(USAGE)
      return sub ? 1 : 0
  }
}

// The kit's table parser, plus the one flag it cannot express portably:
// `apply --all <bucket>` takes a value while `list --all` is bare, so `--all`
// is resolved in a pre-pass keyed on the subcommand.
function parseArgs(args, sub) {
  const pre = []
  let all
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') {
      all = sub === 'list' ? true : args[++i]
      continue
    }
    pre.push(args[i])
  }
  const table = {
    '--json': { kind: 'boolean' },
    '--dir': { kind: 'path', name: 'dirOverride' },
    '--plan': { kind: 'path' },
    '--stored': { kind: 'path' },
    '--remote': { kind: 'path' },
    '--text': { kind: 'path' },
    '--workspace-states': { kind: 'path', name: 'workspaceStates' },
    '--skip-state-check': { kind: 'boolean', name: 'skipStateCheck' },
    '--via': { kind: 'string' },
    '--force': { kind: 'boolean' },
    '--force-new': { kind: 'boolean', name: 'forceNew' },
    '--issue': { kind: 'string' },
    '--url': { kind: 'value' },
    '--sub': { kind: 'list', name: 'subs' },
    '--limit': { kind: 'number' },
    '--cursor': { kind: 'string' },
    '--notes': { kind: 'path' },
    '--link': { kind: 'list', name: 'links' },
    '--stage': { kind: 'string' },
    '--apply': { kind: 'boolean' },
    '--to': { kind: 'string' },
    '--name': { kind: 'string' },
    '--release': { kind: 'boolean' },
    '--set': { kind: 'string' },
    '--unset': { kind: 'boolean' },
    '--stdin': { kind: 'boolean' },
    '--check-remote': { kind: 'boolean', name: 'remoteCheck' },
    '--org-url': { kind: 'string', name: 'orgUrl' },
    '--project': { kind: 'string', name: 'project' },
    '--work-item-type': { kind: 'string', name: 'workItemType' },
    '--child-type': { kind: 'string', name: 'childType' },
    // `--kind-type bug=Bug`, repeatable — azure.workItemTypeByKind for init-config.
    '--kind-type': {
      kind: 'custom',
      handle: (flags, value) => {
        const raw = String(value || '').trim()
        const [kind, ...rest] = raw.split('=')
        if (rest.length) {
          flags.kindTypes = { ...(flags.kindTypes || {}), [kind.trim()]: rest.join('=').trim() }
        }
      },
    },
    '--bug-type': { kind: 'list', name: 'bugTypes' },
    '--hotfix-type': { kind: 'list', name: 'hotfixTypes' },
    '--state': {
      kind: 'custom',
      handle: (flags, value) => {
        // Two readings, kept apart: `init-config --state complete=Shipped` is
        // a bucket=name PAIR; `list --state "Doing"` a bare state name.
        const raw = String(value || '').trim()
        const [bucket, ...rest] = raw.split('=')
        if (rest.length) {
          flags.stateNames = { ...(flags.stateNames || {}), [bucket.trim()]: rest.join('=').trim() }
        }
        if (raw) (flags.stateArgs = flags.stateArgs || []).push(rest.length ? rest.join('=').trim() : raw)
      },
    },
    '--key': {
      kind: 'custom',
      handle: (flags) => {
        // Consumed and DELIBERATELY DISCARDED — a secret in argv is refused,
        // but it must still be swallowed or it would print back in usage.
        flags.keyArgGiven = true
      },
    },
  }
  const parsed = kit.parseFlags(pre, table)
  if (all !== undefined) parsed.flags.all = all
  return parsed
}

module.exports = { specSync, USAGE, stateCheckFailure, applyOps, PRESERVE_HEADING, PRESERVE_MARKER }
