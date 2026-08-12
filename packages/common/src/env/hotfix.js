'use strict'

/**
 * Pure landing planner for `spec-env hotfix land`.
 *
 * A hotfix is built on an old release tag (its `Base version`), so it can't be
 * fast-forwarded onto `main` like an ordinary spec (that's `integrate.js`).
 * Instead `planHotfixLand` emits the exact side-effect-free, **never-pushing**
 * commands to:
 *   1. tag the hotfix branch head with the patch-bumped base tag (the prod deploy
 *      tag — the branch head already is baseRef + the fix);
 *   2. for each extra target tag, cherry-pick the fix onto a throwaway worktree at
 *      that tag and re-tag it with its own patch bump (test/demo release lines);
 *   3. cherry-pick the fix onto the base branch (main) for the next release.
 *
 * It performs no side effects — the caller (the CLI) probes git for `dirty` /
 * `aheadOfBase` / `existingTags` / `mainRepoPath` and supplies them, keeping this
 * deterministic and unit-testable with no live git. Conflict handling lives in the
 * skill (run a cherry-pick, abort on non-zero exit, hand back), mirroring
 * `integrate.js` — the planner never reasons about conflicts.
 */

const path = require('node:path')

/**
 * Parse a semver-ish tag and return it with its PATCH bumped by one. Preserves any
 * non-digit prefix (e.g. `v` → `v33.16.5`) and drops any pre-release/build suffix
 * (`-rc1`, `+build`). Throws on a tag with no `MAJOR.MINOR.PATCH` core.
 */
function bumpPatch(tag) {
  const m = /^(\D*)(\d+)\.(\d+)\.(\d+)(?:.*)$/.exec(String(tag || '').trim())
  if (!m) {
    throw new Error(
      `hotfix: cannot bump a patch version from tag "${tag}" — need <prefix>MAJOR.MINOR.PATCH`,
    )
  }
  const [, prefix, major, minor, patch] = m
  return `${prefix}${major}.${minor}.${Number(patch) + 1}`
}

// A filesystem/branch-safe slug derived from a tag (`v30.2.1` → `v30-2-1`).
function tagSlug(tag) {
  return String(tag)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * @param {object} spec  resolved hotfix spec: { slug, branch, worktreePath, baseRef, ... }
 * @param {object} config normalised env config (reads `config.hotfix`).
 * @param {object} ctx   { worktreeState:{dirty}, aheadOfBase, fixRange, mainRepoPath,
 *                          base, extraTargets: string[], existingTags: string[] }
 * @returns {object} { blocked, noop, reason, commands, prodTag, targets, branch, base }
 */
function planHotfixLand(spec, config, ctx) {
  const c = ctx || {}
  const branch = spec.branch
  const baseRef = spec.baseRef
  const hotfixCfg = (config && config.hotfix) || { cherryPickMain: true, targets: [] }
  const result = {
    blocked: false,
    noop: false,
    reason: null,
    commands: [],
    prodTag: null,
    targets: [],
    branch,
    base: c.base,
  }
  const block = (reason) => ({ ...result, blocked: true, reason })

  // A hotfix must carry the tag it forked from — everything below bumps from it.
  if (!baseRef) {
    return block('spec has no Base version — not a hotfix, or the header is missing')
  }
  // The completion edits (status flip, git mv) must be committed before landing.
  if (c.worktreeState && c.worktreeState.dirty) {
    return block('worktree has uncommitted changes — commit the completion first')
  }
  // Nothing on the branch beyond the base tag → nothing to land.
  if (!c.aheadOfBase) {
    return { ...result, noop: true, reason: `no commits on ${branch} beyond ${baseRef} — nothing to land` }
  }

  // Track tags we'd create so we never plan a collision (with an existing tag, or
  // between the prod tag and a target tag).
  const taken = new Set(c.existingTags || [])
  const fixRange = c.fixRange
  const commands = []
  const targets = []

  // 1. Prod line: tag the hotfix branch head (already baseRef + fix). No push.
  const prodTag = bumpPatch(baseRef)
  if (taken.has(prodTag)) {
    return block(`tag ${prodTag} already exists — bump the base version or delete the stale tag`)
  }
  taken.add(prodTag)
  commands.push(`git -C ${spec.worktreePath} tag ${prodTag}`)
  targets.push({ kind: 'prod', base: baseRef, tag: prodTag })

  // 2. Extra targets: cherry-pick the fix onto a throwaway worktree at each tag,
  //    re-tag with its own patch bump, then remove the worktree + temp branch (the
  //    commits survive under the new tag, so `-D` is safe for the throwaway branch).
  const wtRoot = path.dirname(spec.worktreePath)
  for (const t of c.extraTargets || []) {
    const tag = bumpPatch(t)
    if (taken.has(tag)) {
      return block(`tag ${tag} (for target ${t}) already exists — resolve it before landing`)
    }
    taken.add(tag)
    const slug = `${spec.slug}-onto-${tagSlug(t)}`
    const tmpBranch = `hotfix/${slug}`
    const tmpPath = path.join(wtRoot, slug)
    commands.push(
      `git worktree add ${tmpPath} -b ${tmpBranch} ${t}`,
      `git -C ${tmpPath} cherry-pick ${fixRange}`,
      `git -C ${tmpPath} tag ${tag}`,
      `git worktree remove ${tmpPath}`,
      `git branch -D ${tmpBranch}`,
    )
    targets.push({ kind: 'extra', base: t, tag, worktreePath: tmpPath })
  }

  // 3. Cherry-pick the fix onto the base branch (main) for the next release.
  if (hotfixCfg.cherryPickMain !== false) {
    commands.push(`git -C ${c.mainRepoPath} cherry-pick ${fixRange}`)
    targets.push({ kind: 'main', base: c.base })
  }

  return { ...result, commands, prodTag, targets, fixRange }
}

module.exports = { bumpPatch, tagSlug, planHotfixLand }
