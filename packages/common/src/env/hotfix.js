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
const { afterLandFor } = require('./integrate.js')

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

// A release tag's parts: `<prefix><major>.<minor>.<patch>[-<suffix>]`. A
// `hotfix.N` suffix is kept apart from every other one, because the two sort on
// opposite sides of their base (see compareTags). Null for anything else.
const TAG = /^(\D*)(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/
function parseTag(tag) {
  const m = TAG.exec(String(tag || '').trim())
  if (!m) return null
  const [, prefix, major, minor, patch, suffix = null] = m
  const hotfix = suffix && /^hotfix\.(\d+)$/.exec(suffix)
  return {
    prefix,
    core: [Number(major), Number(minor), Number(patch)],
    root: `${prefix}${major}.${minor}.${patch}`,
    hotfix: hotfix ? Number(hotfix[1]) : null,
    suffix: hotfix ? null : suffix,
  }
}

/**
 * Order two release tags: X.Y.Z-rc.N < X.Y.Z < X.Y.Z-hotfix.N < X.Y.(Z+1).
 *
 * This is skittership's rule and git's `version:refname` with a hotfix suffix
 * configured to sort after its base, so the two tools never disagree about
 * which tag is newer. A hotfix is a later build OF X.Y.Z; every other suffix is
 * a pre-release BEFORE it, as in semver. Hotfix numbers compare numerically
 * (`-hotfix.10` after `-hotfix.9`); other suffixes compare as strings. An
 * unparseable tag sorts first, so it can never be mistaken for the newest.
 */
function compareTags(a, b) {
  const x = parseTag(a)
  const y = parseTag(b)
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0)
  for (let i = 0; i < 3; i++) {
    if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i]
  }
  // Rank within one core: pre-release (0) < the release itself (1) < hotfix (2).
  const rank = (t) => (t.suffix ? 0 : t.hotfix === null ? 1 : 2)
  if (rank(x) !== rank(y)) return rank(x) - rank(y)
  if (x.hotfix !== null) return x.hotfix - y.hotfix
  if (x.suffix) return x.suffix < y.suffix ? -1 : x.suffix > y.suffix ? 1 : 0
  return 0
}

/**
 * The next `<root>-hotfix.<N>` for a base tag: N is one above the highest
 * `<root>-hotfix.*` among `existingTags`, else 1. The root is the base with any
 * hotfix suffix stripped, so a hotfix on `v36.4.0-hotfix.2` continues that
 * line. A later `X.Y.(Z+1)` is neither a collision nor counted — it is another
 * release line entirely. Same rule as skittership's release-hotfix.
 */
function nextHotfixTag(baseTag, existingTags) {
  const base = parseTag(baseTag)
  if (!base) {
    throw new Error(
      `hotfix: cannot derive a hotfix tag from "${baseTag}" — need <prefix>MAJOR.MINOR.PATCH`,
    )
  }
  if (base.suffix) {
    throw new Error(
      `hotfix: base tag "${baseTag}" is a pre-release — a hotfix needs a released version`,
    )
  }
  let n = base.hotfix || 0
  for (const t of existingTags || []) {
    const p = parseTag(t)
    if (p && p.root === base.root && p.hotfix !== null && p.hotfix > n) n = p.hotfix
  }
  return `${base.root}-hotfix.${n + 1}`
}

const BUMPS = ['patch', 'hotfix-suffix']

