'use strict'

/**
 * `spec-sync` CLI handler — the Linear hybrid-sync engine seam.
 *
 * Extracted out of the base CLI: this ships only with the Linear provider package,
 * so the base (`@skitterbyte/skitterspec-common`) knows nothing about tracker sync.
 * It drives the provider-neutral engine (`@skitterbyte/skitterspec-sync-core`) with
 * the Linear config loader (`./config.js`) and a file-backed adapter; live
 * MCP-backed sync goes through the /spec-status · /spec-pull · /spec-push skills.
 */

const fs = require('node:fs')
const path = require('node:path')

const { findSpecFolder } = require('@skitterbyte/skitterspec-common/src/env/resolve.js')
const {
  normalizeLocal,
  normalizeRemote,
  readSnapshot,
  classify,
  readBase,
  pull,
  push,
} = require('@skitterbyte/skitterspec-sync-core')

const { loadLinearConfig } = require('./config.js')

// A compact, filesystem-safe timestamp (e.g. 20260714-030405) for backup/adapter
// stamps. Inlined so this handler needs nothing from the base CLI.
function compactTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '')
    .replace('T', '-')
}

// Resolve a spec argument to its snapshot dir. Accepts a spec name/folder found
// under specs/** (preferred) or a literal path to a snapshot directory.
function resolveSnapshotDir(specArg, dir) {
  const found = findSpecFolder(specArg, dir)
  if (found) return found.path
  const literal = path.resolve(dir, specArg)
  if (fs.existsSync(literal) && fs.statSync(literal).isDirectory()) return literal
  return null
}

// The identifier keying the base sidecar: the spec's linear_identifier if set,
// else its folder name (so the engine is usable before a spec is linked).
function specIdentifier(snapshotDir, config) {
  try {
    const { frontmatter } = readSnapshot(snapshotDir, config)
    if (frontmatter.linear_identifier) return String(frontmatter.linear_identifier)
  } catch {
    /* fall through to folder name */
  }
  return path.basename(snapshotDir)
}

// `spec-sync normalize <spec>` — print the normalized local field set as JSON.
function specSyncNormalize(dir, config, specArg) {
  if (!specArg) {
    process.stdout.write('Usage: skitterspec spec-sync normalize <spec>\n')
    return
  }
  const snapshotDir = resolveSnapshotDir(specArg, dir)
  if (!snapshotDir) {
    process.stdout.write(`spec-sync: spec not found: ${specArg}\n`)
    return
  }
  const local = normalizeLocal(snapshotDir, config)
  process.stdout.write(JSON.stringify(local, null, 2) + '\n')
}

// `spec-sync status <spec> [--remote file]` — read-only per-field divergence
// (git status analog). With `--remote` (a Linear Project projection, supplied by
// the /spec-status skill via MCP) it reports true three-way divergence; without
// it, it compares local vs the committed base only (what changed locally since
// the last sync).
function specSyncStatus(dir, config, specArg, flags = {}) {
  if (!specArg) {
    process.stdout.write('Usage: skitterspec spec-sync status <spec> [--remote file]\n')
    return
  }
  const snapshotDir = resolveSnapshotDir(specArg, dir)
  if (!snapshotDir) {
    process.stdout.write(`spec-sync: spec not found: ${specArg}\n`)
    return
  }
  const identifier = specIdentifier(snapshotDir, config)
  const local = normalizeLocal(snapshotDir, config)
  const base = readBase(dir, identifier, config)

  let remote = base // no remote → compare local vs base
  let haveRemote = false
  if (flags.remote && fs.existsSync(flags.remote)) {
    remote = normalizeRemote(JSON.parse(fs.readFileSync(flags.remote, 'utf-8')), config)
    haveRemote = true
  }
  const fields = classify(local, remote, base, config)

  const out = []
  out.push(`spec-sync status: ${identifier}${base ? '' : ' (no base yet — never synced)'}`)
  if (!haveRemote) out.push('  (no --remote given — compared local vs base only)')
  const changed = fields.filter((f) => f.status !== 'unchanged')
  if (!changed.length) {
    out.push(haveRemote ? '  in sync — local, Linear, and base agree' : '  nothing to sync — local matches base')
  } else {
    for (const f of changed) {
      const dir_ = f.pushable && f.pullable ? 'push+pull' : f.pushable ? 'push' : f.pullable ? 'pull' : '—'
      out.push(`  ${f.status.padEnd(12)} ${f.field.padEnd(18)} (${f.ownership}, ${dir_})`)
    }
  }
  process.stdout.write(out.join('\n') + '\n')
}

// The linked Linear project id for a spec (frontmatter linear_project_id), else
// its identifier — enough for the file adapter / a single-project remote file.
function specProjectId(snapshotDir, config) {
  try {
    const { frontmatter } = readSnapshot(snapshotDir, config)
    if (frontmatter.linear_project_id) return String(frontmatter.linear_project_id)
    if (frontmatter.linear_identifier) return String(frontmatter.linear_identifier)
  } catch {
    /* fall through */
  }
  return path.basename(snapshotDir)
}

