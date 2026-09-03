'use strict'

/**
 * `spec-sync` CLI handler — the Linear one-way sync engine seam.
 *
 * Ships only with the Linear provider package, so the base
 * (`@skitterbyte/skitterspec-common`) knows nothing about tracker sync. The repo
 * is the source of truth; Linear is a generated mirror. This drives the
 * provider-neutral engine (`@skitterbyte/skitterspec-sync-core`):
 *
 *   spec-sync normalize <spec>   print the local projection (JSON)
 *   spec-sync push <spec>        print the create/update PLAN the skill applies
 *                                (requires --workspace-states; see stateCheckFailure)
 *   spec-sync stamp <spec>       write returned ids back into the spec files
 *   spec-sync record <spec>      write the last-pushed snapshot (after apply)
 *   spec-sync status <spec>      read-only drift report (never writes)
 *   spec-sync linked             list every spec's linear_identifier (offline)
 *
 * The `/spec-push` skill: `push` → apply the plan over MCP → `stamp` the returned
 * ids into the repo → `record`. There is no pull — Linear is not read for content.
 */

const fs = require('node:fs')
const path = require('node:path')

const { BUCKETS, findSpecFolder } = require('@skitterbyte/skitterspec-common/src/env/resolve.js')
const {
  normalizeLocal,
  readSnapshot,
  parseFrontmatter,
  readBase,
  push,
  recordPush,
  projectionOf,
  planChanges,
  isEmptyPlan,
  remoteWorkflowState,
  validateStates,
  stateSuggestions,
  lintPhases,
  writeFrontmatter,
  stampSubIssueId,
  listPhaseFiles,
  compareStored,
  planRetarget,
  applyRetarget,
  deriveRecordedKey,
  isEmptyRetarget,
  dirtyPaths,
} = require('@skitterbyte/skitterspec-sync-core')

const { loadLinearConfig, mergeConfig, defaults: configDefaults, CONFIG_FILE, LIFECYCLE_BUCKETS } = require('./config.js')
const { resolveApiKey, makeApiAdapter, stateIdFor, fetchWorkspaceStates } = require('./api.js')
const { runChecks } = require('./doctor.js')
const {
  storePath,
  storeMode,
  fingerprint,
  writeKey,
  writeKeyCommand,
  removeKey,
} = require('./credentials.js')

// Resolve a spec argument to its snapshot dir. Accepts a spec name/folder found
// under specs/** (preferred) or a literal path to a snapshot directory.
function resolveSnapshotDir(specArg, dir) {
  const found = findSpecFolder(specArg, dir)
  if (found) return found.path
  const literal = path.resolve(dir, specArg)
  if (fs.existsSync(literal) && fs.statSync(literal).isDirectory()) return literal
  return null
}

// The identifier keying the snapshot sidecar: the spec's linear_identifier if
// set, else its folder name (so the engine is usable before a spec is linked).
function specIdentifier(snapshotDir, config) {
  try {
    const { frontmatter } = readSnapshot(snapshotDir, config)
    if (frontmatter.linear_identifier) return String(frontmatter.linear_identifier)
  } catch {
    /* fall through to folder name */
  }
  return path.basename(snapshotDir)
}

// Read a spec's `linear_identifier` without throwing: an unlinked spec, an
// unreadable file and a spec with no frontmatter all read as `null`.
function linkedIdentifier(overviewPath) {
  let raw
  try {
    raw = fs.readFileSync(overviewPath, 'utf-8')
  } catch {
    return null
  }
  const { data } = parseFrontmatter(raw)
  return data.linear_identifier ? String(data.linear_identifier) : null
}

// Every spec under specs/<bucket>/, paired with the Linear issue it is linked to
// (`null` when it has never been pushed). Folder specs read `snapshot.overviewFile`;
// legacy bare `<name>.md` specs read the file itself. Sorted for stable output.
function listSpecs(dir, config) {
  const overviewFile = (config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const specs = []
  for (const bucket of BUCKETS) {
    const root = path.join(dir, 'specs', bucket)
    let entries
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      let name
      let overviewPath
      if (entry.isDirectory()) {
        name = entry.name
        overviewPath = path.join(root, name, overviewFile)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        name = entry.name.slice(0, -3)
        overviewPath = path.join(root, entry.name)
      } else {
        continue
      }
      specs.push({ spec: name, bucket, identifier: linkedIdentifier(overviewPath) })
    }
  }
  return specs.sort((a, b) => a.spec.localeCompare(b.spec))
}

/**
 * `spec-sync linked` — which Linear issues are already adopted by a spec.
 *
 * Offline and read-only: the intake seam (`/spec <ISSUE-REF>`,
 * `/spec --from-issue`) subtracts these from the inbox and refuses to adopt an
 * issue twice, without reading Linear back.
 */
function specSyncLinked(dir, config, flags, out) {
  const specs = listSpecs(dir, config)
  if (flags.json) {
    out.write(JSON.stringify(specs, null, 2) + '\n')
    return
  }
  if (!specs.length) {
    out.write('spec-sync linked: no specs found under specs/\n')
    return
  }
  const lines = ['spec-sync linked:']
  for (const s of specs) {
    lines.push(`  ${s.identifier || '—'}\t${s.spec}  (${s.bucket})`)
  }
  const n = specs.filter((s) => s.identifier).length
  lines.push(`  ${n}/${specs.length} linked`)
  out.write(lines.join('\n') + '\n')
}

// Phase-status warnings for a spec, one formatted line each.
//
// A spec states each phase's status three times — the phase file's h1 emoji, its
// `> **Status:**` line, and the overview phase-index row — and only the h1 is
// read. Get it wrong and the phase projects as `backlog`, pushes cleanly, and is
// recorded as intended: invisible. So every subcommand that reads a projection
// reports these, and none of them treats one as fatal — a legacy spec must still
// push. See sync-core `lintPhases`.
function warningLines(snapshotDir, config) {
  return lintPhases(snapshotDir, config).map((w) => `  warning ${w.file}: ${w.message}`)
}

// Emit warnings on stderr, keeping stdout pure for a machine-readable payload.
function warnToErr(snapshotDir, config, err) {
  const lines = warningLines(snapshotDir, config)
  if (lines.length) err.write(lines.join('\n') + '\n')
}

// Resolve a spec argument to its folder, or null with a message on stdout.
// EVERY failure path here must print and EVERY caller must return a non-zero
// code: /spec-push checks $? before it applies a plan, so a resolve failure that
// exits 0 reads as "nothing to do" rather than "I could not find the spec".
function resolveOrExit(specArg, dir, out) {
  if (!specArg) {
    out.write('spec-sync: no spec given\n')
    return null
  }
  const snapshotDir = resolveSnapshotDir(specArg, dir)
  if (!snapshotDir) {
    out.write(`spec-sync: spec not found: ${specArg}\n`)
    return null
  }
  return snapshotDir
}

// `spec-sync normalize <spec>` — print the local projection as JSON.
function specSyncNormalize(dir, config, specArg, out, err) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  // stdout is the projection and nothing else — callers pipe it into jq.
  warnToErr(snapshotDir, config, err)
  out.write(JSON.stringify(projectionOf(snapshotDir, config), null, 2) + '\n')
}

// `spec-sync push <spec> [--json]` — print the create/update PLAN diffed against
// the last-pushed snapshot. Machine-readable by default; the /spec-push skill
// applies it over MCP then calls `record`.
function specSyncPush(dir, config, specArg, flags, out, err) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  const failure = stateCheckFailure(config, flags)
  if (failure) {
    out.write(failure.join('\n') + '\n')
    return 1
  }
  const identifier = specIdentifier(snapshotDir, config)
  const r = push({ dir, snapshotDir, identifier, config })
  if (flags.json || !out.isTTY) {
    warnToErr(snapshotDir, config, err)
    out.write(JSON.stringify(r.plan, null, 2) + '\n')
    return 0
  }
  const p = r.plan
  const lines = [`spec-sync push: ${identifier}`, ...warningLines(snapshotDir, config)]
  if (p.legacy) lines.push(...legacyLines(p.legacy))
  if (p.phasesDeferred) lines.push(...deferredLines(p.phasesDeferred))
  lines.push(...phaseModeLines(p.phaseMode, r.projection.status))
  if (r.empty) lines.push('  nothing to push — mirror matches the last push')
  else {
    if (p.issue) lines.push('  issue: description/state')
    if (p.subIssues.create.length) lines.push(`  sub-issues create: ${p.subIssues.create.map((s) => s.name).join(', ')}`)
    if (p.subIssues.update.length) lines.push(`  sub-issues update: ${p.subIssues.update.map((s) => s.id).join(', ')}`)
    lines.push('  (run with --json for the full plan the skill applies)')
  }
  out.write(lines.join('\n') + '\n')
  return 0
}

// `mapping.phases: 'deferred'` is holding phases back. Said plainly wherever a
// plan or a status report is printed, because the alternative reading of a spec
// with no sub-issues is that its phase files failed to parse.
function deferredLines(n) {
  return [
    `  ${n} phase(s) deferred — mapping.phases is "deferred" and this spec has not started`,
    '     they are created on the push that follows /spec-go',
  ]
}

// Which phase mode resolved for this spec, and what it means for the plan below.
//
// Silent for `subissue`: the sub-issue lines are right there and explain
// themselves. Said for anything else, because `mapping.phases` can now be a
// per-bucket map — so the mode that applied is no longer readable off the config
// without knowing which bucket the spec is in, and the alternative reading of a
// spec with no sub-issues is that its phase files failed to parse.
function phaseModeLines(mode, bucket) {
  if (!mode || mode === 'subissue') return []
  const why = {
    inline: 'each phase is a section of this issue\'s description, not a sub-issue',
    deferred: 'unlinked phases are held back until the spec leaves backlog/cancelled',
  }[mode]
  const where = bucket ? ` for this spec's bucket ("${bucket}")` : ''
  const lines = [`  phases: ${mode} — mapping.phases resolved${where}`]
  if (why) lines.push(`     ${why}`)
  return lines
}

