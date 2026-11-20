'use strict'

/**
 * `skitterspec update --all` — every local-scope project on this machine,
 * updated by its own distribution (feat-global-install, phase 2).
 *
 * Projects are the folders Claude Code has run sessions in (`knownDirs`, the
 * list `tada` reads), kept only where a skitterspec manifest is found: that file
 * is a positive signal an install was made there, where a folder merely named
 * in a transcript is not. A linked worktree is folded into its primary
 * checkout, because a local install seeds its worktrees from the primary — one
 * update there reaches them all.
 *
 * WHAT WOULD FOOL THIS: a project that never ran a Claude Code session on this
 * machine is not in the list, so it is not updated — and not mentioned either.
 * A transcript root that was cleared forgets projects the same way. Both cost a
 * project left on the old version, which `skitterspec update` there still
 * fixes; neither can update the wrong thing.
 *
 * Every lookup that touches the machine is injected, so the planner is tested
 * against fake folders and a fake transcript root.
 */

const fs = require('node:fs')
const path = require('node:path')

const MANIFEST = path.join('specs', '.core', '.skitterspec-manifest.json')
const PROVIDERS = ['github', 'linear', 'jira', 'azure-boards']
const BASE = '@skitterbyte/skitterspec'

function real(p) {
  try {
    return fs.realpathSync.native(p)
  } catch {
    return path.resolve(p)
  }
}

// The nearest folder at or above `dir` holding a manifest, bounded so a stray
// manifest far above the project is never reached.
function projectAt(dir, exists) {
  let at = path.resolve(dir)
  for (let i = 0; i < 6; i++) {
    if (exists(path.join(at, MANIFEST))) return at
    const up = path.dirname(at)
    if (up === at) return null
    at = up
  }
  return null
}

// The same project folder in the primary checkout, when `dir` is inside a
// linked worktree; else `dir`. A git that cannot answer leaves it unchanged.
function inPrimary(dir, git) {
  const top = git(dir, ['rev-parse', '--show-toplevel'])
  const common = git(dir, ['rev-parse', '--git-common-dir'])
  if (!top || !common) return dir
  const primary = path.dirname(path.resolve(dir, common))
  if (real(primary) === real(top)) return dir
  const rel = path.relative(real(top), real(dir))
  return rel.startsWith('..') || path.isAbsolute(rel) ? dir : path.join(primary, rel)
}

/**
 * The distribution that owns a project: what its manifest recorded, else the
 * provider whose config is in `specs/.core/`, else the base. Inferred only for
 * manifests written before the field existed.
 */
function distributionOf(dir, manifest, exists) {
  if (manifest.distribution) return manifest.distribution
  for (const p of PROVIDERS) {
    if (exists(path.join(dir, 'specs', '.core', `${p}.config.json`))) return `${BASE}-${p}`
  }
  return BASE
}

const binOf = (pkg) => pkg.replace(/^@skitterbyte\//, '')

/**
 * One row per project: `{ dir, name, scope, distribution, action }`, where
 * action is `update` · `team` · `disabled` · `missing`. Sorted by name so the
 * report reads the same on every run.
 */
function planUpdateAll({ dirs, exists, git, readManifest, onPath }) {
  const seen = new Map()
  for (const d of dirs) {
    if (!exists(d)) continue
    const found = projectAt(d, exists)
    if (!found) continue
    const dir = inPrimary(found, git)
    if (!exists(path.join(dir, MANIFEST))) continue
    const key = real(dir)
    if (!seen.has(key)) seen.set(key, dir)
  }
  const rows = []
  for (const dir of seen.values()) {
    const manifest = readManifest(dir)
    const distribution = distributionOf(dir, manifest, exists)
    let action = 'update'
    if (manifest.scope !== 'local') action = 'team'
    else if (!manifest.enabled) action = 'disabled'
    else if (!onPath(binOf(distribution))) action = 'missing'
    rows.push({ dir, name: path.basename(dir), scope: manifest.scope, distribution, action })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.dir.localeCompare(b.dir))
}

// How many managed files an `update` run wrote, read from its own report: the
// lines under `created:`, `updated:` and `removed:`.
function countChanged(stdout) {
  let n = 0
  let counting = false
  for (const line of String(stdout).split(/\r?\n/)) {
    if (/^(created|updated|removed):$/.test(line)) counting = true
    else if (/^\S/.test(line) || line === '') counting = false
    else if (counting && /^ {2}\S/.test(line)) n++
  }
  return n
}

/**
 * Run the plan. `run(bin, args, cwd)` returns `{ status, stdout, stderr }`.
 * Returns `{ lines, failed }`: one line per project, and whether any update
 * failed — listed and skipped projects are not failures.
 */
function runUpdateAll(rows, run) {
  const lines = []
  let failed = false
  const width = Math.max(0, ...rows.map((r) => r.name.length))
  for (const r of rows) {
    const head = `${r.name.padEnd(width)}  ${r.scope.padEnd(5)} · ${binOf(r.distribution).replace(/^skitterspec-?/, '') || 'base'}`
    let outcome
    if (r.action === 'team') outcome = 'listed — team install, update it on a /no-spec branch'
    else if (r.action === 'disabled') outcome = 'skipped — disabled (skitterspec enable turns it on)'
    else if (r.action === 'missing') outcome = `skipped — npm i -g ${r.distribution}`
    else {
      const res = run(binOf(r.distribution), ['update', r.dir], r.dir)
      if (res.status === 0) {
        const n = countChanged(res.stdout)
        outcome = n ? `updated ${n} file${n === 1 ? '' : 's'}` : 'current'
      } else {
        failed = true
        const first = `${res.stderr || ''}\n${res.stdout || ''}`.split(/\r?\n/).find((l) => l.trim()) || `exit ${res.status}`
        outcome = `failed — ${first.trim()}`
      }
    }
    lines.push(`  ${head}  ${outcome}`)
  }
  return { lines, failed }
}

module.exports = { planUpdateAll, runUpdateAll, countChanged, distributionOf, MANIFEST }
