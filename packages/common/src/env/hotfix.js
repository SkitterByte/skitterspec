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
const { afterLandFor, rangeOf } = require('./integrate.js')

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
//
// Under `patch`, a base that is ITSELF a `-hotfix.N` tag continues that line.
// Bumping its patch takes X.Y.(Z+1), a number the mainline owns: refused when
// the mainline already cut it, and minted silently when it had not. Only a
// parsed hotfix suffix routes here; an rc or any other suffix keeps the patch
// bump, so a base we cannot read as a hotfix line is never treated as one.
function nextTag(baseTag, existingTags, bump = 'patch') {
  if (bump === 'patch') {
    const base = parseTag(baseTag)
    if (base && base.hotfix !== null) return nextHotfixTag(baseTag, existingTags)
    return bumpPatch(baseTag)
  }
  if (bump === 'hotfix-suffix') return nextHotfixTag(baseTag, existingTags)
  throw new Error(`unknown hotfix.bump "${bump}" — use one of: ${BUMPS.join(', ')}`)
}

// What a collision refusal offers: the free tag on the same base's hotfix
// line, which is never taken by a mainline release. Never a deletion and never
// another base — the first destroys a released tag, the second forks from a
// version prod is not running. Empty where the suffix line cannot be derived
// (an rc base) or is already the strategy, so the refusal just names the tag.
function freeTagHint(baseTag, existingTags, bump) {
  if (bump !== 'patch') return ''
  let free
  try {
    free = nextHotfixTag(baseTag, existingTags)
  } catch {
    return ''
  }
  return ` — set hotfix.bump "hotfix-suffix" in env.config.json to cut ${free} instead`
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
 *                          base, extraTargets: string[], existingTags: string[],
 *                          released?, push?: boolean, pushed?: boolean, remote?,
 *                          fixCommits?: string[],
 *                          carry?: { strategy: 'inplace'|'worktree'|'dirty', path,
 *                                    tmpPath?, commits: string[] } }
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
  // What a target cherry-picks: the fix commits by sha when the caller listed
  // them (the version commit already left out), else the bare range. The
  // range form is what this planner always emitted and what pure callers that
  // list nothing still get.
  const fixPick = Array.isArray(c.fixCommits) && c.fixCommits.length ? c.fixCommits : [fixRange]
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
      return block(`tag ${prodTag} already exists${freeTagHint(baseRef, c.existingTags, bump)}`)
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

  // 2. Publish the prod line: the branch first, then the tag, because the tag
  //    push is what starts the deploy. BEFORE anything is carried to main, so a
  //    declined or failed push never leaves main carrying a fix whose tag was
  //    never published. Three cases: the tag is already on the remote (a
  //    hand-run push, honoured on its positive signal); the operator consented
  //    (`--push`); or neither, and the run holds here with the commands printed.
  const remote = c.remote || 'origin'
  if (c.pushed) {
    steps.push({ kind: 'push', via: 'remote', remote, branch, cwd: spec.worktreePath })
  } else if (c.push) {
    steps.push({ kind: 'push', via: 'push', remote, branch, cwd: spec.worktreePath })
  } else {
    steps.push({ kind: 'push', via: 'hold', remote, branch, cwd: spec.worktreePath })
  }

  // 3. Extra targets: cherry-pick the fix onto a throwaway worktree at each tag,
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
      return block(`tag ${tag} (for target ${t}) already exists${freeTagHint(t, [...taken], bump)}`)
    }
    taken.add(tag)
    const slug = `${spec.slug}-onto-${tagSlug(t)}`
    const tmpBranch = `hotfix/${slug}`
    const tmpPath = path.join(wtRoot, slug)
    commands.push(
      `git worktree add ${tmpPath} -b ${tmpBranch} ${t}`,
      `git -C ${tmpPath} cherry-pick ${fixPick.join(' ')}`,
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
        ['-C', tmpPath, 'cherry-pick', ...fixPick],
        ['-C', tmpPath, 'tag', tag],
        ['-C', root, 'worktree', 'remove', tmpPath],
        ['-C', root, 'branch', '-D', tmpBranch],
      ],
    })
    targets.push({ kind: 'extra', base: t, tag, worktreePath: tmpPath })
  }

  // 4. Cherry-pick the fix onto the base branch (main) for the next release.
  //    Only then does the primary checkout gain anything, so only then do the
  //    after-land commands apply — a prod-only land leaves main untouched.
  let afterLand = result.afterLand
  if (hotfixCfg.cherryPickMain !== false) {
    // THE CARRY IS A LIST OF COMMITS, NOT A RANGE. A releasing command leaves
    // a version commit on the branch (package.json, CHANGELOG, RELEASES), and
    // main's version line never moves on a hotfix — so the caller hands over
    // `baseRef..branch` minus that commit and minus what `git cherry` says main
    // already has. The spec's own completion commits stay in it: that is how
    // the completed spec reaches main. Without a list (pure callers), the old
    // range form, run in place.
    const carry = c.carry || { strategy: 'inplace', path: c.mainRepoPath, commits: null }
    const picks = carry.commits || [fixRange]
    commands.push(
      carry.strategy === 'worktree'
        ? `git worktree add ${carry.tmpPath} ${c.base} && git -C ${carry.tmpPath} cherry-pick ${picks.join(' ')}`
        : `git -C ${carry.path} cherry-pick ${picks.join(' ')}`,
    )
    steps.push({
      kind: 'carry',
      base: c.base,
      strategy: carry.strategy,
      cwd: carry.path || c.mainRepoPath,
      root: c.mainRepoPath,
      tmpPath: carry.tmpPath || null,
      commits: picks,
    })
    targets.push({ kind: 'main', base: c.base })
    // The range is the files the carried fix touches — `carry.files`, read by
    // the caller from the fix commits; absent or unreadable → unknown → run.
    afterLand = afterLandFor(config, c.mainRepoPath, rangeOf({ changedFiles: carry.files }))
  }

  return { ...result, commands, steps, afterLand, prodTag, targets, fixRange }
}