// The pre-9.0 mirror block. Loud on purpose: the plan below it looks entirely
// ordinary — an all-creates plan for a spec that reads as unlinked — and
// applying it mints a second mirror and abandons the first.
function legacyLines(legacy) {
  const found = legacy.keys.length ? legacy.keys.join(', ') : 'a pre-9.0 last-pushed snapshot'
  const where = legacy.files.length ? ` in ${legacy.files.join(', ')}` : ''
  const out = [
    '  !! PRE-9.0 MIRROR — do not apply this plan as-is',
    `     found ${found}${where}`,
  ]
  if (legacy.orphans) {
    const o = legacy.orphans
    out.push(
      `     applying it would orphan ${o.total} live object(s): ` +
        `${o.projects} project(s), ${o.milestones} milestone(s), ${o.issues} task issue(s)`,
    )
  }
  out.push('     migrate first — see MIGRATION.md ("v8 → v9")')
  return out
}

/**
 * Validate the configured `states` names against the workspace, for a command
 * that REFUSES without them.
 *
 * The engine is offline — `mcp.js` is the skill's adapter, not ours — so the
 * names have to be fetched over MCP and handed in via `--workspace-states`. That
 * handoff used to be advisory: `/spec-push` told the agent to run it against
 * `status`, and skipping it sent a state name Linear **silently ignores** (the
 * description lands, the issue never moves, nothing errors). Requiring the file
 * turns the one check that catches it from a convention into a precondition.
 *
 * Returns null when the caller may proceed, or the lines to print before exiting
 * non-zero.
 */
function stateCheckFailure(config, flags) {
  if (flags.skipStateCheck) return null
  if (!flags.workspaceStates) {
    return [
      'spec-sync push: refusing — the configured issue states have not been validated',
      '  pass --workspace-states <file> (a JSON array of the workspace\'s issue',
      '  workflow-state names, which /spec-push fetches over MCP), or',
      '  --skip-state-check to push anyway.',
      '  Linear silently ignores an unknown issue state: the push would look',
      '  clean and the issue would never move.',
    ]
  }
  if (!fs.existsSync(flags.workspaceStates)) {
    return [`spec-sync push: refusing — no such --workspace-states file: ${flags.workspaceStates}`]
  }
  let names
  try {
    names = JSON.parse(fs.readFileSync(flags.workspaceStates, 'utf-8'))
  } catch (error) {
    return [`spec-sync push: refusing — --workspace-states is not valid JSON: ${error.message}`]
  }
  const list = Array.isArray(names) ? names : []
  const missing = validateStates(config, list)
  if (missing.length) {
    // Say what IS available, and what to use instead. "Done is not a state" sends
    // you to the Linear UI to go and look; naming the replacement does not.
    const lines = ['spec-sync push: refusing — configured state name(s) not in the workspace', '']
    for (const { bucket, configured, suggestion } of stateSuggestions(config, list)) {
      lines.push(`  states.${bucket}: "${configured}" is not an issue state in this workspace`)
      if (suggestion) lines.push(`    use "${suggestion}" instead`)
    }
    lines.push(
      '',
      `  available: ${list.join(', ') || '(the workspace reported none)'}`,
      '  Fix specs/.core/linear.config.json → states. Linear silently ignores an',
      '  unknown issue state, so this would have pushed clean and moved nothing.',
    )
    return lines
  }
  return null
}

// A tracker id as it appears in a spec: `SKI-42`. Deliberately strict — the
// whole point of `stamp` is that a mistyped id is caught here rather than
// re-minting a duplicate issue on the next push.
const ID_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/

// Resolve a `--sub` ref to a phase file in the spec folder. Accepts the ref as
// the plan emits it (`01-outbox`) or with its extension (`01-outbox.md`).
function resolvePhaseFile(snapshotDir, ref) {
  const want = String(ref).replace(/\.md$/, '')
  return listPhaseFiles(snapshotDir).find((f) => f.replace(/\.md$/, '') === want) || null
}

/**
 * `spec-sync stamp <spec> --issue KEY-N [--url URL] --sub <ref>=KEY-M …`
 *
 * Write the ids a push just returned back into the spec: `linear_identifier` /
 * `linear_url` onto the overview, `linear_issue_id` onto each phase file. This
 * was prose in `/spec-push` telling the agent to hand-edit N files — the step
 * most likely to go wrong at scale, because one mistyped id makes the next push
 * treat the phase as unlinked and mint a duplicate issue.
 *
 * Validates EVERYTHING before writing ANYTHING: a bad ref or id fails the whole
 * command with nothing touched. A half-stamped spec is worse than an unstamped
 * one — it looks linked while pointing at the wrong object.
 *
 * `record` stays a separate call: this writes the repo, that writes the snapshot,
 * and the skill sequences them.
 */
function specSyncStamp(dir, config, specArg, flags, out) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1

  const problems = []
  if (flags.issue != null && !ID_RE.test(flags.issue)) {
    problems.push(`--issue ${flags.issue} is not an id like SKI-42`)
  }
  if (flags.url != null && !/^https?:\/\//.test(flags.url)) {
    problems.push(`--url ${flags.url} is not an http(s) URL`)
  }

  const subs = []
  for (const raw of flags.subs) {
    const eq = String(raw).indexOf('=')
    if (eq === -1) {
      problems.push(`--sub ${raw} is not <ref>=<id> (e.g. --sub 01-outbox=SKI-43)`)
      continue
    }
    const ref = raw.slice(0, eq)
    const id = raw.slice(eq + 1)
    const file = resolvePhaseFile(snapshotDir, ref)
    if (!file) problems.push(`--sub ${ref}: no phase file in ${path.relative(dir, snapshotDir)}`)
    if (!ID_RE.test(id)) problems.push(`--sub ${ref}=${id}: not an id like SKI-42`)
    if (file && ID_RE.test(id)) subs.push({ ref, id, file })
  }

  if (!problems.length && flags.issue == null && !subs.length) {
    problems.push('nothing to stamp — pass --issue and/or --sub <ref>=<id>')
  }

  if (problems.length) {
    // Every problem at once: fixing them one round-trip at a time is the same
    // slow hand-editing this command replaces.
    out.write(['spec-sync stamp: refusing to write — nothing was changed', ...problems.map((p) => `  ${p}`)].join('\n') + '\n')
    return 1
  }

  const lines = [`spec-sync stamp: ${path.relative(dir, snapshotDir)}`]
  if (flags.issue != null || flags.url != null) {
    const written = writeFrontmatter(snapshotDir, config, {
      linear_identifier: flags.issue,
      linear_url: flags.url,
    })
    lines.push(`  overview: ${written.join(', ')}`)
  }
  for (const s of subs) {
    stampSubIssueId(snapshotDir, s.file, s.id)
    lines.push(`  ${s.file}: linear_issue_id = ${s.id}`)
  }
  lines.push('  next: skitterspec spec-sync record <spec>')
  out.write(lines.join('\n') + '\n')
  return 0
}

// `spec-sync record <spec>` — write the last-pushed snapshot from the CURRENT
// files. The skill calls this AFTER applying the plan and stamping new ids.
function specSyncRecord(dir, config, specArg, out) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  const identifier = specIdentifier(snapshotDir, config)
  const file = recordPush({ dir, snapshotDir, identifier, config })
  out.write(`spec-sync record: snapshot written → ${path.relative(dir, file)}\n`)
}

// `spec-sync status <spec> [--remote file] [--workspace-states file]` — read-only
// drift report. Never writes. Reports: (a) whether the spec changed since the last
// push (there is something to push), and (b) with --remote, whether Linear's
// workflow-state differs from the spec's. With --workspace-states, validates the
// configured state names and fails loudly on a typo Linear would silently no-op.
function specSyncStatus(dir, config, specArg, flags, out) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  const identifier = specIdentifier(snapshotDir, config)
  const lines = [`spec-sync status: ${identifier}`, ...warningLines(snapshotDir, config)]

  if (flags.workspaceStates && fs.existsSync(flags.workspaceStates)) {
    const names = JSON.parse(fs.readFileSync(flags.workspaceStates, 'utf-8'))
    const missing = validateStates(config, Array.isArray(names) ? names : [])
    if (missing.length) {
      out.write(
        `spec-sync status: ERROR — configured state name(s) not in the workspace: ${missing.join(', ')}. ` +
          `Linear silently ignores an unknown issue state; fix specs/.core/linear.config.json.\n`,
      )
      return 1
    }
    lines.push('  states: all configured names exist in the workspace')
  }

  const projection = projectionOf(snapshotDir, config)
  const snapshot = readBase(dir, identifier, config)
  const plan = planChanges(projection, snapshot)
  // From the projection, not the plan: `status` builds its plan with
  // `planChanges` directly rather than going through `push`.
  if (projection.phasesWithheld) lines.push(...deferredLines(projection.phasesWithheld))
  lines.push(...phaseModeLines(projection.phaseMode, projection.status))
  if (!snapshot) lines.push('  push: never pushed — everything is pending')
  else if (isEmptyPlan(plan)) lines.push('  push: up to date — nothing changed since the last push')
  else {
    const n = plan.subIssues.create.length
    const u = plan.subIssues.update.length
    lines.push(`  push: pending — ${n} to create, ${u} to update${plan.issue ? ', issue changed' : ''}`)
  }

  if (flags.remote && fs.existsSync(flags.remote)) {
    const remote = JSON.parse(fs.readFileSync(flags.remote, 'utf-8'))
    const rState = remoteWorkflowState(remote, config)
    const lState = projection.status
    if (rState && lState && rState !== lState) {
      lines.push(`  drift: Linear workflow-state is "${rState}" but the spec is "${lState}" (repo wins on next push)`)
    } else {
      lines.push('  drift: none — Linear workflow-state matches the spec')
    }
  }

  out.write(lines.join('\n') + '\n')
  return 0
}

/**
 * `spec-sync verify <spec> --stored <file>` — compare what the tracker STORED
 * against what we sent, and report any lost text.
 *
 * Not a pull: it merges nothing and writes nothing (see sync-core `verify.js`).
 * The engine is offline, so `/spec-push` does the read over MCP and hands the
 * result over in a file — the same split `--workspace-states` uses. The file is
 * `{ "issue": "…", "subIssues": { "<ref>": "…" } }`; any key may be omitted.
 *
 * Warns, never fails (exit 0). The mirror is generated and disposable, and a
 * hard failure after the plan is applied would strand it half-written.
 */
