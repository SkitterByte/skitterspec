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
 *   spec-sync record <spec>      write the last-pushed snapshot (after apply)
 *   spec-sync status <spec>      read-only drift report (never writes)
 *   spec-sync linked             list every spec's linear_identifier (offline)
 *
 * The `/spec-push` skill: `push` → apply the plan over MCP → stamp returned ids
 * into the repo → `record`. There is no pull — Linear is not read for content.
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
  lintPhases,
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
  if (!snapshotDir) return
  const identifier = specIdentifier(snapshotDir, config)
  const r = push({ dir, snapshotDir, identifier, config })
  if (flags.json || !out.isTTY) {
    warnToErr(snapshotDir, config, err)
    out.write(JSON.stringify(r.plan, null, 2) + '\n')
    return
  }
  const p = r.plan
  const lines = [`spec-sync push: ${identifier}`, ...warningLines(snapshotDir, config)]
  if (r.empty) lines.push('  nothing to push — mirror matches the last push')
  else {
    if (p.issue) lines.push('  issue: description/state')
    if (p.subIssues.create.length) lines.push(`  sub-issues create: ${p.subIssues.create.map((s) => s.name).join(', ')}`)
    if (p.subIssues.update.length) lines.push(`  sub-issues update: ${p.subIssues.update.map((s) => s.id).join(', ')}`)
    lines.push('  (run with --json for the full plan the skill applies)')
  }
  out.write(lines.join('\n') + '\n')
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

async function specSync(rest, io = {}) {
  const out = io.out || process.stdout
  const err = io.err || process.stderr
  const [sub, ...args] = rest
  let dir = io.cwd || process.cwd()
  const positional = []
  const flags = { json: false, remote: null, workspaceStates: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = path.resolve(args[++i])
    else if (args[i] === '--json') flags.json = true
    else if (args[i] === '--remote') flags.remote = path.resolve(args[++i])
    else if (args[i] === '--workspace-states') flags.workspaceStates = path.resolve(args[++i])
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
      specSyncPush(dir, config, positional[0], flags, out, err)
      return 0
    case 'record':
      specSyncRecord(dir, config, positional[0], out)
      return 0
    case 'status':
      return specSyncStatus(dir, config, positional[0], flags, out) || 0
    case 'linked':
      specSyncLinked(dir, config, flags, out)
      return 0
    default:
      out.write('Usage: skitterspec spec-sync <normalize|push|record|status> <spec> [--json] [--remote file] [--workspace-states file]\n' +
        '       skitterspec spec-sync linked [--json]\n')
      return 0
  }
}

module.exports = { specSync, listSpecs }
