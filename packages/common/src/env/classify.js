'use strict'

/**
 * Which uncommitted paths belong to ONE spec?
 *
 * `/spec-start` refuses a dirty tree because moving another spec's unfinished
 * work is not ours to do. But the commonest dirty tree there is — the spec you
 * just authored and are now starting — is not another spec's work at all, and
 * refusing it costs a round trip through `/commit` on every single start.
 *
 * The distinction this module draws is deliberately NOT "does the dirt look
 * important?" (a judgement, and the gate rightly refuses to make one) but
 * membership in an exactly-known set: the spec's own folder, plus whatever the
 * project declares in `spec.companionPaths`. Everything else is foreign, and one
 * foreign path disqualifies the whole tree.
 */

const path = require('node:path')
const { BUCKETS, expandTokens, readFrontmatterField } = require('./resolve.js')

// git reports repo-relative, forward-slashed paths; an untracked directory comes
// back with a trailing slash. Normalise both away so comparisons are exact.
function normalize(p) {
  return String(p || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
}

/**
 * Expand a `companionPaths` pattern for this spec, or return null when it cannot
 * be expanded.
 *
 * A PATTERN THAT REFERENCES `{identifier}` WHEN NO IDENTIFIER RESOLVES MATCHES
 * NOTHING, deliberately. Two ordinary situations produce a spec with no id — a
 * project that never set `branch.identifierField`, and a spec deliberately kept
 * local, never pushed to a tracker — and in both the file the pattern describes
 * either does not exist or belongs to some OTHER spec. Expanding `{identifier}`
 * to a placeholder, or dropping the token, would widen the owned set to a path
 * this spec has no claim on and sweep another spec's snapshot into its commit.
 * Being wrong this way costs a refusal the operator can fix with `/commit`; the
 * other way costs them a file they never staged.
 */
function expandCompanion(pattern, spec, config) {
  const tokens = { slug: spec.slug }
  if (/\{identifier\}/.test(pattern)) {
    const field = config && config.branch && config.branch.identifierField
    const identifier = readFrontmatterField(spec.path, field)
    if (!identifier) return null
    tokens.identifier = identifier
  }
  return normalize(expandTokens(pattern, tokens))
}

/**
 * Split `dirtyPaths` into the ones that belong to `spec` and the ones that do
 * not. Repo-relative paths in, repo-relative paths out; nothing is read from git
 * and nothing is written.
 *
 * Owned:
 *   - anything inside `specs/<bucket>/<folder>/` for ANY bucket. Every bucket is
 *     checked rather than the spec's current one because starting a spec MOVES it
 *     (backlog → in-progress), so a tree mid-move is dirty in two buckets at once
 *     and both halves are the same spec's.
 *   - each expandable `spec.companionPaths` entry.
 *
 * @returns {{owned: string[], foreign: string[]}}
 */
function classifyDirtyTree(spec, dirtyPaths, config) {
  const owned = []
  const foreign = []
  if (!spec) return { owned, foreign: (dirtyPaths || []).map(normalize).filter(Boolean) }

  const folders = BUCKETS.map((bucket) => `specs/${bucket}/${spec.folder}`)
  const companions = new Set()
  for (const pattern of (config && config.spec && config.spec.companionPaths) || []) {
    const expanded = expandCompanion(pattern, spec, config)
    if (expanded) companions.add(expanded)
  }

  for (const raw of dirtyPaths || []) {
    const p = normalize(raw)
    if (!p) continue
    const inFolder = folders.some((f) => p === f || p.startsWith(`${f}/`))
    if (inFolder || companions.has(p)) owned.push(p)
    else foreign.push(p)
  }
  return { owned, foreign }
}

module.exports = { classifyDirtyTree, expandCompanion }