function specSyncVerify(dir, config, specArg, flags, out) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return 1
  if (!flags.stored) {
    out.write(
      'spec-sync verify: refusing to run without --stored <file>.\n' +
        '  The engine is offline: /spec-push reads each description back over MCP\n' +
        '  and writes {"issue": "…", "subIssues": {"<ref>": "…"}} for this command.\n',
    )
    return 1
  }
  // A `.base.json` is the LAST-PUSHED SNAPSHOT, not a read-back: it stores
  // content HASHES keyed by identifier, never description text. Passed as
  // `--stored` it parses fine and compares a description against a hash, so the
  // report is confidently, entirely wrong — a real field run read "5045
  // character(s) lost" off an intact mirror. Refused here rather than only
  // documented, because a guard is enforceable and prose is not.
  const snapshotRoot = path.resolve(dir, config.sync.baseDir)
  const isSnapshot =
    flags.stored.endsWith('.base.json') || !path.relative(snapshotRoot, flags.stored).startsWith('..')
  if (isSnapshot) {
    out.write(
      `spec-sync verify: ${path.relative(dir, flags.stored)} is a last-pushed snapshot, not a read-back.\n` +
        '  It holds content hashes keyed by identifier — comparing one against a\n' +
        '  description reports enormous bogus losses on a perfectly intact mirror.\n' +
        '  --stored wants what the tracker CURRENTLY holds:\n' +
        '    {"issue": "…", "subIssues": {"<ref>": "…"}}\n' +
        '  /spec-push reads that back over MCP and writes it for this command.\n',
    )
    return 1
  }
  let stored
  try {
    stored = JSON.parse(fs.readFileSync(flags.stored, 'utf-8'))
  } catch (error) {
    out.write(`spec-sync verify: cannot read --stored ${flags.stored}: ${error.message}\n`)
    return 1
  }

  const identifier = specIdentifier(snapshotDir, config)
  out.write(verifyLines(snapshotDir, config, stored, identifier).join('\n') + '\n')
  return 0
}

/**
 * The verify comparison itself, as reportable lines.
 *
 * Split out of `specSyncVerify` so `apply` runs the SAME check on the read-back
 * it does itself, rather than a second implementation that could disagree about
 * what counts as lost text.
 */
function verifyLines(snapshotDir, config, stored, identifier) {
  const projection = projectionOf(snapshotDir, config)
  const checks = []
  if (typeof stored.issue === 'string') checks.push(['issue', projection.description, stored.issue])
  for (const [ref, text] of Object.entries(stored.subIssues || {})) {
    const sub = projection.subIssues.find((s) => s.ref === ref)
    if (!sub) {
      checks.push([`sub-issue ${ref}`, null, text])
      continue
    }
    checks.push([`sub-issue ${ref}`, sub.goal, text])
  }

  const lines = [`spec-sync verify: ${identifier}`]
  let bad = 0
  for (const [label, sent, got] of checks) {
    if (sent == null) {
      lines.push(`  ?? ${label}: read back, but the projection has no such phase — stale ref?`)
      bad++
      continue
    }
    const r = compareStored(sent, got)
    if (r.ok) continue
    bad++
    lines.push(
      `  !! ${label}: the tracker stored different text — ${Math.abs(r.lost)} character(s) ` +
        `${r.lost > 0 ? 'lost' : 'added'}, first difference at ${r.at}`,
      `     sent:   …${r.sentContext}…`,
      `     stored: …${r.storedContext}…`,
    )
  }
  if (!bad) lines.push(`  ${checks.length} description(s) round-tripped intact`)
  else lines.push('     the repo is unchanged and still correct; re-push to overwrite the mirror')
  return lines
}

/**
 * `spec-sync doctor [--json]` — is this project set up, across every layer?
 *
 * The scaffold, isolation, the tracker config and the key are each checked by a
 * different command or by none, so nothing answered the whole question. This
 * does, and every failing row names the command that fixes it.
 *
 * The report itself is `doctor.js`, which is pure — this half only GATHERS. It
 * is the one place allowed to touch the filesystem for that, and it must not
 * throw doing it: a doctor that dies on a malformed config is useless on exactly
 * the repo that needs it. So every read is wrapped, and a parse failure becomes
 * a `broken` row rather than a stack trace.
 *
 * Dispatched BEFORE the config load for the same reason (like `init-config`):
 * the loader throws on malformed JSON and the dispatcher short-circuits when no
 * config exists, so a doctor sitting after it could never report the two states
 * it most needs to.
 */
async function specSyncDoctor(dir, flags, out) {
  const state = gatherState(dir, flags)
  if (flags.remoteCheck) state.remote = await checkRemote(state, flags)

  const report = runChecks(state)

  if (flags.json) {
    out.write(JSON.stringify(report, null, 2) + '\n')
    return report.ok ? 0 : 1
  }

  const width = Math.max(...report.checks.map((c) => c.label.length))
  const lines = ['skitterspec doctor:']
  for (const c of report.checks) {
    lines.push(`  ${c.label.padEnd(width)}  ${c.state.padEnd(8)} ${c.detail}`)
    // The fix sits under the row it belongs to, indented past the state column,
    // so a wall of rows still reads as "this one, and here is the command".
    if (c.fix) lines.push(`  ${' '.repeat(width)}  ${' '.repeat(8)} → ${c.fix}`)
  }
  // Everything not `ok`/`skipped` needs a human's attention — including a
  // `missing` one, which is why the count and the EXIT CODE differ: a declined
  // opt-in is worth reporting but must not fail the run (see `runChecks`).
  const attention = report.checks.filter((c) => c.state === 'broken' || c.state === 'missing').length
  lines.push('')
  lines.push(attention ? `  ${attention} check(s) need attention.` : '  ready.')

  out.write(lines.join('\n') + '\n')
  return report.ok ? 0 : 1
}

/**
 * The live half of the report: one `team(id:)` call proving the id resolves and
 * the key is accepted. Well-formed config is not working config.
 *
 * Opt-in because it is the only part that needs the network — the offline checks
 * have to stay usable with no connectivity, which is exactly when a setup
 * problem is most annoying to diagnose.
 *
 * **No API message is ever relayed.** A GraphQL error body can echo the request
 * back, and this is a command a skill prints; so a failure is CLASSIFIED into a
 * short reason of our own words.
 */
async function checkRemote(state, flags) {
  if (!state.tracker.parsed || !state.tracker.teamId) {
    return { checked: true, skipped: true, reason: 'no usable tracker config to check against' }
  }
  if (!state.key.ok) {
    return { checked: true, skipped: true, reason: 'no key, so there is nothing to check with' }
  }

  const key = resolveApiKey(state._config, flags.env || process.env)
  const adapter = flags.adapter || makeApiAdapter({ apiKey: key.key, fetch: flags.fetch })
  let team
  try {
    team = await adapter.readTeam(state.tracker.teamId)
  } catch (error) {
    const failure = classifyRemoteFailure(error)
    // NEVER ANSWERED is not the same as ANSWERED NO. An unreachable API or a
    // rate-limit means the check did not run — the setup is unexamined, not
    // wrong — so it reports `skipped`, the same state as "you didn't ask for
    // it". Calling it `broken` exited 1 on a healthy project that merely had no
    // network, and every skill branching on that code failed with it.
    if (failure.reached === false) return { checked: true, skipped: true, reason: failure.reason }
    return { checked: true, ok: false, ...failure }
  }
  if (!team || !team.key) {
    return {
      checked: true,
      ok: false,
      reason: 'the key was accepted, but no team has that id',
      fix: '/spec-linear-setup',
    }
  }
  return { checked: true, ok: true, teamKey: team.key, recordedKey: state.tracker.teamKey }
}

// Map a thrown API error onto our own short reason. Matched on the shapes
// `api.js` raises; anything unrecognised degrades to a generic line rather than
// leaking the message.
//
// BLIND SPOT: matching on message text, so an api.js rewording lands here as the
// unrecognised case. That is why the fallback stays `broken` — Linear ANSWERED
// and refused, which is evidence of a problem even when we cannot name it. Only
// a request that got no answer at all (`reached: false`) is un-evidence.
function classifyRemoteFailure(error) {
  const m = String((error && error.message) || '')
  if (/rejected the API key|HTTP 401|HTTP 403/.test(m)) {
    return { reason: 'Linear rejected the key — it may be revoked or for another workspace', fix: 'skitterspec spec-sync credentials set' }
  }
  // `reached: false` — the request never got an answer, so it says nothing about
  // whether this project is set up correctly. See the caller.
  if (/unreachable/.test(m)) {
    return { reason: 'Linear could not be reached — check your connection', fix: null, reached: false }
  }
  if (/rate-limited/.test(m)) {
    return { reason: 'Linear rate-limited the request and did not recover', fix: null, reached: false }
  }
  if (/Entity not found|not found/i.test(m)) {
    return { reason: 'no team with that id in this workspace', fix: '/spec-linear-setup' }
  }
  return { reason: 'Linear did not accept the request', fix: null }
}

// Read the project's real state for `runChecks`. Never throws: every probe that
// can fail reports the failure as data.
function gatherState(dir, flags) {
  const state = { scaffold: {}, isolation: {}, tracker: {}, key: {}, remote: { checked: false } }

  const specs = path.join(dir, 'specs')
  state.scaffold.specsDir = fs.existsSync(specs)
  if (state.scaffold.specsDir) {
    state.scaffold.core = fs.existsSync(path.join(specs, '.core'))
    // Reported for context only — a missing bucket is normal (see scaffoldCheck).
    state.scaffold.buckets = BUCKETS.filter((b) => fs.existsSync(path.join(specs, b)))
    state.scaffold.skills = countSkills(dir)
  }

  const envFile = path.join(dir, 'specs', '.core', 'env.config.json')
  state.isolation.present = fs.existsSync(envFile)
  if (state.isolation.present) {
    try {
      JSON.parse(fs.readFileSync(envFile, 'utf-8'))
      state.isolation.parsed = true
    } catch (error) {
      state.isolation.parsed = false
      state.isolation.error = error.message
    }
  }

  state.tracker.present = fs.existsSync(path.join(dir, CONFIG_FILE))
  let config = null
  if (state.tracker.present) {
    try {
      config = loadLinearConfig(dir).config
      state.tracker.parsed = true
      state.tracker.teamId = (config.linear && config.linear.teamId) || ''
      state.tracker.teamKey = (config.linear && config.linear.teamKey) || ''
    } catch (error) {
      state.tracker.parsed = false
      state.tracker.error = error.message
    }
  }

  // Without a parsed config there is no `auth.keyEnv` and no team to key on, so
  // there is nothing to look up — the key row reports as skipped instead.
  if (config) {
    const resolved = resolveApiKey(config, flags.env || process.env)
    // A key resolves from the environment, the store, or a `keyCommand` the
    // store runs — `resolveApiKey` covers all three, so the row must not be read
    // as "env var unset".
    //
    // When it does NOT resolve, `resolveApiKey` appends the reason on later
    // lines: a store that is world-readable, or a keyCommand that failed.
    // Dropping it reported a broken command as `no key for SKS` and sent the
    // user to set a key they had already set (`credentials status` keeps it for
    // the same reason).
    const why = resolved.ok ? '' : resolved.error.split('\n').slice(1).map((l) => l.trim()).filter(Boolean).join('; ')
    state.key = resolved.ok
      ? { ok: true, source: resolved.source === 'env' ? `the environment (${resolved.envVar})` : resolved.source, fingerprint: fingerprint(resolved.key) }
      : { ok: false, error: `no key for ${state.tracker.teamKey || state.tracker.teamId}${why ? ` — ${why}` : ''}` }
  }

  state._config = config
  return state
}

