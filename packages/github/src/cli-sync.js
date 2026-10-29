'use strict'

/**
 * `skitterspec-github spec-sync <sub>` — the GitHub provider's engine CLI.
 *
 * Built on the provider kit: spec resolution, transport precedence, the flag
 * parser with its unknown-flag refusal, the credentials prompts and the apply
 * orchestration are all shared machinery; what this file owns is GitHub's —
 * state applied as a board Status option plus the issue's own open/closed, the
 * `#N` identifier shape, the config file it names in refusals, and which
 * operations the MCP transport cannot express.
 *
 * Exit-code semantics mirror the other providers' table: `ref` prints the
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
  remoteStateReading,
  stateNamesFor,
  remoteDescriptionEdited,
  writeFrontmatter,
  stampSubIssueId,
  listPhaseFiles,
  normalizeLocal,
} = require('@skitterbyte/skitterspec-sync-core')
const kit = require('@skitterbyte/skitterspec-provider-kit')
const { GITHUB_REF_RE, IDENTIFIER_RE } = require('@skitterbyte/skitterspec-provider-kit/src/released.js')
const { BUCKETS, findSpecFolder, currentBranch } = require('@skitterbyte/skitterspec-common/src/env/resolve.js')

const {
  loadGithubConfig,
  mergeConfig,
  defaults,
  closeReasonForBucket,
  markersFor,
  CONFIG_FILE,
  LIFECYCLE_BUCKETS,
} = require('./config.js')
const {
  resolveCredential,
  writeCredential,
  removeCredential,
  storePath,
  storeMode,
  fingerprint,
  scopeOf,
  writeUser,
  removeUser,
} = require('./credentials.js')
const { makeApiAdapter } = require('./api.js')
const { APPLY_OVER_MCP } = require('./mcp.js')
const { resolveIdentity, displayNameOf } = require('./identity.js')
const { makeAssignmentCommands } = require('@skitterbyte/skitterspec-provider-kit/src/assignment.js')
const { makeReleaseCommands } = require('@skitterbyte/skitterspec-provider-kit/src/releases.js')

const PROGRAM = 'spec-sync'
const BIN = 'skitterspec-github'
const specHelpers = kit.makeSpecHelpers({ program: PROGRAM })
const { resolveSnapshotDir, specIdentifier, listSpecs, resolveOrExit, warnToErr, verifyLines } = specHelpers

// An issue reference as typed: `#123` or `123`. Stamped as `#123`.
const ID_RE = /^#?\d+$/
const asIdentifier = (ref) => `#${String(ref).replace(/^#/, '')}`

const repoLabel = (config) => `${config.github.owner}/${config.github.repo}`
const issueUrl = (config, identifier) =>
  config.github.owner && config.github.repo
    ? `https://github.com/${config.github.owner}/${config.github.repo}/issues/${String(identifier).replace(/^#/, '')}`
    : null

// What a command needs before it can talk to GitHub at all. One message, so
// every command names the same three keys the same way.
function configGap(config, { board = true } = {}) {
  const g = config.github || {}
  const missing = []
  if (!g.owner) missing.push('github.owner')
  if (!g.repo) missing.push('github.repo')
  if (board && !g.project) missing.push('github.project')
  return missing.length ? `${missing.join(', ')} not set — fix ${CONFIG_FILE}` : null
}

// ---------------------------------------------------------------------------
// The state gate. GitHub refuses an unknown Status option only when the
// field write is attempted — after the body write has already landed — so a
// half-typed `states` table would mirror the prose and strand the state move.
// Same discipline as the other providers: validate against the board's real
// options first.
function stateCheckFailure(config, flags) {
  if (flags.skipStateCheck) return null
  if (!flags.workspaceStates) {
    return [
      `${PROGRAM} plan: refusing — the configured board states have not been validated`,
      "  pass --workspace-states <file> (a JSON array of the board's Status",
      '  options — `spec-sync states --json` prints exactly that), or',
      '  --skip-state-check to push anyway.',
      '  An unknown Status option is refused only at the field write, after the',
      '  body write has landed: the push would half-apply.',
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
    const lines = [`${PROGRAM} plan: refusing — configured state name(s) not on the board`, '']
    for (const { label, configured, suggestion } of stateSuggestions(config, list)) {
      lines.push(`  ${label}: "${configured}" is not a Status option on the board`)
      if (suggestion) lines.push(`    use "${suggestion}" instead`)
    }
    lines.push('', `  available: ${list.join(', ') || '(the board reported none)'}`, `  Fix ${CONFIG_FILE} -> states.`)
    return lines
  }
  return null
}

// ---------------------------------------------------------------------------
// Apply ops: the kit orchestration with GitHub's calls. State is applied
// AFTER the create/update, in two writes: the board Status option, then the
// issue's own open/closed where the bucket calls for it. Both are idempotent —
// a Status already set is left alone, and the issue is only opened or closed
// when it is not already.
function applyOps({ adapter, config }) {
  const statusFor = (bucket) => {
    const name = config.states && config.states[bucket]
    if (!name) {
      throw new Error(`no state configured for the "${bucket}" bucket — fix ${CONFIG_FILE} -> states`)
    }
    return name
  }
  const settle = async (issueOrRef, bucket) => {
    if (!bucket) return
    const issue = issueOrRef && issueOrRef.nodeId ? issueOrRef : await adapter.readIssue(issueOrRef)
    if (!issue) throw new Error(`no GitHub issue found for ${issueOrRef}`)
    const changed = await adapter.setStatus(issue, statusFor(bucket))
    const reason = closeReasonForBucket(bucket)
    const wantOpen = !reason
    if (issue.open === wantOpen) return
    // A BOARD MAY HAVE GOT THERE FIRST. Projects ship an "auto-close issue"
    // workflow that closes an issue the moment its Status becomes Done, so the
    // Status write above can itself close it — and GitHub then refuses our close
    // as "closed by another request". Re-read after a Status change and act only
    // on what is still wrong: the positive signal is the issue's own state.
    let now = issue
    if (changed && changed.changed !== false) now = (await adapter.readIssue(issue.id)) || issue
    if (now.open === wantOpen) return
    try {
      await adapter.setIssueOpen(issue.id, { open: wantOpen, reason })
    } catch (error) {
      // The same race, lost later: re-read once, and accept the refusal only
      // when the issue is now where we wanted it. Anything else is real.
      const after = await adapter.readIssue(issue.id).catch(() => null)
      if (!after || after.open !== wantOpen) throw error
    }
  }
  // A create that lands and a settle that then fails leaves a real issue the
  // kit has not stamped — it records a create only once the op returns. Name it
  // on the error, as the adapter does for a failed sub-issue link, so the
  // refusal says what to stamp before anyone re-runs and mints a twin.
  const withOrphan = async (created, fn) => {
    try {
      await fn()
    } catch (error) {
      if (error && typeof error === 'object' && !error.orphan) error.orphan = created
      throw error
    }
  }
  const spec = markersFor(config, 'spec')
  const phase = markersFor(config, 'phase')
  return {
    prevalidateStates: (buckets) => {
      for (const bucket of buckets) statusFor(bucket)
    },
    searchTwin: (title) => adapter.searchIssues({ query: title }),
    twinAdvice: (twin, wanted, specName) =>
      `${twin.identifier} is already titled "${wanted}" and no spec claims it — ` +
      `stamp it onto the spec with \`spec-sync stamp ${specName} --issue ${twin.identifier}\`, ` +
      'or pass --force-new to create a second',
    missingIssueMessage: (identifier) => `no GitHub issue found for ${identifier} in ${repoLabel(config)}`,
    remoteEditedLine: (identifier) =>
      `  !! ${identifier}'s body was edited on GitHub since the last push — this replaces it`,
    mintIssue: async ({ title, issue }) => {
      const created = await adapter.createIssue({
        title,
        description: issue && issue.description != null ? issue.description : undefined,
        assigneeId: issue && issue.assignee ? issue.assignee : undefined,
        labels: spec.labels,
        type: spec.type,
      })
      await withOrphan(created, () => settle(created.id, issue && issue.state))
      return created
    },
    updateIssue: async (existing, issue) => {
      const updates = {}
      if (issue.description !== undefined) updates.description = issue.description
      // Null is meaningful here — it is how an issue is unassigned — so the
      // key is forwarded whenever the plan carries it, never truthiness-tested.
      if ('assignee' in issue) updates.assigneeId = issue.assignee ?? null
      // An ADOPTED issue was filed by a person and carries none of our markers,
      // and `list` finds specs by the spec label. A PATCH replaces the whole
      // label set, so the issue's own labels go along — and only when they were
      // read: an unknown set is left alone rather than overwritten.
      if (Array.isArray(existing.labels)) {
        const have = new Set(existing.labels.map((l) => String(l).toLowerCase()))
        const missing = spec.labels.filter((l) => !have.has(String(l).toLowerCase()))
        if (missing.length) updates.labels = [...existing.labels, ...missing]
      }
      if (Object.keys(updates).length) await adapter.updateIssue(existing.id, updates)
      await settle(existing, issue.state)
    },
    mintSubIssue: async (parentId, sub) => {
      const created = await adapter.createSubIssue(parentId, {
        title: sub.name,
        description: sub.goal != null ? sub.goal : undefined,
        labels: phase.labels,
        type: phase.type,
      })
      await withOrphan(created, () => settle(created.id, sub.state))
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

function adapterOptions(config) {
  const g = config.github || {}
  const deployedField = (config.releases && config.releases.deployedField) || 'Deployed'
  return { owner: g.owner, repo: g.repo, project: g.project, statusField: g.statusField, deployedField }
}

function apiAdapterFor(config, flags) {
  if (flags.adapter) return { ok: true, adapter: flags.adapter }
  const cred = resolveCredential(config, flags.env || process.env)
  if (!cred.ok) return { ok: false, error: cred.error }
  const gap = configGap(config, { board: false })
  if (gap) return { ok: false, error: gap }
  return { ok: true, adapter: makeApiAdapter({ ...adapterOptions(config), token: cred.token, fetch: flags.fetch }) }
}

// ---------------------------------------------------------------------------
// Assignment: `assign`, `whoami` and `users` are the kit's
// (`provider-kit/src/assignment.js`); this is GitHub's binding. The id is a
// LOGIN, the store scope the owner, and the user list the repo's assignees —
// the only people GitHub will let an issue be assigned to.
const assignment = makeAssignmentCommands({
  tracker: 'GitHub',
  configFile: CONFIG_FILE,
  bin: BIN,
  idHint: '<login>',
  credentialNoun: 'token',
  scopeJsonKey: 'owner',
  scopeLineLabel: 'owner:',
  scopeOf: (config) => {
    const id = scopeOf(config)
    return {
      id,
      label: id,
      missing: `spec-sync whoami: no github.owner in ${CONFIG_FILE}.\n  Identity is stored per owner — run \`spec-sync init-config\` first.`,
    }
  },
  storePath: (env) => storePath(env),
  writeUser: (file, scope, user, deps) => writeUser(file, scope, user, deps),
  removeUser: (file, scope, deps) => removeUser(file, scope, deps),
  resolveIdentity: (config, env, deps) => resolveIdentity(config, env, deps),
  resolveCredential: (config, env) => resolveCredential(config, env),
  makeAdapter: (config, cred, flags) => makeApiAdapter({ ...adapterOptions(config), token: cred.token, fetch: flags.fetch }),
  displayNameOf: (u) => displayNameOf(u),
  usersOverMcp: 'list the repo\'s assignees over MCP, or read them off the repo\'s settings',
  // GitHub refuses to assign anyone who is not a collaborator, and refuses it
  // at PUSH time, after the stamp has been committed. Checked here instead —
  // but only on a positive answer: no token, or a check that could not run, is
  // a cannot-tell and the stamp proceeds exactly as before (negative-checks).
  validateAssignee: async (config, login, flags) => {
    const cred = apiAdapterFor(config, flags)
    if (!cred.ok || !cred.adapter.checkAssignable) return null
    try {
      const ok = await cred.adapter.checkAssignable(login)
      return ok === false
        ? `${login} cannot be assigned in ${repoLabel(config)} — only collaborators can (\`spec-sync users\` lists them)`
        : null
    } catch {
      return null
    }
  },
})

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
    `${PROGRAM} plan: ${identifier} — ${r.plan.issue ? 'issue update, ' : ''}${c} sub-issue create(s), ${u} update(s)\n` +
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
      out.write(`${PROGRAM} apply --all: the MCP transport cannot bulk-apply — set a token and re-run\n`)
      return 1
    }
    out.write(`${PROGRAM} apply: transport = mcp — nothing written by the engine.\n  ${APPLY_OVER_MCP}\n`)
    return 0
  }
  if (!cred.ok) {
    out.write(`${PROGRAM} apply: ${cred.error}\n`)
    return 1
  }
  const gap = flags.adapter ? null : configGap(config)
  if (gap) {
    out.write(`${PROGRAM} apply: ${gap}\n`)
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

  // A sub-issue created but not linkable is a real issue nobody stamped — the
  // adapter hands it back on the refusal, and it is named alongside the
  // orchestration's own orphans.
  const orphansOf = (error) => [
    ...((error && error.orphans) || []),
    ...(error && error.orphan && error.orphan.identifier ? [error.orphan.identifier] : []),
  ]

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
        const orphans = orphansOf(error)
        if (orphans.length) out.write(`  created but not stamped: ${orphans.join(', ')} — stamp before re-running\n`)
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
    const orphans = orphansOf(error)
    if (orphans.length) {
      out.write(
        `  created but not stamped: ${orphans.join(', ')} — stamp them with \`spec-sync stamp\` before re-running,\n` +
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
  if (!flags.issue) problems.push('--issue <#n> is required')
  else if (!ID_RE.test(flags.issue)) problems.push(`--issue ${flags.issue} is not an issue number (#123)`)
  if (flags.url && !/^https?:\/\//i.test(flags.url)) problems.push(`--url must be http(s): ${flags.url}`)
  const subs = []
  for (const pair of flags.subs || []) {
    const [ref, ...rest] = String(pair).split('=')
    const id = rest.join('=').trim()
    const file = listPhaseFiles(snapshotDir).find(
      (f) => f.replace(/\.md$/, '') === String(ref).trim().replace(/\.md$/, ''),
    )
    if (!file) problems.push(`--sub ${pair}: no phase file named ${ref}`)
    else if (!ID_RE.test(id)) problems.push(`--sub ${pair}: ${id || '(empty)'} is not an issue number`)
    else subs.push({ file, id: asIdentifier(id) })
  }
  const issue = flags.issue && ID_RE.test(flags.issue) ? asIdentifier(flags.issue) : null
  // The live half of the same promise: when a token resolves, a number GitHub
  // positively answers "no such issue" to is refused — a wrong stamp's whole
  // failure mode is a duplicate minted LATER, far from the typo. Offline use
  // stays first-class: no token, or a GitHub that cannot be reached, is a
  // cannot-tell and stamps exactly as before (negative-checks rule 4).
  // WHAT WOULD FOOL THIS: GitHub reads a private repo the token cannot see as
  // "no such issue" — so the refusal says to check the repo as well as the number.
  let verified = false
  if (!problems.length) {
    const cred = apiAdapterFor(config, flags)
    if (cred.ok) {
      try {
        const ids = [[issue, '--issue'], ...subs.map((sub) => [sub.id, `--sub ${path.basename(sub.file)}`])]
        for (const [id, label] of ids) {
          if ((await cred.adapter.readIssue(id)) == null) {
            problems.push(`${label} ${id}: ${repoLabel(config)} has no such issue this token can see — check the number and the repo`)
          }
        }
        verified = !problems.length
      } catch {
        out.write(`${PROGRAM} stamp: could not check the number(s) against GitHub — stamping anyway\n`)
      }
    }
  }
  if (problems.length) {
    out.write([`${PROGRAM} stamp: refusing — nothing written`, ...problems.map((p) => `  ${p}`)].join('\n') + '\n')
    return 1
  }
  const fields = config.fields
  const url = flags.url || issueUrl(config, issue)
  writeFrontmatter(snapshotDir, config, {
    [fields.identifier]: issue,
    ...(url ? { [fields.url]: url } : {}),
  })
  for (const { file, id } of subs) stampSubIssueId(snapshotDir, file, id, config)
  out.write(
    `${PROGRAM} stamp: ${issue} stamped onto ${path.basename(snapshotDir)} (+${subs.length} sub-issue stamp(s))` +
      `${verified ? ' — verified against GitHub' : ''}\n`,
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
    lines.push('  states: every configured state is a Status option on the board')
  }

  const r = push({ dir, snapshotDir, identifier, config })
  if (r.empty) lines.push('  push: in sync — nothing would push')
  else {
    const c = r.plan.subIssues.create.length
    const u = r.plan.subIssues.update.length
    lines.push(`  push: pending — ${r.plan.issue ? 'issue update, ' : ''}${c} sub-issue create(s), ${u} update(s)`)
  }

  if (flags.remote) {
    let remote
    try {
      remote = JSON.parse(fs.readFileSync(flags.remote, 'utf-8'))
    } catch (error) {
      out.write(`${PROGRAM} status: cannot read --remote: ${error.message}\n`)
      return 1
    }
    // NEVER "repo wins on next push": push resends State only when the spec's
    // own state changes, so a moved item stays where it was put until then.
    const seen = remoteStateReading(remote, config)
    const local = r.projection.status
    if (seen && !seen.mapped) {
      lines.push(`  state: the board has it in "${seen.name}", a state skitterspec does not map — left alone`)
    } else if (seen && local && seen.bucket !== local) {
      lines.push(`  drift: the board says "${seen.bucket}", the repo says "${local}" (push resends State only when the spec moves)`)
    } else if (seen) {
      lines.push('  drift: none — the board agrees with the repo')
    }
    // SILENT ON EVERYTHING EXCEPT A POSITIVE ANSWER: `remoteDescriptionEdited`
    // returns null for every cannot-tell, and none of those is evidence.
    if (remoteDescriptionEdited(readBase(dir, identifier, config), remote, config) === true) {
      lines.push(
        `  drift: ${identifier}'s body was edited on GitHub since the last push`,
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
        '  pass the BODIES GitHub returned ({ issue, subIssues: { ref: text } })\n',
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
      `${PROGRAM} states: transport = mcp — read the board's "${config.github.statusField}" field\n` +
        '  options with projects_get / projects_list and write the names to a JSON\n' +
        '  array file for --workspace-states.\n',
    )
    return 0
  }
  if (!cred.ok) {
    out.write(`${PROGRAM} states: ${cred.error}\n`)
    return 1
  }
  const gap = flags.adapter ? null : configGap(config)
  if (gap) {
    out.write(`${PROGRAM} states: ${gap}\n`)
    return 1
  }
  let states
  try {
    states = await cred.adapter.listIssueStates()
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
  const lines = [
    `${PROGRAM} states: ${repoLabel(config)} · board ${config.github.project} · "${config.github.statusField}"`,
    ...names.map((n) => `  ${n}`),
  ]
  // The bucket map — the one visual answer to "is skitterspec wired to what
  // this board actually has?". Every bucket gets a row and a verdict, a
  // missing option names its closest match, and the issue's own state is
  // shown beside it so "Done" and "closed" are visibly the same move.
  const suggestions = new Map(stateSuggestions(config, names).map((x) => [x.bucket, x.suggestion]))
  const buckets = Object.entries(config.states)
  const bw = Math.max(...buckets.map(([b]) => b.length))
  const nw = Math.max(...buckets.map(([, n]) => String(n).length))
  lines.push('', '  map: lifecycle bucket -> board Status · issue')
  const missing = []
  for (const [bucket, name] of buckets) {
    const ok = names.includes(name)
    if (!ok) missing.push(bucket)
    const reason = closeReasonForBucket(bucket)
    const issue = reason ? `closed (${reason})` : 'open'
    const tail = ok
      ? `ok · ${issue}`
      : `MISSING from the board${suggestions.get(bucket) ? ` — closest: "${suggestions.get(bucket)}"` : ''}`
    lines.push(`  ${bucket.padEnd(bw)} -> ${String(name).padEnd(nw)}  ${tail}`)
    // Aliases are read-only, so a missing one never blocks a push — but it
    // reads as nothing, so it is still named.
    for (const alias of stateNamesFor(bucket, config).slice(1)) {
      const here = names.includes(alias)
      lines.push(`  ${''.padEnd(bw)}    ${String(alias).padEnd(nw)}  ${here ? 'also reads as ' + bucket : 'alias MISSING — reads as nothing'}`)
    }
  }
  if (missing.length) {
    lines.push(`  remap: ${PROGRAM} init-config --force … --state <bucket>="<option>", or add the option on the board`)
  }
  out.write(lines.join('\n') + '\n')
  return 0
}

async function specSyncList(dir, config, flags, out) {
  const cred = apiAdapterFor(config, flags)
  const transport = kit.resolveTransport(flags, config, cred.ok)
  if (transport === 'mcp' || !cred.ok) {
    // Degrades rather than refusing: a listing is a convenience, and with no
    // token there is simply nothing to list from here.
    out.write(`${PROGRAM} list: needs the API transport — ${cred.ok ? 'pass --via api' : cred.error.split('\n')[0]}\n`)
    return 0
  }
  const gap = flags.adapter ? null : configGap(config)
  if (gap) {
    out.write(`${PROGRAM} list: ${gap}\n`)
    return 1
  }
  let issues
  try {
    issues = await cred.adapter.listBoardItems({ label: markersFor(config, 'spec').labels[0] || '' })
    const stateNames = flags.stateArgs || []
    if (stateNames.length) {
      const want = new Set(stateNames.map((s) => s.toLowerCase()))
      issues = issues.filter((i) => i.state && want.has(String(i.state.name).toLowerCase()))
    } else if (!flags.all) {
      // Open issues, minus any whose Status is a finished bucket's name — an
      // alias such as "Released" is finished work on an issue nobody closed.
      const terminal = new Set(
        [...stateNamesFor('complete', config), ...stateNamesFor('cancelled', config)].map((s) => s.toLowerCase()),
      )
      issues = issues.filter((i) => i.open && !(i.state && terminal.has(String(i.state.name).toLowerCase())))
    }
  } catch (error) {
    out.write(`${PROGRAM} list: ${error.message}\n`)
    return 1
  }
  const linked = new Map(listSpecs(dir, config).filter((s) => s.identifier).map((s) => [s.identifier, s]))
  const rows = issues
    .filter((i) => !i.parent)
    .slice(0, flags.limit || Infinity)
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
  const lines = [`${PROGRAM} list: ${repoLabel(config)} · board ${config.github.project}`]
  for (const r of rows) {
    lines.push(`  ${r.identifier}\t${r.state || '—'}\t${r.title || ''}${r.spec ? `  -> ${r.spec}` : ''}`)
  }
  out.write(lines.join('\n') + '\n')
  return 0
}

// `intake [query]` — the inbox `/spec --from-issue` browses: open issues
// carrying `intake.label` that no spec has adopted yet, and that are not
// themselves spec or phase issues. Read-only, and never fatal: a listing is
// a convenience, so a missing token degrades to one line and exit 0.
async function specSyncIntake(dir, config, query, flags, out) {
  const cred = apiAdapterFor(config, flags)
  const transport = kit.resolveTransport(flags, config, cred.ok)
  if (transport === 'mcp' || !cred.ok) {
    out.write(
      `${PROGRAM} intake: needs the API transport — ${cred.ok ? 'pass --via api' : cred.error.split('\n')[0]}\n` +
        `  (over MCP: list_issues with label "${config.intake.label || '<any>'}", then drop the ones \`spec-sync linked\` names)\n`,
    )
    return 0
  }
  let issues
  try {
    issues = await cred.adapter.listIssues({ labels: config.intake.label ? [config.intake.label] : [] })
  } catch (error) {
    out.write(`${PROGRAM} intake: ${error.message}\n`)
    return 1
  }
  const claimed = new Set(listSpecs(dir, config).map((s) => s.identifier).filter(Boolean))
  const own = new Set(['spec', 'phase'].flatMap((k) => markersFor(config, k).labels).map((l) => l.toLowerCase()))
  const want = String(query || '').toLowerCase().trim()
  const bug = new Set((config.intake.bugLabels || []).map((l) => l.toLowerCase()))
  const hot = new Set((config.intake.hotfixLabels || []).map((l) => l.toLowerCase()))
  const rows = issues
    .filter((i) => !claimed.has(i.identifier))
    .filter((i) => !i.labels.some((l) => own.has(l.toLowerCase())))
    .filter((i) => !want || String(i.title || '').toLowerCase().includes(want))
    .map((i) => {
      const lower = i.labels.map((l) => l.toLowerCase())
      // Hotfix is checked first, as the intake seam does: production is the
      // more specific destination.
      const route = lower.some((l) => hot.has(l)) ? '/spec-hotfix' : lower.some((l) => bug.has(l)) ? '/spec-bug' : '/spec'
      return { identifier: i.identifier, title: i.title, url: i.url, labels: i.labels, author: i.author, route }
    })
  if (flags.json) {
    out.write(JSON.stringify(rows, null, 2) + '\n')
    return 0
  }
  if (!rows.length) {
    out.write(`${PROGRAM} intake: nothing waiting${config.intake.label ? ` under "${config.intake.label}"` : ''}\n`)
    return 0
  }
  const lines = [`${PROGRAM} intake: ${repoLabel(config)}${config.intake.label ? ` · "${config.intake.label}"` : ''}`]
  for (const r of rows) lines.push(`  ${r.identifier}\t${r.route}\t${r.title || ''}${r.author ? `  (${r.author})` : ''}`)
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
// `released [<range>]` — which tickets a commit range contains, off the
// `Refs:` trailers (kit `src/released.js` owns the parsing rules). Refs are
// `#N`; an older tracker's `KEY-N` trailer — a repo that moved here from
// Linear or Jira — counts as historical, never as a missed trailer.
function readCommitRange(dir, range) {
  const { execFileSync } = require('node:child_process')
  const SEP = '\0SKITTERSPEC\0'
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
    const endAt = chunk.indexOf('\0END\0')
    if (endAt < 0) continue
    const head = chunk.slice(0, endAt)
    const paths = chunk
      .slice(endAt + '\0END\0'.length)
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
    refPattern: GITHUB_REF_RE,
    foreignPatterns: [IDENTIFIER_RE],
  })
  if (flags.json) {
    out.write(JSON.stringify(report, null, 2) + '\n')
    return 0
  }
  const lines = [`${PROGRAM} released: ${range} — ${report.total} commit(s)`]
  for (const t of report.tickets) lines.push(`  ${t.ref}  (${t.commits} commit(s))`)
  if (!report.tickets.length) lines.push('  no referenced issues')
  if (report.unreferenced) lines.push(`  ${report.unreferenced} commit(s) carry no Refs: trailer`)
  if (report.historical) lines.push(`  ${report.historical} commit(s) reference an earlier tracker (KEY-N)`)
  if (report.ignored) lines.push(`  ${report.ignored} bookkeeping commit(s) ignored`)
  out.write(lines.join('\n') + '\n')
  return 0
}

// ---------------------------------------------------------------------------
// `release create | deployed | complete` — the kit's release seam
// (`provider-kit/src/releases.js`) on GitHub Releases plus the board's
// Deployed field. Run by CI on a tag push; dry unless `--apply`.
const releases = makeReleaseCommands({
  tracker: 'GitHub',
  program: PROGRAM,
  readCommits: (dir, range) => readCommitRange(dir, range),
  ticketOptions: (config) => ({
    ignorePaths: (config.release && config.release.ignorePaths) || [],
    refPattern: GITHUB_REF_RE,
    foreignPatterns: [IDENTIFIER_RE],
  }),
  teamKey: () => '',
  listSpecs: (dir, config) => listSpecs(dir, config),
  series: (config) => (config.releases && config.releases.series) || [],
  adapterFor: (config, flags) => {
    const got = apiAdapterFor(config, flags)
    if (!got.ok) return got
    const gap = flags.adapter ? null : configGap(config)
    return gap ? { ok: false, error: gap } : got
  },
  describe: (t) => `${t.ref}${t.title ? ` ${t.title}` : ''}`,
  // GitHub's MCP server can READ releases and cannot write one — so over MCP
  // this is impossible, not merely slower, and says so (exit 1).
  impossibleOverMcp: (config, flags) =>
    kit.resolveTransport(flags, config, true) === 'mcp'
      ? "transport = mcp — GitHub's MCP server has no release write tool; set a token (CI: a repo secret) and re-run"
      : null,
})

// ---------------------------------------------------------------------------
// `preserve <spec>` — post the issue's current body back onto the issue as a
// comment BEFORE the linking push replaces it. Every cannot-tell exits 0: a
// missing link, an unreachable GitHub, an issue with no body, and an
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
      'transport = mcp — read the issue body with issue_read, save it to a file,\n' +
        '  and re-run with --text <file>; the comment is then posted for you\n' +
        `  (or post it yourself with add_issue_comment, headed "${PRESERVE_HEADING}")`,
    )
  }
  if (!cred.ok) return done(`no token — ${cred.error.split('\n')[0]}; nothing preserved`)

  try {
    const comments = await cred.adapter.listComments(identifier)
    if (comments.some((c) => c.body && c.body.includes(PRESERVE_MARKER))) {
      return done(`${identifier} — already preserved, nothing to do`)
    }
    if (original == null) {
      const issue = await cred.adapter.readIssue(identifier)
      if (!issue) return done(`${identifier} not found in ${repoLabel(config)} — nothing preserved`)
      original = issue.description
    }
    if (original == null || !String(original).trim()) {
      return done(`${identifier} has no body — nothing to preserve`)
    }
    await cred.adapter.createComment(identifier, `${PRESERVE_HEADING}\n\n_${PRESERVE_MARKER}_\n\n${original}`)
    return done(`${identifier} — original report preserved as a comment (${String(original).length} characters kept)`)
  } catch (error) {
    return done(`could not reach GitHub (${String(error.message).split('\n')[0]}); nothing preserved`)
  }
}

// ---------------------------------------------------------------------------
// Credentials: `status` is a READINESS check (exit 1 with none); `set`
// prompts for the token hidden; `unset` removes the owner's entry.
async function specSyncCredentials(dir, config, action, flags, out) {
  // The store is USER-LEVEL — a machine credential must be storable before any
  // repo is configured — so the owner (the store's scope key) may come from the
  // flag as well as the config.
  const owner = flags.owner || (config.github && config.github.owner) || ''
  const scoped = { ...config, github: { ...(config.github || {}), owner } }
  const scope = scopeOf(scoped)
  if (!scope) {
    out.write(
      `${PROGRAM} credentials: no owner to key the entry by — pass --owner <account>,\n` +
        `  or configure ${CONFIG_FILE} first (/spec-github-setup, or spec-sync init-config).\n`,
    )
    return 1
  }
  const env = flags.env || process.env
  const file = storePath(env)

  if (action === 'status') {
    const resolved = resolveCredential(scoped, env)
    const mode = storeMode(file)
    const payload = {
      store: file,
      mode,
      scope,
      credentials: resolved.ok ? { present: true, source: resolved.source, token: fingerprint(resolved.token) } : { present: false },
    }
    if (flags.json) {
      out.write(JSON.stringify(payload, null, 2) + '\n')
      return resolved.ok ? 0 : 1
    }
    const lines = [`${PROGRAM} credentials:`]
    lines.push(`  store:  ${file}${mode ? ` (${mode})` : ' (not created yet)'}`)
    lines.push(`  owner:  ${scope}`)
    if (resolved.ok) {
      const where = resolved.source === 'env' ? `environment (${resolved.envVar})` : resolved.source
      lines.push(`  token:  set — ${fingerprint(resolved.token)} from the ${where}`)
    } else {
      lines.push('  token:  not set')
      lines.push('')
      lines.push('  Run this yourself, in your own terminal — not through an assistant:')
      lines.push(`    ${BIN} spec-sync credentials set`)
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
            `    <command that prints the token> | ${BIN} spec-sync credentials set --stdin\n`,
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
      token = (await kit.promptHidden(`GitHub token for ${scope} (classic, repo + project; hidden): `, input, out)).trim()
    }
    if (!token) {
      out.write(`${PROGRAM} credentials: empty token — nothing stored.\n`)
      return 1
    }
    const r = writeCredential(file, scope, token)
    if (!r.ok) {
      out.write(`${PROGRAM} credentials: ${r.reason}\n`)
      return 1
    }
    out.write(`${PROGRAM} credentials: stored for ${scope} in ${r.path} (600)\n`)
    return 0
  }

  if (action === 'unset') {
    const r = removeCredential(file, scope)
    if (!r.ok) {
      out.write(`${PROGRAM} credentials: ${r.reason}\n`)
      return 1
    }
    out.write(
      r.removed
        ? `${PROGRAM} credentials: removed the entry for ${scope} from ${r.path}\n`
        : `${PROGRAM} credentials: nothing stored for ${scope} — nothing to remove\n`,
    )
    return 0
  }

  out.write(`Usage: ${BIN} spec-sync credentials <status|set|unset> [--owner <account>] [--stdin] [--json]\n`)
  return 1
}

// ---------------------------------------------------------------------------
async function specSyncInitConfig(dir, flags, out) {
  const file = path.join(dir, CONFIG_FILE)
  if (fs.existsSync(file) && !flags.force) {
    out.write(`${PROGRAM} init-config: ${CONFIG_FILE} already exists — pass --force to overwrite\n`)
    return 1
  }
  if (!flags.owner || !flags.repo || !flags.project) {
    out.write(`${PROGRAM} init-config: --owner, --repo and --project (the board number) are required\n`)
    return 1
  }
  // Only the keys the operator set are written; everything else stays a
  // loader default, validated through the loader's own merge so a bad value
  // fails HERE rather than on the first push.
  const parsed = { github: { owner: flags.owner, repo: flags.repo, project: flags.project } }
  if (flags.statusField) parsed.github.statusField = flags.statusField
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

  // Validate the states map against the board's REAL options whenever a token
  // can reach it — a map this command could have checked must not sail
  // through to fail at doctor or, worse, at the first half-applied push.
  // Refuses with per-bucket suggestions and writes NOTHING; it never picks a
  // mapping itself, because that is a judgment only the operator can make
  // (`/spec-github-setup` is the surface that asks). Unreachable or
  // token-less is a cannot-tell: the config is still written, with one line
  // saying what was not checked.
  const cred = flags.adapter ? { ok: true } : resolveCredential(merged, flags.env || process.env)
  if (cred.ok) {
    const adapter = flags.adapter || makeApiAdapter({ ...adapterOptions(merged), token: cred.token, fetch: flags.fetch })
    let names = null
    try {
      names = (await adapter.listIssueStates()).map((st) => st.name)
    } catch (error) {
      out.write(`${PROGRAM} init-config: could not check the board's options (${String(error.message).split('\n')[0]}) — doctor --check-remote will\n`)
    }
    if (names) {
      const missing = [...new Set(validateStates(merged, names))]
      if (missing.length) {
        const lines = [`${PROGRAM} init-config: refusing — nothing written`, '']
        for (const { label, configured, suggestion } of stateSuggestions(merged, names)) {
          lines.push(`  ${label}: "${configured}" is not a "${merged.github.statusField}" option on board ${merged.github.project}`)
          if (suggestion) lines.push(`    try --state ${label}="${suggestion}"`)
        }
        lines.push(
          '',
          `  available: ${names.join(', ')}`,
          '  Map every lifecycle bucket to one of those with --state <bucket>=<name>,',
          '  add the missing option on the board, or run /spec-github-setup.',
        )
        out.write(lines.join('\n') + '\n')
        return 1
      }
    }
  } else {
    out.write(`${PROGRAM} init-config: states not checked against the board (no token) — doctor --check-remote will\n`)
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + '\n')
  out.write(`${PROGRAM} init-config: wrote ${CONFIG_FILE}\n`)
  // A worktree forks from a COMMIT, so an uncommitted config is invisible in
  // every spec worktree — where the sync skills actually run. Say so here,
  // once, rather than letting each worktree report "GitHub sync is off".
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
    loaded = loadGithubConfig(dir)
  } catch (error) {
    checks.push(row('tracker', 'GitHub config', 'broken', error.message, `fix ${CONFIG_FILE}`))
  }
  if (loaded) {
    if (!loaded.present) {
      checks.push(
        row(
          'tracker',
          'GitHub config',
          'missing',
          `${CONFIG_FILE} not present — GitHub sync is off`,
          `${BIN} spec-sync init-config --owner … --repo … --project …`,
        ),
      )
    } else if (configGap(loaded.config)) {
      checks.push(row('tracker', 'GitHub config', 'broken', configGap(loaded.config), `fix ${CONFIG_FILE}`))
    } else {
      checks.push(row('tracker', 'GitHub config', 'ok', `${repoLabel(loaded.config)} · board ${loaded.config.github.project}`))
      // A worktree forks from a COMMIT, so a config that exists only in the
      // working tree is invisible in every spec worktree — where the sync
      // skills actually run. The positive signal is git tracking the file;
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
  const config = loaded && loaded.present && !configGap(loaded.config) ? loaded.config : null
  if (config) {
    const cred = resolveCredential(config, flags.env || process.env)
    checks.push(
      cred.ok
        ? row('credentials', 'Token', 'ok', `${fingerprint(cred.token)} (${cred.source === 'env' ? cred.envVar : cred.source})`)
        : row('credentials', 'Token', 'missing', cred.error.split('\n')[0], `${BIN} spec-sync credentials set`),
    )
    if (flags.remoteCheck && (cred.ok || flags.adapter)) {
      const adapter = flags.adapter || makeApiAdapter({ ...adapterOptions(config), token: cred.token, fetch: flags.fetch })
      try {
        const viewer = await adapter.readViewer()
        checks.push(row('remote', 'GitHub reachable', 'ok', viewer ? `as ${viewer.login || viewer.id}` : 'yes'))
        // Scopes are a POSITIVE signal only for a classic token, which reports
        // them; a fine-grained token reports none (`null`) — a cannot-tell,
        // never "no scopes".
        if (viewer && Array.isArray(viewer.scopes)) {
          const need = ['repo', 'project'].filter((s) => !viewer.scopes.includes(s))
          checks.push(
            need.length
              ? row('remote', 'Token scopes', 'broken', `missing: ${need.join(', ')}`, 'create a classic token with repo + project, then credentials set')
              : row('remote', 'Token scopes', 'ok', 'repo, project'),
          )
        }
        const states = await adapter.listIssueStates()
        // Deduped: two buckets may share one option, and a stutter reads as noise.
        const missing = [...new Set(validateStates(config, states.map((s) => s.name)))]
        checks.push(
          missing.length
            ? row(
                'states',
                'Board states',
                'broken',
                `not "${config.github.statusField}" options: ${missing.join(', ')}`,
                `add them on the board, or fix ${CONFIG_FILE} -> states (see spec-sync states)`,
              )
            : row('states', 'Board states', 'ok', `every configured state is a "${config.github.statusField}" option`),
        )
        // Releases: the Deployed field and every env option a series names. Only
        // when a series is configured — a repo that never adopted releases has
        // nothing to be told about here.
        const series = (config.releases && config.releases.series) || []
        if (series.length && adapter.resolveBoard) {
          const field = config.releases.deployedField
          const board = await adapter.resolveBoard()
          const f = board.fields.find((x) => String(x.name).toLowerCase() === String(field).toLowerCase() && x.options)
          if (!f) {
            checks.push(row('releases', 'Deployed field', 'broken', `the board has no single-select "${field}"`, `add it on the board, or set releases.deployedField`))
          } else {
            const have = new Set(f.options.map((o) => o.name.toLowerCase()))
            const absent = series.flatMap((s) => Object.values(s.envs || {})).filter((o) => !have.has(o.toLowerCase()))
            checks.push(
              absent.length
                ? row('releases', 'Deployed field', 'broken', `"${field}" lacks: ${[...new Set(absent)].join(', ')}`, 'add the options on the board, or fix releases.series envs')
                : row('releases', 'Deployed field', 'ok', `"${field}" has every env option`),
            )
          }
        }
        if (adapter.listLabels) {
          const have = new Set((await adapter.listLabels()).map((l) => String(l.name).toLowerCase()))
          const want = ['spec', 'phase'].flatMap((k) => markersFor(config, k).labels)
          const absent = want.filter((l) => !have.has(l.toLowerCase()))
          checks.push(
            absent.length
              ? row('labels', 'Labels', 'warn', `not in the repo: ${absent.join(', ')} — GitHub creates them on first use`, '/spec-github-setup offers to create them')
              : row('labels', 'Labels', 'ok', want.join(', ') || 'none configured'),
          )
        }
      } catch (error) {
        checks.push(row('remote', 'GitHub reachable', 'broken', String(error.message).split('\n')[0], 'check the token, github.owner/repo and github.project'))
      }
    } else if (flags.remoteCheck) {
      checks.push(row('remote', 'GitHub reachable', 'skipped', 'no token to check with'))
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
const USAGE = `Usage: ${BIN} spec-sync <subcommand>

  normalize <spec>                       print the local projection as JSON
  plan <spec> --workspace-states <f>     what a push would change (dry, JSON)
  apply <spec> --plan <f> | --all <b>    apply a plan over the API
  stamp <spec> --issue #N [--sub r=#N]   write returned numbers into the spec
  record <spec>                          write the last-pushed snapshot
  status <spec> [--remote <f>]           read-only drift report
  verify <spec> --stored <f>             compare a read-back against the repo
  states [--json]                        the board's Status options + bucket map
  list [--all | --state NAME]            the board's issues for this repo
  intake [query] [--json]                issues waiting to become specs
  linked [--json]                        specs and their linked issues (offline)
  ref [<spec>]                           the Refs: trailer value for this branch
  released [<range>]                     issues a commit range contains
  release create|deployed|complete <tag> GitHub Release + Deployed field (CI; --apply)
  preserve <spec> [--text <f>]           keep an adopted issue's original report
  assign <spec> --to <login> | --release  stamp who is building it
  whoami [--set <login>] [--unset]       who you are on GitHub (cached)
  users [<query>]                        the repo's assignable people
  credentials <status|set|unset>         the GitHub token (user-level)
  init-config --owner … --repo … --project N   write the config
  doctor [--check-remote] [--json]       readiness report

Not yet shipped for GitHub: retarget, reattach, sanitise.
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
    loaded = loadGithubConfig(dir)
  } catch (error) {
    out.write(`${PROGRAM}: ${error.message}\n`)
    return 1
  }
  // Credentials are user-level, not repo-level: storing or checking them must
  // work before the repo opts in, or setup has a circular order.
  if (sub === 'credentials') return specSyncCredentials(dir, loaded.config, positional[0], flags, out)
  if (!loaded.present) {
    // Opt-out, not an error: a repo with no github config has nothing to sync.
    out.write(`${PROGRAM}: ${CONFIG_FILE} not present — GitHub sync is off for this repo\n`)
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
    case 'intake':
      return specSyncIntake(dir, config, positional[0], flags, out)
    case 'ref':
      return specSyncRef(dir, config, positional[0], flags, out, err)
    case 'released':
      return specSyncReleased(dir, config, positional[0], flags, out)
    case 'preserve':
      return specSyncPreserve(dir, config, positional[0], flags, out)
    case 'release':
      return releases.run(dir, config, positional, flags, out)
    case 'assign':
      return assignment.assign(dir, config, positional[0], flags, out)
    case 'whoami':
      return assignment.whoami(dir, config, flags, out)
    case 'users':
      return assignment.users(dir, config, positional[0], flags, out)
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
    '--stdin': { kind: 'boolean' },
    '--check-remote': { kind: 'boolean', name: 'remoteCheck' },
    '--owner': { kind: 'string' },
    '--repo': { kind: 'string' },
    '--project': { kind: 'string' },
    '--status-field': { kind: 'string', name: 'statusField' },
    '--to': { kind: 'string' },
    '--name': { kind: 'value' },
    '--release': { kind: 'boolean' },
    '--set': { kind: 'string' },
    '--unset': { kind: 'boolean' },
    '--cursor': { kind: 'string' },
    '--notes': { kind: 'path' },
    '--link': { kind: 'list', name: 'links' },
    '--stage': { kind: 'string' },
    '--apply': { kind: 'boolean' },
    '--state': {
      kind: 'custom',
      handle: (flags, value) => {
        // Two readings, kept apart: `init-config --state complete=Shipped` is
        // a bucket=name PAIR; `list --state "In Progress"` a bare option name.
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