// A file-backed MCP adapter: reads the remote Project projection from a JSON file
// and (on push) writes the merged result to `outPath` (default: the same file).
// This lets `spec-sync push|pull` run the engine deterministically from the CLI /
// CI. Live MCP-backed sync goes through the /spec-push · /spec-pull skills, which
// supply the real adapter. `stamp` bumps updatedAt on write.
function fileAdapter(remotePath, outPath, stamp) {
  const readRemote = () => JSON.parse(fs.readFileSync(remotePath, 'utf-8'))
  return {
    async readProject() {
      return fs.existsSync(remotePath) ? readRemote() : null
    },
    async updateProject(id, updates) {
      const merged = { ...readRemote(), ...updates, updatedAt: `${stamp}-pushed` }
      if (outPath) fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
      return merged
    },
  }
}

// Print a git-like summary of a pull/push engine result.
function printSyncResult(kind, result) {
  const out = []
  if (result.ok === false && !result.blocked) {
    out.push(`spec-sync ${kind}: error — ${result.error}`)
  } else if (result.blocked) {
    out.push(`spec-sync ${kind}: refused — ${result.message}`)
  } else {
    out.push(`spec-sync ${kind}: ok`)
    if (kind === 'pull') {
      if (result.applied.length) out.push(`  applied:   ${result.applied.join(', ')}`)
      if (result.deferred.length) out.push(`  deferred:  ${result.deferred.join(', ')} (body write-back — manual)`)
      if (!result.applied.length && !result.deferred.length) out.push('  nothing to pull — up to date')
    } else {
      if (result.written && result.written.length) out.push(`  written:   ${result.written.join(', ')}`)
      if (result.skipped && result.skipped.length) out.push(`  skipped:   ${result.skipped.join(', ')} (not pushable)`)
      if (result.note) out.push(`  ${result.note}`)
    }
    if (result.backupPath) out.push(`  backup:    ${result.backupPath}`)
    if (result.basePath) out.push(`  base:      ${result.basePath}`)
  }
  process.stdout.write(out.join('\n') + '\n')
}

// `spec-sync push|pull <spec> [--force] [--remote file] [--out file]`.
async function specSyncPushPull(kind, dir, config, specArg, flags) {
  if (!specArg) {
    process.stdout.write(`Usage: skitterspec spec-sync ${kind} <spec> [--force] [--remote file] [--out file]\n`)
    return
  }
  const snapshotDir = resolveSnapshotDir(specArg, dir)
  if (!snapshotDir) {
    process.stdout.write(`spec-sync: spec not found: ${specArg}\n`)
    return
  }
  if (!flags.remote) {
    process.stdout.write(
      `spec-sync ${kind}: live Linear sync runs through the /spec-${kind} skill, which ` +
        'connects the Linear MCP server.\n' +
        `For a local run, pass --remote <project.json> (a Linear Project projection).\n`,
    )
    return
  }
  const identifier = specIdentifier(snapshotDir, config)
  const projectId = specProjectId(snapshotDir, config)
  const stamp = compactTimestamp()
  const adapter = fileAdapter(flags.remote, flags.out, stamp)
  const run = kind === 'pull' ? pull : push
  const result = await run({
    dir,
    snapshotDir,
    identifier,
    projectId,
    adapter,
    config,
    force: flags.force,
    timestamp: new Date().toISOString(),
  })
  printSyncResult(kind, result)
}

// Dispatch `skitterspec spec-sync <sub> [spec] [flags]`. No-ops with a clear
// message when Linear sync isn't enabled (no specs/.core/linear.config.json).
async function specSync(rest) {
  const [sub, ...args] = rest
  let dir = process.cwd()
  const positional = []
  const flags = { force: false, remote: null, out: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = path.resolve(args[++i])
    else if (args[i] === '--force') flags.force = true
    else if (args[i] === '--remote') flags.remote = path.resolve(args[++i])
    else if (args[i] === '--out') flags.out = path.resolve(args[++i])
    else positional.push(args[i])
  }
  dir = path.resolve(dir)

  const { config, present } = loadLinearConfig(dir)
  if (!present) {
    process.stdout.write(
      'spec-sync: Linear sync not enabled (no specs/.core/linear.config.json).\n' +
        'Opt in by copying specs/.core/linear.config.json.example → linear.config.json.\n',
    )
    return
  }

  switch (sub) {
    case 'normalize':
      specSyncNormalize(dir, config, positional[0])
      break
    case 'status':
      specSyncStatus(dir, config, positional[0], flags)
      break
    case 'pull':
      await specSyncPushPull('pull', dir, config, positional[0], flags)
      break
    case 'push':
      await specSyncPushPull('push', dir, config, positional[0], flags)
      break
    default:
      process.stdout.write(
        'Usage: skitterspec spec-sync <normalize|status|pull|push> <spec> [--force] [--remote file] [--out file]\n',
      )
  }
}

module.exports = { specSync }