// How many skills are installed in the target project.
function countSkills(dir) {
  const skills = path.join(dir, '.claude', 'skills')
  try {
    return fs
      .readdirSync(skills, { withFileTypes: true })
      .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && fs.existsSync(path.join(skills, e.name, 'SKILL.md')))
      .length
  } catch {
    return 0
  }
}

/**
 * `spec-sync retarget [--yes]` — repoint a mirror after a team-key rename.
 *
 * Renaming a Linear team rewrites the key in every issue identifier, and the
 * repo stamps those in three places. Nothing moved them, so afterwards
 * `/spec-push` fails with `no Linear issue found for SKI-7` — the right failure,
 * with no way out but a hand rewrite (done twice by hand on 2026-09-02).
 *
 * The rewrite itself is provider-neutral and lives in `sync-core/retarget.js`.
 * Only two things here touch Linear:
 *
 * 1. **Detection.** `teamId` survives a rename, so ask Linear for that team's
 *    CURRENT key and compare it with the recorded one. A difference IS the
 *    rename. It is never taken as an argument: nothing stops a typo rewriting
 *    every stamp to a key that does not exist.
 * 2. **One spot-check.** Resolve the first remapped identifier and compare its
 *    TITLE to the spec's. That is what makes the number-preservation assumption
 *    safe, and it tests identity rather than mere existence — `SKS-7` existing
 *    does not make it the issue that was `SKI-7`. One read, which is also what
 *    keeps the MCP path viable.
 */
async function specSyncRetarget(dir, config, flags, out) {
  const teamId = (config.linear && config.linear.teamId) || ''
  if (!teamId) {
    out.write('spec-sync retarget: no linear.teamId in specs/.core/linear.config.json — nothing to compare against.\n')
    return 1
  }

  const recorded = deriveRecordedKey(dir, config)
  if (!recorded.key) {
    out.write(`spec-sync retarget: cannot tell which key this repo is stamped with.\n  ${recorded.reason}\n`)
    return 1
  }

  const key = resolveApiKey(config, flags.env || process.env)
  const transport = flags.via || (config.apply && config.apply.transport) || (key.ok ? 'api' : 'mcp')

  // Linear's MCP `get_team` does not return the team key (observed 2026-09-02),
  // so the one fact detection needs is unavailable there. Report what IS known
  // and let the operator supply it, rather than guessing or silently skipping.
  if (transport === 'mcp') {
    out.write(
      [
        'spec-sync retarget: transport = mcp — cannot read the team key (nothing was changed)',
        `  ${key.ok ? '--via mcp was requested' : key.error}`,
        `  recorded key: ${recorded.key} (from ${recorded.source})`,
        "  Linear's MCP get_team does not return a team key, so a rename cannot be detected here.",
        '  Confirm the current key in Linear, then set an API key and re-run for the plan.',
      ].join('\n') + '\n',
    )
    return 1
  }

  const adapter = flags.adapter || makeApiAdapter({ apiKey: key.key, fetch: flags.fetch })
  let team
  try {
    team = await adapter.readTeam(teamId)
  } catch (error) {
    out.write(`spec-sync retarget: could not read the team: ${error.message}\n`)
    return 1
  }
  if (!team || !team.key) {
    out.write(`spec-sync retarget: Linear returned no team for ${teamId}\n`)
    return 1
  }

  const header = [
    `spec-sync retarget: team ${teamId} (${team.name || team.key})`,
    `  recorded key: ${recorded.key}  (from ${recorded.source})`,
    `  linear  key:  ${team.key}${team.key === recorded.key ? '' : '   <- renamed'}`,
  ]

  if (team.key === recorded.key) {
    out.write([...header, '', '  already current — nothing to retarget'].join('\n') + '\n')
    return 0
  }

  const plan = planRetarget({ dir, oldKey: recorded.key, newKey: team.key, config })
  if (isEmptyRetarget(plan)) {
    out.write([...header, '', '  the key moved, but nothing in the repo is stamped with it'].join('\n') + '\n')
    return 0
  }

  // Spot-check BEFORE reporting the plan as safe: a wrong mapping is caught
  // here, not after the files have moved.
  const check = await spotCheck({ dir, config, plan, adapter, oldKey: recorded.key, newKey: team.key })
  const lines = [
    ...header,
    '',
    '  would rewrite:',
    `    ${plan.stamps.length} frontmatter stamp(s)  (linear_identifier, linear_url, linear_issue_id)`,
    `    ${plan.snapshots.length} base snapshot(s)      (rename + re-key subIssues)`,
    `    ${plan.configKey ? 1 : 0} config key            (linear.teamKey)`,
    '',
    `  spot-check: ${check.line}`,
  ]

  if (!check.ok) {
    lines.push('  refusing — the mapping is not safe to apply')
    out.write(lines.join('\n') + '\n')
    return 1
  }

  if (!flags.yes) {
    lines.push('  dry-run — re-run with --yes to apply.')
    out.write(lines.join('\n') + '\n')
    return 0
  }

  const dirty = dirtyPaths(dir)
  if (dirty === null) {
    lines.push('  --yes refused: not a git repository, so the rewrite would not be reviewable')
    out.write(lines.join('\n') + '\n')
    return 1
  }
  if (dirty.length) {
    lines.push(`  --yes refused: ${dirty.length} uncommitted change(s) — commit or stash first`)
    for (const d of dirty.slice(0, 10)) lines.push(`           ${d}`)
    if (dirty.length > 10) lines.push(`           … and ${dirty.length - 10} more`)
    lines.push('           the rewrite must land as one reviewable, revertable change')
    out.write(lines.join('\n') + '\n')
    return 1
  }

  const changed = applyRetarget(plan, { dir, config })
  lines.push(
    '  applied:',
    `    ${changed.files.length} spec file(s)`,
    `    ${changed.snapshots.length} snapshot(s) moved`,
    ...(changed.configKey ? ['    config linear.teamKey'] : []),
    "  nothing was pushed — only the repo's stamps moved; the mirror is untouched.",
    '  review the diff, then commit it.',
  )
  out.write(lines.join('\n') + '\n')
  return 0
}

/**
 * Resolve the first remapped SPEC issue and compare its title to the spec's.
 *
 * Deliberately ONE read. Checking every ref instead would cost a request each
 * (~198 on a real repo), force an MCP refusal, and still only prove the issues
 * exist — not that they are the same issues.
 */
