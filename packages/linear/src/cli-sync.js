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
} = require('@skitterbyte/skitterspec-sync-core')

const { loadLinearConfig } = require('./config.js')

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

function resolveOrExit(specArg, dir, out) {
  if (!specArg) return null
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
  if (!snapshotDir) return
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
  if (!snapshotDir) return
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
  if (!snapshotDir) return
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
  let stored
  try {
    stored = JSON.parse(fs.readFileSync(flags.stored, 'utf-8'))
  } catch (error) {
    out.write(`spec-sync verify: cannot read --stored ${flags.stored}: ${error.message}\n`)
    return 1
  }

  const identifier = specIdentifier(snapshotDir, config)
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
  out.write(lines.join('\n') + '\n')
  return 0
}

async function specSync(rest, io = {}) {
  const out = io.out || process.stdout
  const err = io.err || process.stderr
  const [sub, ...args] = rest
  let dir = io.cwd || process.cwd()
  const positional = []
  const flags = { json: false, remote: null, workspaceStates: null, skipStateCheck: false, issue: null, url: null, subs: [], stored: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = path.resolve(args[++i])
    else if (args[i] === '--json') flags.json = true
    else if (args[i] === '--remote') flags.remote = path.resolve(args[++i])
    else if (args[i] === '--stored') flags.stored = path.resolve(args[++i])
    else if (args[i] === '--workspace-states') flags.workspaceStates = path.resolve(args[++i])
    else if (args[i] === '--skip-state-check') flags.skipStateCheck = true
    else if (args[i] === '--issue') flags.issue = args[++i]
    else if (args[i] === '--url') flags.url = args[++i]
    else if (args[i] === '--sub') flags.subs.push(args[++i])
    else positional.push(args[i])
  }
  dir = path.resolve(dir)

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
      specSyncNormalize(dir, config, positional[0], out, err)
      return 0
    case 'push':
      return specSyncPush(dir, config, positional[0], flags, out, err) || 0
    case 'stamp':
      return specSyncStamp(dir, config, positional[0], flags, out)
    case 'record':
      specSyncRecord(dir, config, positional[0], out)
      return 0
    case 'status':
      return specSyncStatus(dir, config, positional[0], flags, out) || 0
    case 'verify':
      return specSyncVerify(dir, config, positional[0], flags, out) || 0
    case 'linked':
      specSyncLinked(dir, config, flags, out)
      return 0
    default:
      out.write('Usage: skitterspec spec-sync <normalize|record|status> <spec> [--json] [--remote file] [--workspace-states file]\n' +
        '       skitterspec spec-sync push <spec> --workspace-states <file> [--json] [--skip-state-check]\n' +
        '       skitterspec spec-sync stamp <spec> --issue KEY-1 [--url URL] [--sub <ref>=KEY-2 …]\n' +
        '       skitterspec spec-sync verify <spec> --stored <file>\n' +
        '       skitterspec spec-sync linked [--json]\n')
      return 0
  }
}

module.exports = { specSync, listSpecs }
