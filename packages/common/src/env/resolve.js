'use strict'

/**
 * Pure spec/branch resolution for per-spec isolation.
 *
 * Given a spec argument (a folder name or path) it locates the spec folder under
 * `specs/**`, splits the `feat-`/`bug-` prefix into `{ type, slug }`, derives the
 * git branch from the config's `branch.pattern` (provider-neutral; `{identifier}`
 * is filled from a tracker id when one is configured, else it falls back to
 * `{type}/{slug}`), and expands the config's path/name tokens (`{repo}`,
 * `{repoSlug}`, `{slug}`). Reads files to locate the spec and read frontmatter,
 * but makes no git/docker side effects — deterministic and safe to unit-test with
 * fixtures.
 */

const fs = require('node:fs')
const path = require('node:path')

const BUCKETS = ['backlog', 'in-progress', 'complete', 'cancelled']

// Find the spec folder under specs/<bucket>/<name>. `specArg` may be a bare
// folder name or a path — only its basename is matched against the buckets.
// Searches `dir` first, then any `extraDirs` in order — so a caller (e.g.
// `spec-env integrate`) can fall back to a worktree checkout for a spec that
// was authored on its branch and never committed to the primary checkout.
function findSpecFolder(specArg, dir, extraDirs = []) {
  const name = path.basename(specArg)
  for (const root of [dir, ...extraDirs]) {
    for (const bucket of BUCKETS) {
      const abs = path.join(root, 'specs', bucket, name)
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        return { folder: name, bucket, path: abs }
      }
    }
  }
  return null
}

// Split a `feat-`/`bug-` prefix. Unknown prefix → type defaults to `feat` and
// the whole folder name is the slug.
function splitPrefix(folder) {
  const m = /^(feat|bug)-(.+)$/.exec(folder)
  if (m) return { type: m[1], slug: m[2] }
  return { type: 'feat', slug: folder }
}

// Repo identity used for token expansion.
function repoInfo(dir) {
  const repo = path.basename(dir)
  const repoSlug = repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return { repo, repoSlug }
}

// Replace {token} occurrences from `tokens`; unknown tokens are left intact.
function expandTokens(str, tokens) {
  return String(str).replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : m,
  )
}