async function spotCheck({ dir, config, plan, adapter, oldKey, newKey }) {
  const overviewFile = (config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const stamp = plan.stamps.find((s) => path.basename(s.file) === overviewFile)
  if (!stamp) return { ok: true, line: 'skipped — no spec issue in the plan to check' }

  const before = parseFrontmatter(stamp.from).data.linear_identifier
  if (!before) return { ok: true, line: 'skipped — no linear_identifier in the plan to check' }
  const from = String(before).trim()
  const to = `${newKey}-${from.slice(oldKey.length + 1)}`

  let issue
  try {
    issue = await adapter.readIssue(to)
  } catch (error) {
    return { ok: false, line: `${to} could not be read — ${error.message}` }
  }
  if (!issue) return { ok: false, line: `${from} → ${to}, but ${to} does not exist in Linear` }

  const expected = readSnapshot(path.dirname(path.join(dir, stamp.file)), config).title
  const got = issue.title || ''
  if (expected && got && expected.trim() !== got.trim()) {
    return { ok: false, line: `${to} resolves, but its title is "${got}" — the spec's is "${expected}"` }
  }
  return { ok: true, line: `${to} resolves, title matches the spec` }
}

/**
 * `spec-sync states [--json]` — which transport this repo will use, and on the
 * API path the workspace's issue state NAMES.
 *
 * This exists to break a chicken-and-egg in `/spec-push`: the skill cannot know
 * whether to do MCP work until it knows the transport, but `push` refuses to run
 * without `--workspace-states`, which on the MCP path only an MCP call can
 * supply. Asking the engine first makes the skill linear, and on the API path it
 * removes the state fetch from the model's work entirely — the same reason
 * `apply` exists.
 *
 * Read-only: fetches states, writes nothing, changes nothing.
 */
async function specSyncStates(dir, config, flags, out) {
  const key = resolveApiKey(config, flags.env || process.env)
  const transport = flags.via || (config.apply && config.apply.transport) || (key.ok ? 'api' : 'mcp')

  if (transport === 'mcp') {
    if (flags.json) {
      out.write(JSON.stringify({ transport: 'mcp', reason: key.ok ? 'requested' : key.error, states: null }, null, 2) + '\n')
      return 0
    }
    out.write(
      [
        'spec-sync states: transport = mcp',
        `  ${key.ok ? '--via mcp was requested' : key.error}`,
        '  fetch the workspace states over MCP, as /spec-push describes',
      ].join('\n') + '\n',
    )
    return 0
  }
  if (!key.ok) {
    out.write(`spec-sync states: refusing — ${key.error}\n`)
    return 1
  }

  const adapter = flags.adapter || makeApiAdapter({ apiKey: key.key, fetch: flags.fetch })
  const teamId = (config.linear && config.linear.teamId) || null
  let names
  try {
    names = await fetchWorkspaceStates(adapter, teamId)
  } catch (error) {
    out.write(`spec-sync states: ${error.message}\n`)
    return 1
  }
  if (flags.json) {
    // The bare array `--workspace-states` takes, so this can be piped into it.
    out.write(JSON.stringify(names, null, 2) + '\n')
    return 0
  }
  out.write(`spec-sync states: transport = api\n  ${names.join(', ')}\n`)
  return 0
}

/**
 * `spec-sync apply <spec> --plan <file> [--via api|mcp] [--project <id>]`
 *
 * Apply a push plan to Linear **without any description passing through the
 * agent**. `/spec-push` used to hand the plan to the model, which re-emitted
 * every description as generated tokens — twice, once to write and once for the
 * verify read-back — making throughput a function of decode speed rather than of
 * Linear's API. This does the writes, the read-back, the stamping and the
 * snapshot in one call.
 *
 * Two guarantees shape the code:
 *
 *   - **Nothing is written until everything is checked.** A legacy plan, a
 *     missing key, or a `config.states` name the workspace lacks all fail before
 *     the first mutation. A half-applied plan is the one outcome worse than an
 *     unapplied one.
 *   - **Each id is stamped the moment its object exists**, not batched at the
 *     end. An interrupted run therefore leaves the objects it did create linked,
 *     so the next run's plan sees them as updates and mints no duplicates. That
 *     is the whole resumability story — there is no separate ledger to disagree
 *     with the spec files.
 *
 * On the MCP transport it writes nothing and prints the plan for the skill to
 * apply, exactly as before.
 */
/**
 * `spec-sync projects [--json]` — the team's Linear Projects, for the picker.
 *
 * The picker is the one interactive step in linking a spec, and on the API path
 * there is no MCP tool to list from — the whole point of that path is that the
 * agent makes no Linear calls. So the engine offers the list, exactly as
 * `spec-sync states` offers workspace states.
 *
 * Degrades rather than blocks: no key, or a Linear that will not answer, exits 0
 * with an empty list and says why. A missing picker must never fail `/spec`.
 */
async function specSyncProjects(dir, config, flags, out) {
  const key = resolveApiKey(config, flags.env || process.env)
  const transport = flags.via || (config.apply && config.apply.transport) || (key.ok ? 'api' : 'mcp')
  const teamId = (config.linear && config.linear.teamId) || null

  const degrade = (reason) => {
    if (flags.json) out.write(JSON.stringify({ transport, projects: null, reason }, null, 2) + '\n')
    else out.write(`spec-sync projects: ${reason}\n`)
    return 0
  }
  if (transport === 'mcp') {
    return degrade(
      `transport = mcp — ${key.ok ? '--via mcp was requested' : key.error}; list projects over MCP instead`,
    )
  }
  if (!key.ok) return degrade(key.error)

  const adapter = flags.adapter || makeApiAdapter({ apiKey: key.key, fetch: flags.fetch })
  let projects
  try {
    projects = await adapter.listProjects(teamId)
  } catch (error) {
    // The picker's contract is "degrade, never block" — a project list we cannot
    // fetch means no picker, not a failed link.
    return degrade(`could not list projects (${error.message}); continuing without the picker`)
  }
  const rows = projects.map((p) => ({ id: p.id, name: p.name })).filter((p) => p.id)
  if (flags.json) {
    out.write(JSON.stringify({ transport: 'api', projects: rows }, null, 2) + '\n')
    return 0
  }
  out.write(
    [`spec-sync projects: transport = api, ${rows.length} project(s)`, ...rows.map((p) => `  ${p.id}  ${p.name}`)].join('\n') + '\n',
  )
  return 0
}

/**
 * Apply one spec's plan. Returns what happened rather than printing it, so the
 * single-spec command and the bulk loop report in their own voices while sharing
 * one implementation of the part that actually matters.
 *
 * Every id is stamped the moment its object exists — see `specSyncApply`.
 */
async function applyOneSpec({ dir, config, snapshotDir, plan, adapter, teamId, project, states }) {
  const overviewFile = (config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const identifier = linkedIdentifier(path.join(snapshotDir, overviewFile))
  const lines = []
  const result = { issue: null, subIssues: {} }
  const stateId = (bucket) => (bucket ? stateIdFor(bucket, config, states) : null)

  // Resolve every state id BEFORE the first write, so a bad config.states value
  // cannot strand the spec mid-apply.
  const wanted = new Set()
  if (plan.issue && plan.issue.state) wanted.add(plan.issue.state)
  for (const s of (plan.subIssues && plan.subIssues.create) || []) if (s.state) wanted.add(s.state)
  for (const s of (plan.subIssues && plan.subIssues.update) || []) if (s.state) wanted.add(s.state)
  for (const bucket of wanted) stateId(bucket)

  // 1. The spec issue. No identifier yet → this push mints it.
  let parentId = null
  if (!identifier) {
    const created = await adapter.createIssue(withoutNull({
      title: readSnapshot(snapshotDir, config).title,
      teamId,
      projectId: project || (config.linear && config.linear.projectId) || null,
      description: plan.issue && plan.issue.description,
      stateId: stateId(plan.issue && plan.issue.state),
    }))
    if (!created || !created.identifier) throw new Error('Linear returned no issue for the spec create')
    parentId = created.id
    // Stamped NOW: an interrupt after this point must not mint a second issue.
    writeFrontmatter(snapshotDir, config, { linear_identifier: created.identifier, linear_url: created.url })
    result.issue = { id: created.id, identifier: created.identifier, url: created.url }
    lines.push(`  issue created: ${created.identifier}`)
  } else {
    const existing = await adapter.readIssue(identifier)
    if (!existing || !existing.id) throw new Error(`no Linear issue found for ${identifier}`)
    parentId = existing.id
    result.issue = { id: existing.id, identifier: existing.identifier, url: existing.url }
    if (plan.issue) {
      await adapter.updateIssue(existing.id, withoutNull({
        description: plan.issue.description,
        stateId: stateId(plan.issue.state),
      }))
      lines.push(`  issue updated: ${identifier}`)
    }
  }

  // 2. Sub-issue creates — each stamped as it lands, for the same reason.
  for (const sub of (plan.subIssues && plan.subIssues.create) || []) {
    const created = await adapter.createSubIssue(parentId, withoutNull({
      title: sub.name,
      teamId,
      description: sub.goal,
      stateId: stateId(sub.state),
    }))
    if (!created || !created.identifier) throw new Error(`Linear returned no issue for sub-issue ${sub.ref}`)
    const file = resolvePhaseFile(snapshotDir, sub.ref)
    if (!file) throw new Error(`no phase file for ref ${sub.ref}`)
    stampSubIssueId(snapshotDir, file, created.identifier)
    result.subIssues[sub.ref] = created.identifier
    lines.push(`  sub-issue created: ${sub.ref} → ${created.identifier}`)
  }

  // 3. Sub-issue updates — already linked, nothing to stamp.
  //
  // Keyed by REF, never by id: step 4 matches the read-back against the
  // projection, which keys phases by ref. Keying an update by its id made every
  // updated sub-issue report as a stale ref on every push. A plan written before
  // updates carried a ref still resolves — by id, off the projection.
  const refById = new Map()
  for (const s of projectionOf(snapshotDir, config).subIssues || []) {
    if (s.id != null) refById.set(String(s.id), s.ref)
  }
  for (const sub of (plan.subIssues && plan.subIssues.update) || []) {
    await adapter.updateIssue(sub.id, withoutNull({
      title: sub.name,
      description: sub.goal,
      stateId: stateId(sub.state),
    }))
    result.subIssues[sub.ref || refById.get(String(sub.id)) || sub.id] = sub.id
    lines.push(`  sub-issue updated: ${sub.id}`)
  }

  // 4. Read back what Linear stored and run the SAME check `verify` runs.
  const stored = { issue: undefined, subIssues: {} }
  if (result.issue) {
    const back = await adapter.readIssue(result.issue.id)
    if (back && typeof back.description === 'string') stored.issue = back.description
  }
  for (const [ref, id] of Object.entries(result.subIssues)) {
    const back = await adapter.readIssue(id)
    if (back && typeof back.description === 'string') stored.subIssues[ref] = back.description
  }
  const verify = verifyLines(snapshotDir, config, stored, result.issue ? result.issue.identifier : identifier)
  lines.push(...verify.map((l) => `  ${l}`))
  const lost = verify.some((l) => l.includes('!!') || l.includes('??'))

  // 5. Record the snapshot from the now-stamped files, so the next push is empty.
  const file = recordPush({ dir, snapshotDir, identifier: specIdentifier(snapshotDir, config), config })
  lines.push(`  snapshot: ${path.relative(dir, file)}`)
  return { result, lines, lost }
}

/**
 * `spec-sync apply <spec> --plan <file> [--via api|mcp] [--project <id>]`
 * `spec-sync apply --all <bucket> [--via api|mcp] [--json]`
 *
 * Apply a push plan to Linear **without any description passing through the
 * agent**. `/spec-push` used to hand the plan to the model, which re-emitted
 * every description as generated tokens — twice, once to write and once for the
 * verify read-back — making throughput a function of decode speed rather than of
 * Linear's API. This does the writes, the read-back, the stamping and the
 * snapshot in one call.
 *
 * Two guarantees shape the code:
 *
 *   - **Nothing is written until everything is checked.** A legacy plan, a
 *     missing key, or a `config.states` name the workspace lacks all fail before
 *     the first mutation. A half-applied plan is the one outcome worse than an
 *     unapplied one.
 *   - **Each id is stamped the moment its object exists**, not batched at the
 *     end. An interrupted run therefore leaves the objects it did create linked,
 *     so the next run's plan sees them as updates and mints no duplicates. That
 *     is the whole resumability story — there is no separate ledger to disagree
 *     with the spec files.
 *
 * `--all <bucket>` walks every spec in one lifecycle bucket, computing each plan
 * in process (no plan files) and carrying on past a spec that fails. That is
 * first-time adoption on an established repo: one command instead of a session.
 *
 * On the MCP transport it writes nothing and prints the plan for the skill to
 * apply, exactly as before.
 */
async function specSyncApply(dir, config, specArg, flags, out) {
  const bulk = flags.all != null
  if (bulk && !BUCKETS.includes(flags.all)) {
    out.write(`spec-sync apply: --all ${flags.all} is not a bucket (${BUCKETS.join('|')})\n`)
    return 1
  }

  let snapshotDir = null
  let plan = null
  if (!bulk) {
    snapshotDir = resolveOrExit(specArg, dir, out)
    if (!snapshotDir) return 1
    if (!flags.plan) {
      out.write(
        'spec-sync apply: refusing to run without --plan <file>.\n' +
          '  Get one with: skitterspec spec-sync push <spec> --json > plan.json\n' +
          '  Or apply a whole bucket at once with --all <bucket>.\n',
      )
      return 1
    }
    try {
      plan = JSON.parse(fs.readFileSync(flags.plan, 'utf-8'))
    } catch (error) {
      out.write(`spec-sync apply: cannot read --plan ${flags.plan}: ${error.message}\n`)
      return 1
    }

    // A pre-9.0 mirror reads as unlinked, so its plan is all-creates and applying
    // it would abandon the live objects. The API path must not do that faster
    // than a human can read about it.
    if (plan.legacy) {
      out.write(
        ['spec-sync apply: refusing — this spec is linked under the pre-9.0 model.', ...legacyLines(plan.legacy)].join('\n') + '\n',
      )
      return 1
    }
    if (isEmptyPlan(plan)) {
      out.write('spec-sync apply: nothing to apply — the mirror is up to date.\n')
      return 0
    }
  }

  const key = resolveApiKey(config, flags.env || process.env)
  const transport = flags.via || (config.apply && config.apply.transport) || (key.ok ? 'api' : 'mcp')

  if (transport === 'mcp') {
    if (bulk) {
      // Bulk over MCP is the very thing this command exists to avoid; pretending
      // to support it would hand the model every description in the bucket.
      out.write(
        [
          'spec-sync apply: --all needs the api transport (no writes made here)',
          `  ${key.ok ? '--via mcp was requested' : key.error}`,
          '  push specs one at a time with /spec-push, or set a key and re-run.',
        ].join('\n') + '\n',
      )
      return 1
    }
    out.write(
      [
        'spec-sync apply: transport = mcp (no writes made here)',
        key.ok ? '  --via mcp was requested' : `  ${key.error}`,
        '  apply the plan over MCP as /spec-push describes, then run:',
        '    skitterspec spec-sync stamp <spec> --issue … [--sub <ref>=… …]',
        '    skitterspec spec-sync record <spec>',
      ].join('\n') + '\n',
    )
    return 0
  }
  if (!key.ok) {
    // --via api (or apply.transport: api) was explicit, so this is a failure
    // rather than a quiet fallback — and it happens before any write.
    out.write(`spec-sync apply: refusing — ${key.error}\n`)
    return 1
  }

  const adapter = flags.adapter || makeApiAdapter({ apiKey: key.key, fetch: flags.fetch })
  const teamId = (config.linear && config.linear.teamId) || null
  let states
  try {
    states = await adapter.listIssueStates(teamId)
  } catch (error) {
    out.write(`spec-sync apply: ${error.message}\n`)
    return 1
  }
  const shared = { dir, config, adapter, teamId, project: flags.project, states }

  if (!bulk) {
    const lines = ['spec-sync apply: transport = api']
    let applied
    try {
      applied = await applyOneSpec({ ...shared, snapshotDir, plan })
    } catch (error) {
      // Whatever landed before the failure is already stamped, so re-running
      // resumes rather than duplicating — say so instead of leaving it ambiguous.
      out.write(
        [...lines, `  !! ${error.message}`, '  ids stamped so far are saved — re-run to resume without duplicating'].join('\n') + '\n',
      )
      return 1
    }
    if (flags.json) {
      out.write(JSON.stringify(applied.result, null, 2) + '\n')
      return 0
    }
    out.write([...lines, ...applied.lines].join('\n') + '\n')
    return 0
  }

  // --- bulk -------------------------------------------------------------------
  const overviewFile = (config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const specs = listSpecs(dir, config).filter((s) => s.bucket === flags.all)
  const lines = [`spec-sync apply --all ${flags.all}: transport = api, ${specs.length} spec(s)`]
  const summary = { created: 0, updated: 0, upToDate: 0, failed: 0, altered: 0 }
  const failures = []

  const fail = (spec, why) => {
    summary.failed++
    failures.push(`${spec}: ${why}`)
    lines.push(`  x ${spec}: ${why}`)
  }

  for (const { spec } of specs) {
    const specDir = resolveSnapshotDir(spec, dir)
    if (!specDir) {
      fail(spec, 'could not resolve its folder')
      continue
    }
    let specPlan
    try {
      specPlan = push({ dir, snapshotDir: specDir, identifier: specIdentifier(specDir, config), config }).plan
    } catch (error) {
      fail(spec, error.message)
      continue
    }
    // Never silently: applying this would abandon a live pre-9.0 mirror.
    if (specPlan.legacy) {
      fail(spec, `pre-9.0 mirror — would orphan ${specPlan.legacy.orphanCount} object(s); see MIGRATION.md`)
      continue
    }
    if (isEmptyPlan(specPlan)) {
      summary.upToDate++
      lines.push(`  . ${spec}: up to date`)
      continue
    }
    const minted = !linkedIdentifier(path.join(specDir, overviewFile))
    let applied
    try {
      applied = await applyOneSpec({ ...shared, snapshotDir: specDir, plan: specPlan })
    } catch (error) {
      fail(spec, error.message)
      continue
    }
    if (minted) summary.created++
    else summary.updated++
    const id = applied.result.issue ? applied.result.issue.identifier : '?'
    const subs = Object.keys(applied.result.subIssues).length
    lines.push(`  ok ${spec}: ${minted ? 'created' : 'updated'} ${id}${subs ? ` (+${subs} sub-issue(s))` : ''}`)
    if (applied.lost) {
      summary.altered++
      lines.push(...applied.lines.filter((l) => l.includes('!!') || l.includes('??')))
    }
  }

  lines.push(
    '',
    `  created ${summary.created} · updated ${summary.updated} · up to date ${summary.upToDate} · failed ${summary.failed}`,
  )
  if (summary.altered) {
    lines.push(`  ${summary.altered} spec(s) had text altered by Linear — the repo is unchanged and still correct`)
  }
  if (failures.length) {
    lines.push('', '  failed:')
    for (const f of failures) lines.push(`    ${f}`)
    lines.push('  re-run to retry them — everything already created is linked, so nothing duplicates')
  }
  if (flags.json) out.write(JSON.stringify({ summary, failures }, null, 2) + '\n')
  else out.write(lines.join('\n') + '\n')
  // Non-zero when anything failed, so a scripted backfill is checkable.
  return summary.failed ? 1 : 0
}

// A comma-separated label flag (`--bug-labels bug,defect`) as the trimmed,
// non-empty list the config stores.
function labelList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * `spec-sync init-config --team-id <id> [flags]`
 *
 * Turn values gathered from the workspace into a valid
 * `specs/.core/linear.config.json`. The engine half of `/spec-linear-setup`:
 * the skill discovers over MCP and interviews, this validates and writes, so a
 * malformed config can never be the model's formatting. Same split as
 * `/spec-push` gathering and `spec-sync apply` writing.
 *
 * Three things shape it:
 *
 *   - **Only the keys the operator set are written.** The shipped defaults
 *     already carry every other value; restating them buries the two or three
 *     lines that are genuinely this repo's, and freezes today's defaults into a
 *     file that then never picks up a change to them.
 *   - **Nothing is written until the loader would accept it.** The draft is run
 *     through `mergeConfig` — the very function `loadLinearConfig` uses — so an
 *     enum this rejects is exactly an enum that would have thrown on first use.
 *   - **State names are checked here, not at first push.** Linear silently
 *     ignores an unknown issue state, so a workspace that renamed `Done` gets a
 *     mirror that never moves. `--states` makes that a setup-time failure with
 *     the replacement named.
 *
 * `--states` is optional, and deliberately so: `spec-sync states` cannot run
 * before a config exists (every other subcommand exits early on `present:false`),
 * so requiring it here would make the config unbootstrappable. The skill always
 * passes it from MCP discovery; a bare CLI run without it writes and says
 * loudly that the names are unverified.
 */
function specSyncInitConfig(dir, flags, out) {
  const file = path.join(dir, CONFIG_FILE)
  const rel = CONFIG_FILE
  const existed = fs.existsSync(file)
  const fail = (lines, extra = {}) => {
    if (flags.json) {
      out.write(JSON.stringify({ ok: false, file: rel, error: lines[0], ...extra }, null, 2) + '\n')
    } else {
      out.write(lines.join('\n') + '\n')
    }
    return 1
  }

  if (existed && !flags.force) {
    return fail([
      `spec-sync init-config: refusing — ${rel} already exists`,
      '  pass --force to replace it. Re-running setup on a configured repo is',
      '  meant to be a way to CHECK the setup, not a way to lose it.',
    ])
  }
  if (!flags.teamId) {
    return fail([
      'spec-sync init-config: refusing — --team-id is required',
      '  it is the one value with no useful default: without it nothing knows',
      '  which Linear team a spec files into.',
    ])
  }

  // Only what the operator actually set. Empty strings/arrays are treated as
  // "not set" — the defaults already say that, and more clearly.
  const draft = {}
  const linear = {}
  if (flags.teamId) linear.teamId = flags.teamId
  if (flags.teamKey) linear.teamKey = flags.teamKey
  if (flags.projectId) linear.projectId = flags.projectId
  draft.linear = linear
  const intake = {}
  if (flags.intakeLabel) intake.label = flags.intakeLabel
  if (flags.bugLabels.length) intake.bugLabels = flags.bugLabels
  if (flags.hotfixLabels.length) intake.hotfixLabels = flags.hotfixLabels
  if (Object.keys(intake).length) draft.intake = intake
  if (Object.keys(flags.stateNames).length) draft.states = { ...flags.stateNames }

  for (const bucket of Object.keys(flags.stateNames)) {
    if (!LIFECYCLE_BUCKETS.includes(bucket)) {
      return fail([
        `spec-sync init-config: refusing — --state ${bucket}=… is not a lifecycle bucket`,
        `  expected one of ${LIFECYCLE_BUCKETS.join(', ')}`,
      ])
    }
  }

  // The loader's own merge, so anything it would reject is rejected now rather
  // than on the first command that reads the file.
  let effective
  try {
    effective = mergeConfig(configDefaults(), draft)
  } catch (error) {
    return fail([`spec-sync init-config: refusing — ${error.message}`])
  }

  // Workspace state names, when the caller discovered them.
  let workspace = null
  if (flags.statesFile) {
    if (!fs.existsSync(flags.statesFile)) {
      return fail([`spec-sync init-config: refusing — no such --states file: ${flags.statesFile}`])
    }
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(flags.statesFile, 'utf-8'))
    } catch (error) {
      return fail([`spec-sync init-config: refusing — --states is not valid JSON: ${error.message}`])
    }
    if (!Array.isArray(parsed)) {
      return fail(['spec-sync init-config: refusing — --states must be a JSON array of state names'])
    }
    workspace = parsed.map((s) => String(s)).filter(Boolean)

    const missing = validateStates(effective, workspace)
    if (missing.length) {
      const lines = ['spec-sync init-config: refusing — configured state name(s) not in the workspace', '']
      for (const { bucket, configured, suggestion } of stateSuggestions(effective, workspace)) {
        lines.push(`  states.${bucket}: "${configured}" is not an issue state in this workspace`)
        if (suggestion) lines.push(`    pass --state ${bucket}="${suggestion}"`)
      }
      lines.push(
        '',
        `  available: ${workspace.join(', ') || '(the workspace reported none)'}`,
        '  Linear silently ignores an unknown issue state, so writing this would',
        '  have produced a mirror that never moves.',
      )
      return fail(lines, { missing })
    }
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(draft, null, 2) + '\n', 'utf-8')

  const checked = Object.keys(effective.states).length
  if (flags.json) {
    out.write(
      JSON.stringify(
        {
          ok: true,
          file: rel,
          replaced: existed,
          wrote: draft,
          validated: {
            teamId: flags.teamId,
            states: workspace ? { checked, against: workspace.length, missing: [] } : null,
          },
        },
        null,
        2,
      ) + '\n',
    )
    return 0
  }

  const lines = [`spec-sync init-config: wrote ${rel}`]
  lines.push(`  team:      ${flags.teamKey ? `${flags.teamKey} · ` : ''}${flags.teamId}`)
  lines.push(`  project:   ${flags.projectId || '(none — team only; the picker offers the rest)'}`)
  if (draft.intake) {
    const bits = []
    if (intake.label) bits.push(`inbox "${intake.label}"`)
    if (intake.bugLabels) bits.push(`bug: ${intake.bugLabels.join(', ')}`)
    if (intake.hotfixLabels) bits.push(`hotfix: ${intake.hotfixLabels.join(', ')}`)
    lines.push(`  intake:    ${bits.join(' · ')}`)
  }
  if (workspace) {
    lines.push(`  states:    ${checked} checked against ${workspace.length} workspace state(s) — all present`)
  } else {
    lines.push(`  states:    NOT validated — the defaults (${Object.values(effective.states).join(', ')}) are assumed`)
    lines.push('             pass --states <file> to check them; a renamed state pushes clean and moves nothing')
  }
  lines.push(`  Wrote ${Object.keys(draft).length} section(s); everything else uses the shipped defaults.`)
  out.write(lines.join('\n') + '\n')
  return 0
}

// Drop null/undefined so a GraphQL input never carries a key it has no value
// for — Linear rejects an explicit null where it expects a field to be absent.
function withoutNull(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined) out[k] = v
  return out
}

