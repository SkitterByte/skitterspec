'use strict'

/**
 * `skitterspec-jira spec-sync <sub>` — the Jira provider's engine CLI.
 *
 * Built on the provider kit: spec resolution, transport precedence, the flag
 * parser with its unknown-flag refusal, the credentials prompts and the apply
 * orchestration are all shared machinery; what this file owns is Jira's — the
 * status-by-transition ops, the JQL, the config file it names in refusals,
 * and which operations the MCP transport cannot express.
 *
 * Exit-code semantics mirror the Linear provider's table: `ref` prints the
 * bare identifier on stdout ONLY on success (so `$(spec-sync ref)` cannot
 * splice an error into a commit body); `verify` warns and never fails on
 * losses; `preserve` exits 0 on every cannot-tell; dry-runs are the default
 * wherever a write exists; an unknown `--flag` refuses before anything runs.
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
  remoteDescriptionEdited,
  writeFrontmatter,
  stampSubIssueId,
  listPhaseFiles,
  normalizeLocal,
} = require('@skitterbyte/skitterspec-sync-core')
const kit = require('@skitterbyte/skitterspec-provider-kit')
const { BUCKETS, findSpecFolder, currentBranch } = require('@skitterbyte/skitterspec-common/src/env/resolve.js')

const { loadJiraConfig, mergeConfig, defaults, CONFIG_FILE, LIFECYCLE_BUCKETS, DEFAULT_CONFIG } = require('./config.js')
const { resolveCredential, writeCredential, removeCredential, storePath, storeMode, fingerprint } = require('./credentials.js')
const { makeApiAdapter } = require('./api.js')

const PROGRAM = 'spec-sync'
const specHelpers = kit.makeSpecHelpers({ program: PROGRAM })
const { resolveSnapshotDir, specIdentifier, listSpecs, resolveOrExit, warnToErr, verifyLines } = specHelpers

// An issue identifier: project key, dash, number.
const ID_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/

// ---------------------------------------------------------------------------
// The state gate. Jira refuses an unknown STATUS at transition time — after
// the description write has already landed — so a half-typed `states` table
// would mirror the prose and strand the workflow move. Same discipline as the
// Linear provider: validate against the project's real statuses first.
function stateCheckFailure(config, flags) {
  if (flags.skipStateCheck) return null
  if (!flags.workspaceStates) {
    return [
      `${PROGRAM} plan: refusing — the configured issue states have not been validated`,
      "  pass --workspace-states <file> (a JSON array of the project's status",
      '  names — `spec-sync states --json` prints exactly that), or',
      '  --skip-state-check to push anyway.',
      '  Jira refuses an unknown status only at transition time, after the',
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
    const lines = [`${PROGRAM} plan: refusing — configured status name(s) not in the project`, '']
    for (const { label, configured, suggestion } of stateSuggestions(config, list)) {
      lines.push(`  ${label}: "${configured}" is not a status in this project`)
      if (suggestion) lines.push(`    use "${suggestion}" instead`)
    }
    lines.push('', `  available: ${list.join(', ') || '(the project reported none)'}`, `  Fix ${CONFIG_FILE} -> states.`)
    return lines
  }
  return null
}

// ---------------------------------------------------------------------------
// Apply ops: the kit orchestration with Jira's tracker calls. Status is moved
// by TRANSITION after the create/update — Jira has no "set status" field — and
// `transitionTo` is idempotent when the issue already sits on the target.
function applyOps({ adapter, config }) {
  const statusFor = (bucket) => {
    const name = config.states && config.states[bucket]
    if (!name) {
      throw new Error(`no status configured for the "${bucket}" bucket — fix ${CONFIG_FILE} -> states`)
    }
    return name
  }
  const settle = async (keyOrId, bucket) => {
    if (!bucket) return
    await adapter.transitionTo(keyOrId, statusFor(bucket))
  }
  return {
    prevalidateStates: (buckets) => {
      for (const bucket of buckets) statusFor(bucket)
    },
    searchTwin: (title) => adapter.searchIssues({ query: title, projectKey: config.jira.projectKey }),
    twinAdvice: (twin, wanted, specName) =>
      `${twin.identifier} is already titled "${wanted}" and no spec claims it — ` +
      `stamp it onto the spec with \`spec-sync stamp ${specName} --issue ${twin.identifier}\`, ` +
      'or pass --force-new to create a second',
    missingIssueMessage: (identifier) => `no Jira issue found for ${identifier}`,
    remoteEditedLine: (identifier) =>
      `  !! ${identifier}'s description was edited on Jira since the last push — this replaces it`,
    mintIssue: async ({ title, issue }) => {
      const created = await adapter.createIssue({
        title,
        description: issue && issue.description != null ? issue.description : undefined,
        assigneeId: issue && issue.assignee ? issue.assignee : undefined,
        projectKey: config.jira.projectKey,
        issueTypeName: config.jira.issueType,
      })
      await settle(created.identifier, issue && issue.state)
      return created
    },
    updateIssue: async (existing, issue) => {
      const updates = {}
      if (issue.description !== undefined) updates.description = issue.description
      // Null is meaningful here — it is how Jira unassigns — so the key is
      // forwarded whenever the plan carries it, never truthiness-tested.
      if ('assignee' in issue) updates.assigneeId = issue.assignee ?? null
      if (Object.keys(updates).length) await adapter.updateIssue(existing.identifier, updates)
      await settle(existing.identifier, issue.state)
    },
    mintSubIssue: async (parentId, sub) => {
      const created = await adapter.createSubIssue(parentId, {
        title: sub.name,
        description: sub.goal != null ? sub.goal : undefined,
        projectKey: config.jira.projectKey,
        subtaskTypeName: config.jira.subtaskType,
      })
      await settle(created.identifier, sub.state)
      return created
    },
    updateSubIssue: async (sub) => {
      const updates = {}
      if (sub.name != null) updates.title = sub.name
      if (sub.goal != null) updates.description = sub.goal
      if (Object.keys(updates).length) await adapter.updateIssue(sub.id, updates)
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
      siteUrl: config.jira.siteUrl,
      email: cred.email,
      token: cred.token,
      fetch: flags.fetch,
    }),
  }
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
    `${PROGRAM} plan: ${identifier} — ${r.plan.issue ? 'issue update, ' : ''}${c} subtask create(s), ${u} update(s)\n` +
      '  apply it: spec-sync plan <spec> --json > plan.json && spec-sync apply <spec> --plan plan.json\n',
  )
  return 0
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
        '  Apply the plan with the Atlassian MCP tools (createJiraIssue /\n' +
        '  editJiraIssue / transitionJiraIssue), then stamp the returned keys\n' +
        '  with `spec-sync stamp` and record with `spec-sync record`.\n',
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
      ops: applyOps({ adapter: cred.adapter, config }),
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
  if (!flags.issue) problems.push('--issue <KEY-n> is required')
  else if (!ID_RE.test(flags.issue)) problems.push(`--issue ${flags.issue} is not an issue key (PROJ-123)`)
  if (flags.url && !/^https?:\/\//i.test(flags.url)) problems.push(`--url must be http(s): ${flags.url}`)
  const subs = []
  for (const pair of flags.subs || []) {
    const [ref, ...rest] = String(pair).split('=')
    const id = rest.join('=').trim()
    const file = listPhaseFiles(snapshotDir).find(
      (f) => f.replace(/\.md$/, '') === String(ref).trim().replace(/\.md$/, ''),
    )
    if (!file) problems.push(`--sub ${pair}: no phase file named ${ref}`)
    else if (!ID_RE.test(id)) problems.push(`--sub ${pair}: ${id || '(empty)'} is not an issue key`)
    else subs.push({ file, id })
  }
  // The live half of the same promise: when credentials resolve, a key Jira
  // positively answers "no such issue" to is refused — a wrong stamp's whole
  // failure mode is a duplicate minted LATER, far from the typo, so catching
  // it here is worth one read per key. Offline use stays first-class: no
  // credentials, or a Jira that cannot be reached, is a cannot-tell and stamps
  // exactly as before (negative-checks rule 4) — a thrown read says it could
  // not check rather than implying it did.
  let verified = false
  if (!problems.length) {
    const cred = apiAdapterFor(config, flags)
    if (cred.ok) {
      try {
        const keys = [[flags.issue, '--issue'], ...subs.map((sub) => [sub.id, `--sub ${path.basename(sub.file)}`])]
        for (const [id, label] of keys) {
          if ((await cred.adapter.readIssue(id)) == null) {
            problems.push(`${label} ${id}: Jira has no such issue — check the key in the browser URL`)
          }
        }
        verified = !problems.length
      } catch {
        out.write(`${PROGRAM} stamp: could not check the key(s) against Jira — stamping anyway\n`)
      }
    }
  }
  if (problems.length) {
    out.write([`${PROGRAM} stamp: refusing — nothing written`, ...problems.map((p) => `  ${p}`)].join('\n') + '\n')
    return 1
  }
  const fields = config.fields
  const site = config.jira.siteUrl
  const url = flags.url || (site ? `${site}/browse/${flags.issue}` : null)
  writeFrontmatter(snapshotDir, config, {
    [fields.identifier]: flags.issue,
    ...(url ? { [fields.url]: url } : {}),
  })
  for (const { file, id } of subs) stampSubIssueId(snapshotDir, file, id, config)
  out.write(
    `${PROGRAM} stamp: ${flags.issue} stamped onto ${path.basename(snapshotDir)} (+${subs.length} subtask stamp(s))` +
      `${verified ? ' — verified against Jira' : ''}\n`,
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
    lines.push('  states: every configured status exists in the project')
  }

  const r = push({ dir, snapshotDir, identifier, config })
  if (r.empty) lines.push('  push: in sync — nothing would push')
  else {
    const c = r.plan.subIssues.create.length
    const u = r.plan.subIssues.update.length
    lines.push(`  push: pending — ${r.plan.issue ? 'issue update, ' : ''}${c} subtask create(s), ${u} update(s)`)
  }

  if (flags.remote) {
    let remote
    try {
      remote = JSON.parse(fs.readFileSync(flags.remote, 'utf-8'))
    } catch (error) {
      out.write(`${PROGRAM} status: cannot read --remote: ${error.message}\n`)
      return 1
    }
    // NO STATE LINE, deliberately: skitterspec tells the tracker about its own
    // transitions and never reads a status back. A ticket someone moved there
    // is theirs to have moved, and push resends State only when the spec does.
    // SILENT ON EVERYTHING EXCEPT A POSITIVE ANSWER: `remoteDescriptionEdited`
    // returns null for every cannot-tell, and none of those is evidence.
    if (remoteDescriptionEdited(readBase(dir, identifier, config), remote, config) === true) {
      lines.push(
        `  drift: ${identifier}'s description was edited on Jira since the last push`,
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
      `${PROGRAM} states: transport = mcp — fetch the project's statuses with the\n` +
        '  Atlassian MCP tools and write the names to a JSON array file for\n' +
        '  --workspace-states.\n',
    )
    return 0
  }
  if (!cred.ok) {
    out.write(`${PROGRAM} states: ${cred.error}\n`)
    return 1
  }
  if (!config.jira.projectKey) {
    out.write(`${PROGRAM} states: no jira.projectKey configured — fix ${CONFIG_FILE}\n`)
    return 1
  }
  let states
  try {
    states = await cred.adapter.listIssueStates(config.jira.projectKey)
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
    `${PROGRAM} states: ${config.jira.projectKey}`,
    ...names.map((n) => `  ${n}${catOf.get(n) ? `  [${catOf.get(n)}]` : ''}`),
  ]
  // The bucket map — the one visual answer to "is skitterspec wired to what
  // this project actually has?". Every bucket gets a row and a verdict, a
  // missing status names its closest match, and the remap is one command.
  const suggestions = new Map(stateSuggestions(config, names).map((x) => [x.bucket, x.suggestion]))
  const buckets = Object.entries(config.states)
  const bw = Math.max(...buckets.map(([b]) => b.length))
  const nw = Math.max(...buckets.map(([, n]) => String(n).length))
  lines.push('', '  map: lifecycle bucket -> Jira status')
  const missing = []
  for (const [bucket, name] of buckets) {
    const ok = names.includes(name)
    if (!ok) missing.push(bucket)
    const tail = ok
      ? `ok${catOf.get(name) ? ` [${catOf.get(name)}]` : ''}`
      : `MISSING from the project${suggestions.get(bucket) ? ` — closest: "${suggestions.get(bucket)}"` : ''}`
    lines.push(`  ${bucket.padEnd(bw)} -> ${String(name).padEnd(nw)}  ${tail}`)
  }
  if (missing.length) lines.push(`  remap: ${PROGRAM} init-config --force --state <bucket>="<status>"`)
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
  if (!config.jira.projectKey) {
    out.write(`${PROGRAM} list: no jira.projectKey configured — fix ${CONFIG_FILE}\n`)
    return 1
  }
  let issues
  try {
    const stateNames = flags.stateArgs || []
    const query = stateNames.length
      ? { projectKey: config.jira.projectKey, jqlExtra: stateNames }
      : { projectKey: config.jira.projectKey }
    issues = await cred.adapter.searchIssues({ ...query, query: '', limit: flags.limit || 50 })
    if (stateNames.length) {
      const want = new Set(stateNames.map((s) => s.toLowerCase()))
      issues = issues.filter((i) => i.state && want.has(String(i.state.name).toLowerCase()))
    } else if (!flags.all) {
      issues = issues.filter((i) => !i.state || !/done/i.test(String(i.state.name)))
    }
  } catch (error) {
    out.write(`${PROGRAM} list: ${error.message}\n`)
    return 1
  }
  const linked = new Map(listSpecs(dir, config).filter((s) => s.identifier).map((s) => [s.identifier, s]))
  const rows = issues
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
  const lines = [`${PROGRAM} list: ${config.jira.projectKey}`]
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
    const branch = currentBranch(dir)
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
// `released [<range>]` — which tickets a commit range contains, off the
// `Refs:` trailers (kit `src/released.js` owns the parsing rules).
function readCommitRange(dir, range) {
  const { execFileSync } = require('node:child_process')
  const SEP = ' SKITTERSPEC '
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
    const endAt = chunk.indexOf(' END ')
    if (endAt < 0) continue
    const head = chunk.slice(0, endAt)
    const paths = chunk
      .slice(endAt + ' END '.length)
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
  const read = readCommitRange(dir, range)
  if (!read.ok) {
    out.write(`${PROGRAM} released: ${read.error}\n`)
    return 1
  }
  const report = kit.ticketsInRange(read.commits, {
    ignorePaths: (config.release && config.release.ignorePaths) || [],
  })
  if (flags.json) {
    out.write(JSON.stringify(report, null, 2) + '\n')
    return 0
  }
  const lines = [`${PROGRAM} released: ${range} — ${report.total} commit(s)`]
  for (const t of report.tickets) lines.push(`  ${t.ref}  (${t.commits} commit(s))`)
  if (!report.tickets.length) lines.push('  no referenced tickets')
  if (report.unreferenced) lines.push(`  ${report.unreferenced} commit(s) carry no Refs: trailer`)
  if (report.ignored) lines.push(`  ${report.ignored} bookkeeping commit(s) ignored`)
  out.write(lines.join('\n') + '\n')
  return 0
}

// ---------------------------------------------------------------------------
// `preserve <spec>` — post the issue's current description back onto the issue
// as a comment BEFORE the linking push replaces it. Every cannot-tell exits 0:
// a missing link, an unreachable Jira, an issue with no description, and an
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
      'transport = mcp — read the issue description with getJiraIssue, save it to a\n' +
        '  file, and re-run with --text <file>; the comment is then posted for you\n' +
        `  (or post it yourself with addCommentToJiraIssue, headed "${PRESERVE_HEADING}")`,
    )
  }
  if (!cred.ok) return done(`no credentials — ${cred.error.split('\n')[0]}; nothing preserved`)

  try {
    const comments = await cred.adapter.listComments(identifier)
    if (comments.some((c) => c.body && c.body.includes(PRESERVE_MARKER))) {
      return done(`${identifier} — already preserved, nothing to do`)
    }
    if (original == null) {
      const issue = await cred.adapter.readIssue(identifier)
      if (!issue) return done(`${identifier} not found on Jira — nothing preserved`)
      original = issue.description
    }
    if (original == null || !String(original).trim()) {
      return done(`${identifier} has no description — nothing to preserve`)
    }
    await cred.adapter.createComment(identifier, `${PRESERVE_HEADING}\n\n_${PRESERVE_MARKER}_\n\n${original}`)
    return done(`${identifier} — original report preserved as a comment (${String(original).length} characters kept)`)
  } catch (error) {
    return done(`could not reach Jira (${String(error.message).split('\n')[0]}); nothing preserved`)
  }
}

// ---------------------------------------------------------------------------
// Credentials: `status` is a READINESS check (exit 1 with none); `set`
// prompts — the email visibly (it is not a secret; it appears on every
// issue), the token hidden; `unset` removes the site's entry.
async function specSyncCredentials(dir, config, action, flags, out) {
  // The store is USER-LEVEL — a machine credential must be storable before any
  // repo is configured — so the site (the store's scope key) may come from the
  // flag as well as the config. SETUP.md's ordering depends on this.
  const site = (flags.siteUrl || (config.jira && config.jira.siteUrl) || '').replace(/\/+$/, '')
  if (!site) {
    out.write(
      `${PROGRAM} credentials: no site to key the entry by — pass --site-url\n` +
        `  https://<your-site>.atlassian.net, or configure ${CONFIG_FILE} first\n` +
        '  (/spec-jira-setup, or spec-sync init-config).\n',
    )
    return 1
  }
  const env = flags.env || process.env
  const file = storePath(env)

  if (action === 'status') {
    const resolved = resolveCredential(config, env)
    const mode = storeMode(file)
    const payload = {
      store: file,
      mode,
      site,
      credentials: resolved.ok
        ? { present: true, source: resolved.source, email: resolved.email, token: fingerprint(resolved.token) }
        : { present: false },
    }
    if (flags.json) {
      out.write(JSON.stringify(payload, null, 2) + '\n')
      return resolved.ok ? 0 : 1
    }
    const lines = [`${PROGRAM} credentials:`]
    lines.push(`  store:  ${file}${mode ? ` (${mode})` : ' (not created yet)'}`)
    lines.push(`  site:   ${site}`)
    if (resolved.ok) {
      const where = resolved.source === 'env' ? `environment (${resolved.envVars.join(', ')})` : 'store'
      lines.push(`  email:  ${resolved.email}`)
      lines.push(`  token:  set — ${fingerprint(resolved.token)} from the ${where}`)
    } else {
      lines.push('  token:  not set')
      lines.push('')
      lines.push('  Run this yourself, in your own terminal — not through an assistant:')
      lines.push('    skitterspec-jira spec-sync credentials set')
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
          '  is hidden), or pipe it: `… | credentials set --email <addr> --stdin`.\n',
      )
      return 1
    }
    let email = flags.email || ''
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
            '    <command that prints the token> | skitterspec-jira spec-sync credentials set --email <addr> --stdin\n',
        )
        return 1
      }
      if (!email) {
        out.write(`${PROGRAM} credentials: --stdin needs --email <addr> (the token is the piped half)\n`)
        return 1
      }
      token = (await kit.readAllStdin(input)).trim()
    } else {
      if (!input.isTTY) {
        out.write(
          `${PROGRAM} credentials: not a terminal — cannot prompt.\n` +
            '  Run it in your own terminal, or pipe the token with --email and --stdin.\n',
        )
        return 1
      }
      if (!email) {
        const readline = require('node:readline')
        email = await new Promise((resolve) => {
          const rl = readline.createInterface({ input, output: out, terminal: true })
          rl.question(`Jira account email for ${site}: `, (answer) => {
            rl.close()
            resolve(String(answer || '').trim())
          })
        })
      }
      if (!email) {
        out.write(`${PROGRAM} credentials: empty email — nothing stored.\n`)
        return 1
      }
      token = (await kit.promptHidden(`Jira API token for ${email} (hidden): `, input, out)).trim()
    }
    if (!token) {
      out.write(`${PROGRAM} credentials: empty token — nothing stored.\n`)
      return 1
    }
    const r = writeCredential(file, site, email, token)
    if (!r.ok) {
      out.write(`${PROGRAM} credentials: ${r.reason}\n`)
      return 1
    }
    out.write(`${PROGRAM} credentials: stored for ${site} in ${r.path} (600)\n`)
    return 0
  }

  if (action === 'unset') {
    const r = removeCredential(file, site)
    if (!r.ok) {
      out.write(`${PROGRAM} credentials: ${r.reason}\n`)
      return 1
    }
    out.write(
      r.removed
        ? `${PROGRAM} credentials: removed the entry for ${site} from ${r.path}\n`
        : `${PROGRAM} credentials: nothing stored for ${site} — nothing to remove\n`,
    )
    return 0
  }

  out.write('Usage: skitterspec-jira spec-sync credentials <status|set|unset> [--email <addr>] [--stdin] [--json]\n')
  return 1
}

// ---------------------------------------------------------------------------
async function specSyncInitConfig(dir, flags, out) {
  const file = path.join(dir, CONFIG_FILE)
  if (fs.existsSync(file) && !flags.force) {
    out.write(`${PROGRAM} init-config: ${CONFIG_FILE} already exists — pass --force to overwrite\n`)
    return 1
  }
  if (!flags.siteUrl || !flags.projectKey) {
    out.write(`${PROGRAM} init-config: --site-url and --project-key are required\n`)
    return 1
  }
  // Only the keys the operator set are written; everything else stays a
  // loader default, validated through the loader's own merge so a bad value
  // fails HERE rather than on the first push.
  const parsed = { jira: { siteUrl: flags.siteUrl, projectKey: flags.projectKey } }
  if (flags.issueType) parsed.jira.issueType = flags.issueType
  if (flags.subtaskType) parsed.jira.subtaskType = flags.subtaskType
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

  // Validate the states map against the project's REAL statuses whenever the
  // credentials can reach it — a map this command could have checked must not
  // sail through to fail at doctor or, worse, at the first half-applied push.
  // Refuses with per-bucket suggestions and writes NOTHING; it never picks a
  // mapping itself, because "Done -> On Live" is a judgment only the operator
  // can make (`/spec-jira-setup` is the surface that asks). Unreachable or
  // credential-less is a cannot-tell: the config is still written, with one
  // line saying what was not checked.
  const probe = { jira: { siteUrl: merged.jira.siteUrl }, auth: merged.auth }
  const cred = flags.adapter
    ? { ok: true }
    : resolveCredential(probe, flags.env || process.env)
  if (cred.ok) {
    const adapter =
      flags.adapter ||
      makeApiAdapter({ siteUrl: merged.jira.siteUrl, email: cred.email, token: cred.token, fetch: flags.fetch })
    let names = null
    try {
      names = (await adapter.listIssueStates(merged.jira.projectKey)).map((st) => st.name)
    } catch (error) {
      out.write(`${PROGRAM} init-config: could not check the project's statuses (${String(error.message).split('\n')[0]}) — doctor --check-remote will\n`)
    }
    if (names) {
      const missing = [...new Set(validateStates(merged, names))]
      if (missing.length) {
        const lines = [`${PROGRAM} init-config: refusing — nothing written`, '']
        for (const { label, configured, suggestion } of stateSuggestions(merged, names)) {
          lines.push(`  ${label}: "${configured}" is not a status in ${merged.jira.projectKey}`)
          if (suggestion) lines.push(`    try --state ${label}="${suggestion}"`)
        }
        lines.push(
          '',
          `  available: ${names.join(', ')}`,
          '  Map every lifecycle bucket to one of those with --state <bucket>=<name>,',
          '  or run /spec-jira-setup to be walked through it.',
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
  // once, rather than letting each worktree report "Jira sync is off".
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
    loaded = loadJiraConfig(dir)
  } catch (error) {
    checks.push(row('tracker', 'Jira config', 'broken', error.message, `fix ${CONFIG_FILE}`))
  }
  if (loaded) {
    if (!loaded.present) {
      checks.push(
        row(
          'tracker',
          'Jira config',
          'missing',
          `${CONFIG_FILE} not present — Jira sync is off`,
          'skitterspec-jira spec-sync init-config --site-url … --project-key …',
        ),
      )
    } else if (!loaded.config.jira.siteUrl || !loaded.config.jira.projectKey) {
      checks.push(row('tracker', 'Jira config', 'broken', 'siteUrl or projectKey is empty', `fix ${CONFIG_FILE}`))
    } else {
      checks.push(row('tracker', 'Jira config', 'ok', `${loaded.config.jira.projectKey} @ ${loaded.config.jira.siteUrl}`))
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
  if (config && config.jira.siteUrl) {
    const cred = resolveCredential(config, flags.env || process.env)
    checks.push(
      cred.ok
        ? row('credentials', 'Credentials', 'ok', `${cred.email} (token ${fingerprint(cred.token)}, ${cred.source})`)
        : row('credentials', 'Credentials', 'missing', cred.error.split('\n')[0], 'skitterspec-jira spec-sync credentials set'),
    )
    if (flags.remoteCheck && cred.ok) {
      const adapter =
        flags.adapter ||
        makeApiAdapter({ siteUrl: config.jira.siteUrl, email: cred.email, token: cred.token, fetch: flags.fetch })
      try {
        const viewer = await adapter.readViewer()
        checks.push(row('remote', 'Jira reachable', 'ok', viewer ? `as ${viewer.name || viewer.id}` : 'yes'))
        const states = await adapter.listIssueStates(config.jira.projectKey)
        // Deduped: complete and cancelled both map to one status by default,
        // and "not in the project: Done, Done" reads as a stutter, not a fact.
        const missing = [...new Set(validateStates(config, states.map((s) => s.name)))]
        checks.push(
          missing.length
            ? row(
                'states',
                'Status names',
                'broken',
                `not in the project: ${missing.join(', ')}`,
                `fix ${CONFIG_FILE} -> states (see spec-sync states)`,
              )
            : row('states', 'Status names', 'ok', 'every configured status exists'),
        )
      } catch (error) {
        checks.push(row('remote', 'Jira reachable', 'broken', String(error.message).split('\n')[0], 'check credentials and siteUrl'))
      }
    } else if (flags.remoteCheck) {
      checks.push(row('remote', 'Jira reachable', 'skipped', 'no credentials to check with'))
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
const USAGE = `Usage: skitterspec-jira spec-sync <subcommand>

  normalize <spec>                       print the local projection as JSON
  plan <spec> --workspace-states <f>     what a push would change (dry, JSON)
  apply <spec> --plan <f> | --all <b>    apply a plan over the API
  stamp <spec> --issue KEY [--sub r=K]   write returned keys into the spec
  record <spec>                          write the last-pushed snapshot
  status <spec> [--remote <f>]           read-only drift report
  verify <spec> --stored <f>             compare a read-back against the repo
  states [--json]                        the project's status names
  list [--all | --state NAME]            tracker listing for the project
  linked [--json]                        specs and their linked issues (offline)
  ref [<spec>]                           the Refs: trailer value for this branch
  released [<range>]                     tickets a commit range contains
  preserve <spec> [--text <f>]           keep an adopted issue's original report
  credentials <status|set|unset>         the email + API-token pair (user-level)
  init-config --site-url … --project-key …   write the config
  doctor [--check-remote] [--json]       readiness report

Not yet shipped for Jira (the Linear provider has them): assign/whoami/users,
stage, retarget, reattach, sanitise.
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
    loaded = loadJiraConfig(dir)
  } catch (error) {
    out.write(`${PROGRAM}: ${error.message}\n`)
    return 1
  }
  // Credentials are user-level, not repo-level: storing or checking them must
  // work before the repo opts in, or setup has a circular order (the smoke
  // found exactly this — `credentials set` refused on a fresh repo).
  if (sub === 'credentials') return specSyncCredentials(dir, loaded.config, positional[0], flags, out)
  if (!loaded.present) {
    // Opt-out, not an error: a repo with no jira config has nothing to sync.
    out.write(`${PROGRAM}: ${CONFIG_FILE} not present — Jira sync is off for this repo\n`)
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
    case 'preserve':
      return specSyncPreserve(dir, config, positional[0], flags, out)
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
    '--email': { kind: 'string' },
    '--stdin': { kind: 'boolean' },
    '--check-remote': { kind: 'boolean', name: 'remoteCheck' },
    '--site-url': { kind: 'string', name: 'siteUrl' },
    '--project-key': { kind: 'string', name: 'projectKey' },
    '--issue-type': { kind: 'string', name: 'issueType' },
    '--subtask-type': { kind: 'string', name: 'subtaskType' },
    '--state': {
      kind: 'custom',
      handle: (flags, value) => {
        // Two readings, kept apart: `init-config --state complete=Shipped` is
        // a bucket=name PAIR; `list --state "In Progress"` a bare status name.
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