// Read a named field from a spec's 00-overview.md YAML frontmatter, if present.
// `field` is provider-neutral (e.g. a tracker's ticket-id field, configured via
// `branch.identifierField`). Returns null when there's no frontmatter / field /
// file, or no field name was given.
function readFrontmatterField(specPath, field) {
  if (!field) return null
  const overview = path.join(specPath, '00-overview.md')
  let raw
  try {
    raw = fs.readFileSync(overview, 'utf-8')
  } catch {
    return null
  }
  const fm = /^---\n([\s\S]*?)\n---/.exec(raw)
  if (!fm) return null
  const m = new RegExp(`^${field}:\\s*(.+)$`, 'm').exec(fm[1])
  if (!m) return null
  return m[1].trim().replace(/^["']|["']$/g, '') || null
}

/**
 * Read a spec's `> **Stack:** …` blockquote field from 00-overview.md and map it
 * to the isolation stack: any value containing `docker` → `'docker'`, otherwise
 * `'worktree'`. A spec with no field falls back to the project default — which
 * preserves pre-`Stack` behaviour: with Docker available (`docker.enabled`) a
 * legacy spec still gets Docker, else it's worktree-only. The planner ANDs this
 * with the master switch, so an explicit `worktree` always suppresses Docker.
 */
function readStackField(specPath, config) {
  const overview = path.join(specPath, '00-overview.md')
  let raw
  try {
    raw = fs.readFileSync(overview, 'utf-8')
  } catch {
    raw = null
  }
  const m = raw && /^>\s*\*\*Stack:\*\*\s*(.+)$/m.exec(raw)
  if (m) {
    return /docker/i.test(m[1]) ? 'docker' : 'worktree'
  }
  return config.docker && config.docker.enabled ? 'docker' : 'worktree'
}

/**
 * Derive the git branch for a spec from the provider-neutral `branch.pattern`
 * (`{type}`, `{slug}`, and optionally `{identifier}`). When the pattern uses
 * `{identifier}`, the id is read from the frontmatter field named by
 * `branch.identifierField` (a tracker provider writes it); if that field is unset
 * or absent on the spec, the branch falls back to `{type}/{slug}` so we never
 * emit a half-expanded name. No knowledge of any specific tracker lives here.
 */
function branchFor(spec, config) {
  const branch = (config.branch && config.branch.pattern) || '{type}/{slug}'
  const tokens = { type: spec.type, slug: spec.slug }
  if (/\{identifier\}/.test(branch)) {
    const field = config.branch && config.branch.identifierField
    const identifier = readFrontmatterField(spec.path, field)
    if (!identifier) return `${spec.type}/${spec.slug}`
    tokens.identifier = identifier
  }
  return expandTokens(branch, tokens)
}

/**
 * Resolve the integration base branch (the branch specs fork from and land back
 * onto). Precedence:
 *   1. `config.baseBranch` — explicit override
 *   2. `origin/HEAD` — the remote's default branch
 *   3. `main` if it exists locally
 *   4. `master` if it exists locally
 *   5. `main` — last-resort default
 *
 * `git(args)` runs a read-only git command and returns trimmed stdout, or `null`
 * on a non-zero exit / failure. It's injected so this stays pure and unit-testable
 * with no live git; the CLI supplies a real reader. (Note: `show-ref --quiet`
 * emits no stdout on success, so a non-null `''` still means "exists".)
 */
function resolveBaseBranch(config, git) {
  const explicit = config && typeof config.baseBranch === 'string' && config.baseBranch.trim()
  if (explicit) return explicit

  const originHead = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (originHead) return originHead.replace(/^origin\//, '')

  for (const name of ['main', 'master']) {
    if (git(['show-ref', '--verify', '--quiet', `refs/heads/${name}`]) !== null) return name
  }
  return 'main'
}

/**
 * Resolve `dir` to the primary checkout root — the parent of the shared git dir.
 * From the primary checkout `git rev-parse --git-common-dir` is `.git` (relative),
 * so the parent is `dir`; from a linked worktree it's the absolute `<main>/.git`,
 * so the parent is `<main>`. Anchoring every `spec-env` command here means they
 * resolve `{repo}` / worktree paths / the registry identically whether run from
 * `main` or a worktree. `git(args)` returns trimmed stdout or `null` (not a repo)
 * — injected for testability; a `null` degrades to `dir` (today's behaviour).
 */
function resolvePrimaryCheckout(dir, git) {
  const common = git(['rev-parse', '--git-common-dir'])
  return common ? path.dirname(path.resolve(dir, common)) : dir
}

/**
 * Resolve a spec argument to its identity + isolation coordinates.
 * Throws a clear Error when the spec folder can't be found.
 *
 * `opts.searchDirs` adds fallback checkout roots to look under (after `dir`) when
 * locating the spec folder; identity/coordinate tokens still expand against `dir`
 * (the primary checkout), so a worktree-only spec resolves to the right base.
 */
function resolveSpec(specArg, dir, config, opts = {}) {
  const found = findSpecFolder(specArg, dir, opts.searchDirs || [])
  if (!found) {
    throw new Error(`spec not found under specs/**: ${specArg}`)
  }

  const { type, slug } = splitPrefix(found.folder)
  const { repo, repoSlug } = repoInfo(dir)
  const tokens = { repo, repoSlug, slug }

  const stack = readStackField(found.path, config)
  const spec = { folder: found.folder, bucket: found.bucket, path: found.path, type, slug, stack }
  const branch = branchFor(spec, config)

  const worktreeRoot = expandTokens(config.worktree.root, tokens)
  const worktreeFolder = expandTokens(config.worktree.folderPattern, tokens)
  const worktreePath = path.resolve(dir, worktreeRoot, worktreeFolder)
  const projectName = expandTokens(config.docker.projectNamePattern, tokens)

  return {
    ...spec,
    repo,
    repoSlug,
    branch,
    worktreeRoot,
    worktreeFolder,
    worktreePath,
    projectName,
  }
}

module.exports = {
  resolveSpec,
  resolveBaseBranch,
  resolvePrimaryCheckout,
  branchFor,
  splitPrefix,
  repoInfo,
  expandTokens,
  findSpecFolder,
  readStackField,
}