// --- credentials -------------------------------------------------------------

/**
 * `spec-sync credentials <status|set|unset>` — manage the user-level API key.
 *
 * The split here is deliberate and is the whole point of the feature:
 *
 *   `status`  is SAFE FOR A SKILL TO RUN. It reports readiness and never the
 *             value — path, mode, team, and a masked fingerprint.
 *   `set`     is for a HUMAN, run outside the model. It reads the key from a TTY
 *             with echo off (or `--stdin`), never from argv.
 *
 * A key typed into a chat enters the transcript, is sent to the model and may be
 * logged; moving where a key is STORED is worthless if it travels through the
 * conversation to get there. So nothing in this file ever prints a key, and
 * `--key <value>` is refused rather than supported.
 */
async function specSyncCredentials(dir, config, action, flags, out) {
  const env = flags.env || process.env
  const file = storePath(env)
  const teamId = (config.linear && config.linear.teamId) || ''
  const teamKey = (config.linear && config.linear.teamKey) || ''
  const label = teamKey ? `${teamId} (${teamKey})` : teamId

  if (!teamId) {
    out.write(
      'spec-sync credentials: no linear.teamId in specs/.core/linear.config.json.\n' +
        '  The store is keyed by team — run `spec-sync init-config` first.\n',
    )
    return 1
  }

  if (action === 'status' || !action) return credentialsStatus(dir, config, file, label, flags, out)
  if (action === 'set') return credentialsSet(file, teamId, label, flags, out)
  if (action === 'unset') return credentialsUnset(file, teamId, label, out)

  out.write('Usage: skitterspec spec-sync credentials <status|set|unset> [--stdin] [--json]\n')
  return 1
}