// The tag `hotfix.bump` asks for. An unknown strategy throws rather than
// falling back to `patch`: a typo there would otherwise cut the wrong release
// line and say nothing.
function nextTag(baseTag, existingTags, bump = 'patch') {
  if (bump === 'patch') return bumpPatch(baseTag)
  if (bump === 'hotfix-suffix') return nextHotfixTag(baseTag, existingTags)
  throw new Error(`unknown hotfix.bump "${bump}" — use one of: ${BUMPS.join(', ')}`)
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
 * @returns {object} { blocked, noop, reason, commands, afterLand, prodTag, targets, branch, base }
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
    steps: [],
    afterLand: afterLandFor(null),
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
  // What the engine runs (hotfixland.js). `commands` stays beside it as the
  // human-readable spelling of the same thing, for `--plan` and the tests.
  const steps = []
  const bump = hotfixCfg.bump || 'patch'
  const releaseWith = String(hotfixCfg.releaseWith || '').trim()

  // 1. Prod line: release the hotfix branch head (already baseRef + fix). No push.
  //    Three ways, decided here so the runner never has to: a release already
  //    cut on an earlier run and still at HEAD is reused, never re-cut; a
  //    project's `releaseWith` command cuts it and says which tag it made; or
  //    the built-in tagger tags HEAD with the `hotfix.bump` strategy's tag.
  let prodTag = null
  if (c.released && c.released.tag) {
    prodTag = c.released.tag
    taken.add(prodTag)
    steps.push({ kind: 'release', via: 'recorded', tag: prodTag, release: c.released })
  } else if (releaseWith) {
    // The tag is the command's to choose and is unknown until it has run, so
    // there is nothing to check a collision against here — the command refuses
    // a tag that exists, and the runner refuses one a target also planned.
    commands.push(`(cd ${spec.worktreePath} && ${releaseWith})`)
    steps.push({ kind: 'release', via: 'command', command: releaseWith, cwd: spec.worktreePath })
  } else {
    prodTag = nextTag(baseRef, c.existingTags, bump)
    if (taken.has(prodTag)) {
      return block(`tag ${prodTag} already exists — bump the base version or delete the stale tag`)
    }
    taken.add(prodTag)
    commands.push(`git -C ${spec.worktreePath} tag ${prodTag}`)
    steps.push({
      kind: 'release',
      via: 'tag',
      tag: prodTag,
      cwd: spec.worktreePath,
      baseTag: baseRef,
      branch,
    })
  }
  targets.push({ kind: 'prod', base: baseRef, tag: prodTag })

  // 2. Extra targets: cherry-pick the fix onto a throwaway worktree at each tag,
  //    re-tag with its own bump, then remove the worktree + temp branch (the
  //    commits survive under the new tag, so `-D` is safe for the throwaway branch).
  //    TAG-ONLY, deliberately: `releaseWith` is the prod line's. Running a
  //    project's release per target would need a hotfix/ branch and a clean
  //    tree for each one, and one failing half-way leaves a line half-released.
  const wtRoot = path.dirname(spec.worktreePath)
  for (const t of c.extraTargets || []) {
    // Counted against `taken`, so two targets on one root get successive
    // hotfix numbers rather than colliding on the same one.
    const tag = nextTag(t, [...taken], bump)
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
    const root = c.mainRepoPath
    steps.push({
      kind: 'target',
      base: t,
      tag,
      worktreePath: tmpPath,
      argvs: [
        ['-C', root, 'worktree', 'add', tmpPath, '-b', tmpBranch, t],
        ['-C', tmpPath, 'cherry-pick', fixRange],
        ['-C', tmpPath, 'tag', tag],
        ['-C', root, 'worktree', 'remove', tmpPath],
        ['-C', root, 'branch', '-D', tmpBranch],
      ],
    })
    targets.push({ kind: 'extra', base: t, tag, worktreePath: tmpPath })
  }

  // 3. Cherry-pick the fix onto the base branch (main) for the next release.
  //    Only then does the primary checkout gain anything, so only then do the
  //    after-land commands apply — a prod-only land leaves main untouched.
  let afterLand = result.afterLand
  if (hotfixCfg.cherryPickMain !== false) {
    commands.push(`git -C ${c.mainRepoPath} cherry-pick ${fixRange}`)
    steps.push({ kind: 'carry', base: c.base, argvs: [['-C', c.mainRepoPath, 'cherry-pick', fixRange]] })
    targets.push({ kind: 'main', base: c.base })
    afterLand = afterLandFor(config, c.mainRepoPath)
  }

  return { ...result, commands, steps, afterLand, prodTag, targets, fixRange }
}

module.exports = { bumpPatch, compareTags, nextHotfixTag, nextTag, BUMPS, tagSlug, planHotfixLand }
