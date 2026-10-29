'use strict'

/**
 * Spec resolution and listing for a provider CLI — how a spec argument becomes
 * a snapshot directory, how a spec names its snapshot sidecar, and which specs
 * a repo holds with which tracker links.
 *
 * The frontmatter key that links a spec is the provider's
 * (`config.fields.identifier` — sync-core `src/fields.js`); everything else
 * here is filesystem shape shared by every provider. `program` prefixes the
 * user-facing refusals (`spec-sync: spec not found: …`).
 */

const fs = require('node:fs')
const path = require('node:path')

const { execFileSync } = require('node:child_process')

const {
  BUCKETS,
  findSpecFolder,
  resolveSpec,
  liveWorktreePaths,
  resolvePrimaryCheckout,
} = require('@skitterbyte/skitterspec-common/src/env/resolve.js')
const { loadEnvConfig } = require('@skitterbyte/skitterspec-common/src/env/config.js')
const { readSnapshot, parseFrontmatter, lintPhases, fieldsOf, projectionOf, compareStored } = require('@skitterbyte/skitterspec-sync-core')

function makeSpecHelpers({ program = 'spec-sync' } = {}) {
  // Resolve a spec argument to its snapshot dir. Accepts a spec name/folder
  // found under specs/** (preferred) or a literal path to a snapshot directory.
  function resolveSnapshotDir(specArg, dir) {
    const found = findSpecFolder(specArg, dir)
    if (found) return found.path
    const literal = path.resolve(dir, specArg)
    if (fs.existsSync(literal) && fs.statSync(literal).isDirectory()) return literal
    return null
  }

  // The identifier keying the snapshot sidecar: the spec's stamped identifier
  // if set, else its folder name (so the engine is usable before a spec is
  // linked).
  function specIdentifier(snapshotDir, config) {
    const field = fieldsOf(config).identifier
    try {
      const { frontmatter } = readSnapshot(snapshotDir, config)
      if (frontmatter[field]) return String(frontmatter[field])
    } catch {
      /* fall through to folder name */
    }
    return path.basename(snapshotDir)
  }

  // Read a spec's stamped identifier without throwing: an unlinked spec, an
  // unreadable file and a spec with no frontmatter all read as `null`.
  function linkedIdentifier(overviewPath, config) {
    return linkedFields(overviewPath, config).identifier
  }

  // The stamped identifier AND url, each `null` when absent. The url is only
  // ever what a push stamped — never built from the identifier, because a url
  // constructed here would be a guess about a tracker's address scheme.
  function linkedFields(overviewPath, config) {
    const fields = fieldsOf(config)
    let raw
    try {
      raw = fs.readFileSync(overviewPath, 'utf-8')
    } catch {
      return { identifier: null, url: null }
    }
    const { data } = parseFrontmatter(raw)
    return {
      identifier: data[fields.identifier] ? String(data[fields.identifier]) : null,
      url: fields.url && data[fields.url] ? String(data[fields.url]) : null,
    }
  }

  // Every spec under specs/<bucket>/, paired with the tracker issue it is
  // linked to (`null` when it has never been pushed). Folder specs read
  // `snapshot.overviewFile`; legacy bare `<name>.md` specs read the file
  // itself. Sorted for stable output.
  function listSpecs(dir, config, options = {}) {
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
        const linked = linkedFields(overviewPath, config)
        const row = { spec: name, bucket, identifier: linked.identifier }
        // Opt-in, so every listing that never asked for a url keeps its shape.
        if (options.urls) row.url = linked.url
        specs.push(row)
      }
    }
    return specs.sort((a, b) => a.spec.localeCompare(b.spec))
  }

  // `listSpecs`, but each spec's BUCKET read from where that spec actually
  // lives. `/spec-start` moves a spec to `in-progress/` on its own branch, so
  // on the base branch an in-flight spec still reads `backlog` — and a spec
  // authored in its own worktree and not yet landed is not here at all. Each
  // live worktree is read too, and a spec found in ITS OWN worktree (the path
  // `resolveSpec` names for it) wins over every other copy. `source` says
  // which: `here`, `worktree`, or `other-tree` for a spec only some other
  // worktree carries.
  //
  // WHAT WOULD FOOL THIS: a worktree left behind by a declined teardown is
  // still live, so a finished spec can read from a stale tree. And with no
  // `env.config.json` there is no worktree layout to resolve, so this is
  // exactly `listSpecs` — the current tree's answer, as before.
  function listSpecsLive(dir, config) {
    const here = listSpecs(dir, config).map((s) => ({ ...s, source: 'here' }))
    const git = (args) => {
      try {
        return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      } catch {
        return null
      }
    }
    let primary
    let env
    try {
      primary = resolvePrimaryCheckout(dir, git) || dir
      env = loadEnvConfig(primary)
    } catch {
      return here
    }
    if (!env.present) return here
    // Compared as REAL paths: git reports a worktree resolved through
    // symlinks (macOS /var → /private/var) where `resolveSpec` does not.
    const real = (p) => {
      try {
        return fs.realpathSync(p)
      } catch {
        return path.resolve(p)
      }
    }
    const self = real(dir)
    const byName = new Map(here.map((s) => [s.spec, s]))
    for (const listed of liveWorktreePaths(git)) {
      const tree = real(listed)
      if (tree === self) continue
      for (const s of listSpecs(tree, config)) {
        let own = null
        try {
          own = real(resolveSpec(s.spec, primary, env.config, { searchDirs: [tree] }).worktreePath)
        } catch {
          own = null
        }
        if (own === tree) byName.set(s.spec, { ...s, source: 'worktree' })
        else if (!byName.has(s.spec)) byName.set(s.spec, { ...s, source: 'other-tree' })
      }
    }
    return [...byName.values()].sort((a, b) => a.spec.localeCompare(b.spec))
  }

  // Resolve a spec argument to its folder, or null with a message on stdout.
  // EVERY failure path here must print and EVERY caller must return a non-zero
  // code: a push skill checks $? before it applies a plan, so a resolve failure
  // that exits 0 reads as "nothing to do" rather than "I could not find the
  // spec".
  function resolveOrExit(specArg, dir, out) {
    if (!specArg) {
      out.write(`${program}: no spec given\n`)
      return null
    }
    const snapshotDir = resolveSnapshotDir(specArg, dir)
    if (!snapshotDir) {
      out.write(`${program}: spec not found: ${specArg}\n`)
      return null
    }
    return snapshotDir
  }

  // Phase-status warnings for a spec, one formatted line each. A spec states
  // each phase's status three times and only the h1 emoji is read — get it
  // wrong and the phase projects as `backlog`, pushes cleanly, and is recorded
  // as intended: invisible. Reported by every subcommand that reads a
  // projection, fatal in none — a legacy spec must still push.
  function warningLines(snapshotDir, config) {
    return lintPhases(snapshotDir, config).map((w) => `  warning ${w.file}: ${w.message}`)
  }

  // Emit warnings on stderr, keeping stdout pure for a machine-readable payload.
  function warnToErr(snapshotDir, config, err) {
    const lines = warningLines(snapshotDir, config)
    if (lines.length) err.write(lines.join('\n') + '\n')
  }

  // Render the read-back comparison — the same check `verify` and `apply`
  // both report through, so the two cannot disagree about what "intact" means.
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

    const lines = [`${program} verify: ${identifier}`]
    let bad = 0
    for (const [label, sent, got] of checks) {
      if (sent == null) {
        lines.push(`  ?? ${label}: read back, but the projection has no such phase — stale ref?`)
        bad++
        continue
      }
      const r = compareStored(sent, got, config)
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

  return { resolveSnapshotDir, specIdentifier, linkedIdentifier, listSpecs, listSpecsLive, resolveOrExit, warningLines, warnToErr, verifyLines }
}

module.exports = { makeSpecHelpers }