// Readiness only — the command a skill runs. Never prints the key.
function credentialsStatus(dir, config, file, label, flags, out) {
  const resolved = resolveApiKey(config, flags.env || process.env)
  const mode = storeMode(file)
  const present = resolved.ok
  const payload = {
    store: file,
    mode,
    team: label,
    key: present ? { present: true, source: resolved.source, fingerprint: fingerprint(resolved.key) } : { present: false },
  }
  if (flags.json) {
    out.write(JSON.stringify(payload, null, 2) + '\n')
    return present ? 0 : 1
  }

  const lines = ['spec-sync credentials:']
  const strayed = repoConfigKeyCommand(dir)
  if (strayed) {
    lines.push(
      '  note:   a keyCommand in specs/.core/linear.config.json is IGNORED.',
      '          That file is committed, so a command there would run on the',
      '          machine of anyone who cloned the repo. Record it here instead:',
      '            skitterspec spec-sync credentials set --command <cmd>',
    )
  }
  lines.push(`  store:  ${file}${mode ? ` (${mode})` : ' (not created yet)'}`)
  lines.push(`  team:   ${label}`)
  if (present) {
    const where =
      resolved.source === 'env'
        ? `environment (${resolved.envVar})`
        : resolved.source === 'command'
          ? 'keyCommand'
          : 'store'
    lines.push(`  key:    set — ${fingerprint(resolved.key)} from the ${where}`)
    if (resolved.command) lines.push(`  runs:   ${resolved.command}`)
  } else {
    lines.push('  key:    not set')
    // `resolveApiKey` appends a reason when the store or its keyCommand is
    // broken rather than merely absent. Dropping it here would report a failing
    // command as "you never set a key" and send the user to set it again.
    for (const detail of resolved.error.split('\n').slice(1)) {
      if (detail.trim()) lines.push(`  problem:${detail.replace(/^ +/, ' ')}`)
    }
    lines.push('')
    lines.push('  Run this yourself, in your own terminal — not through an assistant:')
    lines.push('    skitterspec spec-sync credentials set')
  }
  out.write(lines.join('\n') + '\n')
  return present ? 0 : 1
}

// The human-facing setter. TTY prompt with echo off, or `--stdin` for a pipe.
async function credentialsSet(file, teamId, label, flags, out) {
  if (flags.keyArgGiven) {
    out.write(
      'spec-sync credentials: --key is not supported, on purpose.\n' +
        '  A secret in the command line is visible in shell history and to `ps`.\n' +
        '  Run `credentials set` with no arguments and paste at the prompt (input\n' +
        '  is hidden), or pipe it: `… | credentials set --stdin`.\n',
    )
    return 1
  }

  // A command is not a secret — it names WHERE the key lives, so unlike --key it
  // is safe on the command line and nothing is prompted for.
  if (flags.command) {
    const r = writeKeyCommand(file, teamId, flags.command)
    if (!r.ok) {
      out.write(`spec-sync credentials: ${r.reason}\n`)
      return 1
    }
    out.write(
      `spec-sync credentials: ${label} will resolve its key by running:\n` +
        `  ${flags.command}\n` +
        `  recorded in ${r.path} (600)\n`,
    )
    return 0
  }

  let key
  if (flags.stdin) {
    const piped = flags.input || process.stdin
    // A TTY on stdin is positive evidence that nothing was piped: `--stdin` then
    // waits for an EOF a terminal never sends, printing nothing while it does.
    // Refuse and name the two working forms rather than blocking forever.
    if (piped.isTTY) {
      out.write(
        'spec-sync credentials: --stdin expects a pipe, but stdin is a terminal.\n' +
          '  Run it without --stdin to be prompted (input is hidden), or pipe the key:\n' +
          '    <command that prints the key> | skitterspec spec-sync credentials set --stdin\n',
      )
      return 1
    }
    key = (await readAllStdin(piped)).trim()
    if (!key) {
      out.write('spec-sync credentials: nothing on stdin — no key stored.\n')
      return 1
    }
  } else {
    const input = flags.input || process.stdin
    if (!input.isTTY) {
      out.write(
        'spec-sync credentials: not a terminal — cannot prompt for a key.\n' +
          '  Run it in your own terminal, or pipe the key with --stdin.\n',
      )
      return 1
    }
    key = (await promptHidden(`Linear personal API key for ${label} (hidden): `, input, out)).trim()
    if (!key) {
      out.write('spec-sync credentials: empty input — no key stored.\n')
      return 1
    }
  }

  const r = writeKey(file, teamId, key)
  if (!r.ok) {
    out.write(`spec-sync credentials: ${r.reason}\n`)
    return 1
  }
  out.write(`spec-sync credentials: key stored for ${label} in ${r.path} (600)\n`)
  return 0
}

function credentialsUnset(file, teamId, label, out) {
  const r = removeKey(file, teamId)
  if (!r.ok) {
    out.write(`spec-sync credentials: ${r.reason}\n`)
    return 1
  }
  out.write(
    r.removed
      ? `spec-sync credentials: removed the key for ${label} from ${r.path}\n`
      : `spec-sync credentials: no key stored for ${label} — nothing to remove\n`,
  )
  return 0
}

// Is a keyCommand set in the REPO's committed config? It is never honoured — the
// loader drops unknown keys — but silently ignoring it would leave someone
// wondering why their command never runs, so `status` calls it out.
function repoConfigKeyCommand(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf-8')
    const parsed = JSON.parse(raw)
    const auth = parsed && parsed.auth
    return auth && typeof auth.keyCommand === 'string' && auth.keyCommand.trim()
      ? auth.keyCommand.trim()
      : null
  } catch {
    return null
  }
}

