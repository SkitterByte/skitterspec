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
 *
 * The `/spec-push` skill: `push` → apply the plan over MCP → stamp returned ids
 * into the repo → `record`. There is no pull — Linear is not read for content.
 */

const fs = require('node:fs')
const path = require('node:path')

const { findSpecFolder } = require('@skitterbyte/skitterspec-common/src/env/resolve.js')
const {
  normalizeLocal,
  readSnapshot,
  readBase,
  push,
  recordPush,
  projectionOf,
  planChanges,
  isEmptyPlan,
  remoteWorkflowState,
  validateStates,
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
function specSyncNormalize(dir, config, specArg, out) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return
  out.write(JSON.stringify(projectionOf(snapshotDir, config), null, 2) + '\n')
}

// `spec-sync push <spec> [--json]` — print the create/update PLAN diffed against
// the last-pushed snapshot. Machine-readable by default; the /spec-push skill
// applies it over MCP then calls `record`.
function specSyncPush(dir, config, specArg, flags, out) {
  const snapshotDir = resolveOrExit(specArg, dir, out)
  if (!snapshotDir) return
  const identifier = specIdentifier(snapshotDir, config)
  const r = push({ dir, snapshotDir, identifier, config })
  if (flags.json || !out.isTTY) {
    out.write(JSON.stringify(r.plan, null, 2) + '\n')
    return
  }
  const p = r.plan
  const lines = [`spec-sync push: ${identifier}`]
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
  const lines = [`spec-sync status: ${identifier}`]

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
      specSyncNormalize(dir, config, positional[0], out)
      return 0
    case 'push':
      specSyncPush(dir, config, positional[0], flags, out)
      return 0
    case 'record':
      specSyncRecord(dir, config, positional[0], out)
      return 0
    case 'status':
      return specSyncStatus(dir, config, positional[0], flags, out) || 0
    default:
      out.write('Usage: skitterspec spec-sync <normalize|push|record|status> <spec> [--json] [--remote file] [--workspace-states file]\n')
      return 0
  }
}

module.exports = { specSync }