/**
 * Plan `spec-env hotfix finish`: the teardown a hotfix waits for until its
 * deploy is out.
 *
 * A hotfix branch is needed until the release it cut is confirmed — a failed
 * deploy cuts the next `-hotfix.N` from the same branch — so `/spec-complete`
 * lands and keeps the worktree, and this is the later step that removes it.
 *
 * THREE GUARDS, every one a positive signal, and every failing one named:
 *   - a clean tree — anything uncommitted would go with the worktree;
 *   - a release tag at HEAD — the land actually released what is here;
 *   - the branch on the remote at HEAD — a copy exists after `branch -D`.
 *     A remote that cannot be asked is "cannot tell", which refuses: deleting
 *     the only copy of a deployed fix is not the safe way to be wrong.
 *
 * DELIBERATELY NO "MERGED INTO MAIN" GUARD: the version commit never reaches
 * main, so the branch is never an ancestor of it and `-d` would always refuse.
 * And DELIBERATELY NO `--force` — the guards are the point of the verb, and
 * `spec-env down --force` already exists for anyone who means to override them.
 *
 * state: { dirty, tagsAtHead: string[], head, remoteHead: string|null|undefined,
 *          remote, mainRepoPath, hasSlot }
 *   remoteHead: the branch's sha on the remote; null = not there;
 *               undefined = the remote could not be asked.
 */
function planHotfixFinish(spec, state) {
  const s = state || {}
  const remote = s.remote || 'origin'
  const reasons = []
  if (s.dirty) reasons.push('the worktree has uncommitted changes')
  const releaseTag = (s.tagsAtHead || []).find((t) => parseTag(t) !== null) || null
  if (!releaseTag) {
    reasons.push('no release tag at HEAD — run `spec-env hotfix land` first')
  }
  if (s.remoteHead === undefined) {
    reasons.push(`cannot tell whether ${spec.branch} is on ${remote} — the remote did not answer`)
  } else if (s.remoteHead === null) {
    reasons.push(`${spec.branch} is not on ${remote} — push it (\`hotfix land --push\`)`)
  } else if (s.head && s.remoteHead !== s.head) {
    reasons.push(`${remote}/${spec.branch} is not at HEAD — push the branch first`)
  }
  // A Docker stack has volumes and a slot that only `down` knows how to free.
  if (s.hasSlot) {
    reasons.push(`${spec.folder} holds a Docker stack — tear it down with \`spec-env down\``)
  }
  if (reasons.length) return { blocked: true, reasons, releaseTag, argvs: [] }
  const root = s.mainRepoPath
  return {
    blocked: false,
    reasons: [],
    releaseTag,
    argvs: [
      ['-C', root, 'worktree', 'remove', spec.worktreePath],
      // -D, not -d: the branch is never merged into main (see above), and its
      // commits are on the remote and under the release tag.
      ['-C', root, 'branch', '-D', spec.branch],
    ],
  }
}

module.exports = {
  bumpPatch,
  compareTags,
  nextHotfixTag,
  nextTag,
  BUMPS,
  tagSlug,
  planHotfixLand,
  planHotfixFinish,
}
