'use strict'

/**
 * Pure spec/branch resolution for per-spec isolation.
 *
 * Given a spec argument (a folder name or path) it locates the spec folder under
 * `specs/**`, splits the `feat-`/`bug-` prefix into `{ type, slug }`, derives the
 * git branch (optional Linear seam, else `{type}/{slug}`), and expands the
 * config's path/name tokens (`{repo}`, `{repoSlug}`, `{slug}`). Reads files to
 * locate the spec and read frontmatter, but makes no git/docker/warp side
 * effects — deterministic and safe to unit-test with fixtures.
 */

const fs = require('node:fs')
const path = require('node:path')

const BUCKETS = ['backlog', 'in-progress', 'complete', 'cancelled']
const LINEAR_CONFIG = path.join('specs', '.core', 'linear.config.json')

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Find the spec folder under specs/<bucket>/<name>. `specArg` may be a bare
// folder name or a path — only its basename is matched against the buckets.
function findSpecFolder(specArg, dir) {
  const name = path.basename(specArg)
  for (const bucket of BUCKETS) {
    const abs = path.join(dir, 'specs', bucket, name)
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      return { folder: name, bucket, path: abs }
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

// Read the `linear_identifier` from a spec's 00-overview.md YAML frontmatter,
// if present. Returns null when there's no frontmatter / field / file.
function readLinearIdentifier(specPath) {
  const overview = path.join(specPath, '00-overview.md')
  let raw
  try {
    raw = fs.readFileSync(overview, 'utf-8')
  } catch {
    return null
  }
  const fm = /^---\n([\s\S]*?)\n---/.exec(raw)
  if (!fm) return null
  const m = /^linear_identifier:\s*(.+)$/m.exec(fm[1])
  if (!m) return null
  return m[1].trim().replace(/^["']|["']$/g, '') || null
}

// Load specs/.core/linear.config.json when present, else null.
function loadLinearConfig(dir) {
  const file = path.join(dir, LINEAR_CONFIG)
  let raw
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    return isObject(parsed) ? parsed : null
  } catch (error) {
    throw new Error(`Invalid ${LINEAR_CONFIG}: ${error.message}`)
  }
}

/**
 * Derive the git branch for a spec. If `linkLinear` and a linear.config.json
 * with a `branch.pattern` is present and the spec has a `linear_identifier`,
 * expand that pattern (`{identifier}`, `{slug}`, `{type}`). Otherwise fall back
 * to `{type}/{slug}`.
 */
function branchFor(spec, dir, config) {
  if (config.linkLinear) {
    const linear = loadLinearConfig(dir)
    const pattern = linear && linear.branch && linear.branch.pattern
    const identifier = readLinearIdentifier(spec.path)
    if (pattern && identifier) {
      return expandTokens(pattern, {
        identifier,
        slug: spec.slug,
        type: spec.type,
      })
    }
  }
  return `${spec.type}/${spec.slug}`
}

/**
 * Resolve a spec argument to its identity + isolation coordinates.
 * Throws a clear Error when the spec folder can't be found.
 */
function resolveSpec(specArg, dir, config) {
  const found = findSpecFolder(specArg, dir)
  if (!found) {
    throw new Error(`spec not found under specs/**: ${specArg}`)
  }

  const { type, slug } = splitPrefix(found.folder)
  const { repo, repoSlug } = repoInfo(dir)
  const tokens = { repo, repoSlug, slug }

  const spec = { folder: found.folder, bucket: found.bucket, path: found.path, type, slug }
  const branch = branchFor(spec, dir, config)

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
  branchFor,
  splitPrefix,
  repoInfo,
  expandTokens,
  findSpecFolder,
}