// Read stdin to completion (for `--stdin`).
function readAllStdin(input) {
  return new Promise((resolve, reject) => {
    let data = ''
    input.setEncoding('utf-8')
    input.on('data', (chunk) => (data += chunk))
    input.on('end', () => resolve(data))
    input.on('error', reject)
  })
}

// Prompt on a TTY with the input hidden. `_writeToOutput` is readline's own echo
// hook — filtering it is what keeps the key off the screen (and out of a
// screen-shared terminal or a recorded session).
//
// READLINE OWNS THE PROMPT, deliberately. Writing it ourselves and then starting
// the interface loses it: readline clears from the cursor to the end of the
// screen (`ESC[0J`) before its first redraw, so the prompt was wiped the instant
// it appeared and the user was left staring at a blank line while the process
// waited for a key — indistinguishable from a hang.
//
// The hook is assigned BEFORE `question`, so the very first redraw goes through
// it. readline hands it `prompt + what has been typed`; re-writing only the
// prompt is what keeps the key hidden while the prompt survives every redraw.
function promptHidden(question, input, out) {
  const readline = require('node:readline')
  return new Promise((resolve) => {
    // `out`, never `process.stdout`: they are the same stream in production, and
    // hardcoding one half meant readline cleared a screen the prompt had not
    // been written to under test — the split that hid this bug from the suite.
    const rl = readline.createInterface({ input, output: out, terminal: true })
    rl._writeToOutput = (s) => {
      if (s.includes(question)) out.write(question)
    }
    rl.question(question, (answer) => {
      out.write('\n')
      rl.close()
      resolve(answer)
    })
  })
}

async function specSync(rest, io = {}) {
  const out = io.out || process.stdout
  const err = io.err || process.stderr
  const [sub, ...args] = rest
  let dir = io.cwd || process.cwd()
  const positional = []
  // Anything `--`-prefixed that no branch below consumed. Collected rather than
  // pushed onto `positional`, where it was silently discarded — see the refusal
  // after the loop.
  const unknownFlags = []
  const flags = { json: false, remote: null, workspaceStates: null, skipStateCheck: false, issue: null, url: null, subs: [], stored: null, plan: null, via: null, project: null, all: null,
    force: false, yes: false, remoteCheck: false, teamId: '', teamKey: '', projectId: '', intakeLabel: '', bugLabels: [], hotfixLabels: [], stateNames: {}, statesFile: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = path.resolve(args[++i])
    else if (args[i] === '--json') flags.json = true
    else if (args[i] === '--remote') flags.remote = path.resolve(args[++i])
    else if (args[i] === '--stored') flags.stored = path.resolve(args[++i])
    else if (args[i] === '--plan') flags.plan = path.resolve(args[++i])
    else if (args[i] === '--via') flags.via = args[++i]
    else if (args[i] === '--all') flags.all = args[++i]
    else if (args[i] === '--project') flags.project = args[++i]
    else if (args[i] === '--workspace-states') flags.workspaceStates = path.resolve(args[++i])
    else if (args[i] === '--skip-state-check') flags.skipStateCheck = true
    else if (args[i] === '--issue') flags.issue = args[++i]
    else if (args[i] === '--url') flags.url = args[++i]
    else if (args[i] === '--sub') flags.subs.push(args[++i])
    else if (args[i] === '--force') flags.force = true
    else if (args[i] === '--yes') flags.yes = true
    else if (args[i] === '--check-remote') flags.remoteCheck = true
    else if (args[i] === '--stdin') flags.stdin = true
    else if (args[i] === '--command') flags.command = String(args[++i] || '').trim()
    else if (args[i] === '--key') {
      // Consumed and DELIBERATELY DISCARDED. A secret in argv is visible in
      // shell history and to `ps`, so this is refused rather than supported —
      // but it must still be swallowed here, or the value would fall through to
      // `positional` and end up printed back in a usage message.
      i++
      flags.keyArgGiven = true
    }
    else if (args[i] === '--team-id') flags.teamId = String(args[++i] || '').trim()
    else if (args[i] === '--team-key') flags.teamKey = String(args[++i] || '').trim()
    else if (args[i] === '--project-id') flags.projectId = String(args[++i] || '').trim()
    else if (args[i] === '--intake-label') flags.intakeLabel = String(args[++i] || '').trim()
    else if (args[i] === '--bug-labels') flags.bugLabels = labelList(args[++i])
    else if (args[i] === '--hotfix-labels') flags.hotfixLabels = labelList(args[++i])
    else if (args[i] === '--state') {
      // `--state complete=Shipped`, repeatable. Only the buckets a workspace
      // actually renamed get written; the rest keep the defaults.
      const [bucket, ...rest] = String(args[++i] || '').split('=')
      flags.stateNames[String(bucket).trim()] = rest.join('=').trim()
    } else if (args[i] === '--states') flags.statesFile = path.resolve(args[++i])
    else if (args[i].startsWith('--')) unknownFlags.push(args[i])
    else positional.push(args[i])
  }
  // REFUSE AN UNKNOWN FLAG, before anything runs.
  //
  // These used to land in `positional` and vanish. That is merely untidy for a
  // typo, but it turned a RENAMED flag into a silent no-op: `--write` moved to
  // `--yes` when `doctor` became `retarget`, so `spec-sync doctor --write` — the
  // exact 10.4.0 invocation for repairing a renamed team — parsed, ran the
  // readiness report instead, ignored the flag and exited 0. A script would read
  // that as "repaired".
  //
  // A spec name never starts with `--`, so this cannot swallow a real argument.
  if (unknownFlags.length) {
    const lines = [`spec-sync: unknown flag ${unknownFlags.join(', ')}`]
    // Renamed flags get a specific hand-off; a bare "unknown flag" would leave
    // the caller to guess what replaced it.
    if (unknownFlags.includes('--write')) {
      lines.push(
        '  --write was replaced by --yes, and the command that repairs a renamed',
        '  team is now `spec-sync retarget --yes` (it was `doctor --write`).',
      )
    }
    lines.push('  run `skitterspec spec-sync` for the full usage.')
    out.write(lines.join('\n') + '\n')
    return 1
  }

  dir = path.resolve(dir)
  // Injection seam, alongside cwd/out/err: `env` supplies the key lookup and
  // `adapter`/`fetch` stand in for the network, so `apply` is exercised end to
  // end offline. Production passes none of them and gets the real thing.
  flags.env = io.env || process.env
  if (io.adapter) flags.adapter = io.adapter
  if (io.fetch) flags.fetch = io.fetch
  // The stdin seam. `credentials set` branches on whether stdin is a TTY, and
  // with no way to inject one the suite could only ever exercise the non-TTY
  // half — which is how a prompt that erased itself reached a release.
  if (io.input) flags.input = io.input

  // Dispatched ahead of the load on purpose: this is the command you run when
  // there is no config, and `--force` must be able to replace one that is
  // malformed enough for the loader to throw on.
  if (sub === 'init-config') return specSyncInitConfig(dir, flags, out)

  // Same reason as init-config: this is the command you run when the config is
  // missing or malformed, so it must not sit behind a loader that throws on the
  // one and short-circuits on the other.
  if (sub === 'doctor') return await specSyncDoctor(dir, flags, out)

  const { config, present } = loadLinearConfig(dir)
  if (!present) {
    out.write(
      'spec-sync: Linear sync not enabled (no specs/.core/linear.config.json).\n' +
        'Opt in by copying specs/.core/linear.config.json.example → linear.config.json.\n',
    )
    return 0
  }

  switch (sub) {
    case 'normalize':
      return specSyncNormalize(dir, config, positional[0], out, err) || 0
    case 'push':
      return specSyncPush(dir, config, positional[0], flags, out, err) || 0
    case 'stamp':
      return specSyncStamp(dir, config, positional[0], flags, out)
    case 'record':
      return specSyncRecord(dir, config, positional[0], out) || 0
    case 'status':
      return specSyncStatus(dir, config, positional[0], flags, out) || 0
    case 'projects':
      return (await specSyncProjects(dir, config, flags, out)) || 0
    case 'states':
      return (await specSyncStates(dir, config, flags, out)) || 0
    case 'retarget':
      return (await specSyncRetarget(dir, config, flags, out)) || 0
    case 'apply':
      return (await specSyncApply(dir, config, positional[0], flags, out)) || 0
    case 'verify':
      return specSyncVerify(dir, config, positional[0], flags, out) || 0
    case 'linked':
      specSyncLinked(dir, config, flags, out)
      return 0
    case 'credentials':
      return await specSyncCredentials(dir, config, positional[0], flags, out)
    default:
      out.write('Usage: skitterspec spec-sync <normalize|record|status> <spec> [--json] [--remote file] [--workspace-states file]\n' +
        '       skitterspec spec-sync credentials <status|set|unset> [--stdin] [--json]\n' +
        '       skitterspec spec-sync push <spec> --workspace-states <file> [--json] [--skip-state-check]\n' +
        '       skitterspec spec-sync stamp <spec> --issue KEY-1 [--url URL] [--sub <ref>=KEY-2 …]\n' +
        '       skitterspec spec-sync states [--via api|mcp] [--json]\n' +
        '       skitterspec spec-sync projects [--via api|mcp] [--json]\n' +
        '       skitterspec spec-sync apply <spec> --plan <file> [--via api|mcp] [--project id] [--json]\n' +
        '       skitterspec spec-sync apply --all <bucket> [--via api|mcp] [--json]\n' +
        '       skitterspec spec-sync verify <spec> --stored <file>\n' +
        '       skitterspec spec-sync linked [--json]\n' +
        '       skitterspec spec-sync retarget [--yes]\n' +
        '       skitterspec spec-sync doctor [--check-remote] [--json]\n' +
        '       skitterspec spec-sync init-config --team-id <id> [--team-key K] [--project-id id]\n' +
        '                    [--intake-label L] [--bug-labels a,b] [--hotfix-labels a,b]\n' +
        '                    [--state <bucket>=<name> …] [--states <file>] [--force] [--json]\n')
      return 0
  }
}

module.exports = { specSync, listSpecs, promptHidden }
