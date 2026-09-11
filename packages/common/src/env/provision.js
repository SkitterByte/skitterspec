'use strict'

/**
 * Pure provisioning planner for `spec-env up`.
 *
 * Given a resolved spec and its allocated slot, `planUp` returns the exact
 * side-effecting commands the `/spec-env` skill runs (`git worktree add`,
 * `docker compose up`) and the rendered `.env` contents — but performs no side
 * effects itself. The caller (the CLI) reads/allocates the
 * registry and passes the slot; this stays deterministic and unit-testable with
 * no live git/docker.
 */

const { classifyDirtyTree } = require('./classify.js')
const { portOffset } = require('./registry.js')
const { renderEnvFile } = require('./render.js')
const { expandTokens } = require('./resolve.js')

/**
 * Build the POSIX-sh prefix that puts a command in the spec's worktree, or stops.
 *
 * Every command under the "then, in the worktree, run:" heading carries this.
 * Without it those commands stay silent when run from the wrong place: in the
 * primary checkout `$m` resolves to the checkout itself, so a seed's source and
 * target are the same path and it prints `exists — skipped` — indistinguishable
 * from a correctly-provisioned re-run — while a setup command like an install
 * runs against the main checkout and "succeeds" too. Three layers then agree that
 * nothing is wrong, and the caller carries on committing to `main`.
 *
 * A `cd` is deliberately chosen over comparing `git rev-parse --show-toplevel`
 * against `worktreePath`: the planned path is a lexical `path.resolve` while git
 * reports the symlink-resolved one (`/tmp` vs `/private/tmp` on macOS), so a
 * string compare would refuse a perfectly good worktree. `cd` sidesteps that, and
 * does better than refusing — it *positions* the command, so a caller who is in
 * the wrong directory still gets correct behaviour. When the worktree was never
 * created — the reported case — the `cd` fails and takes the whole command with
 * it, non-zero and loud.
 *
 * Per-command, not once at the top of the block: a single leading `cd` only
 * protects the sequence if the caller chains it with `&&`, and the reported
 * failure is precisely a caller that ran the steps as separate statements.
 */
function worktreeCd(worktreePath) {
  return (
    `cd "${worktreePath}" 2>/dev/null || ` +
    `{ echo "no worktree at ${worktreePath} — run the provisioning commands first"; exit 1; }`
  )
}

/**
 * Build one idempotent POSIX-sh command that seeds a gitignored file from the
 * main checkout into the current worktree (the cwd when the skill runs it).
 *
 * The main checkout is resolved at run time from inside the worktree via
 * `git rev-parse --git-common-dir` (absolute `<main>/.git` in a linked worktree)
 * and its dirname — never a hardcoded repo name or a `../..` hop. The command is
 * safe to re-run: a source absent in main is a printed no-op, an already-seeded
 * target (real file or symlink) is left untouched, and only a genuinely missing
 * target is created. `mode` is 'symlink' (points at main, stays in sync) or
 * 'copy' (an independent copy). Output mirrors the setup style: `seeded <f> → …`.
 */
function seedCommandFor(file, mode) {
  const op =
    mode === 'copy'
      ? `cp "$m/${file}" "${file}"`
      : `ln -s "$m/${file}" "${file}"`
  return (
    'm="$(dirname "$(git rev-parse --git-common-dir)")"; ' +
    `if [ ! -e "$m/${file}" ]; then echo "seed ${file}: not in main — skipped"; ` +
    `elif [ -e "${file}" ] || [ -L "${file}" ]; then echo "seed ${file}: exists — skipped"; ` +
    `else mkdir -p "$(dirname "${file}")" && ${op} && echo "seeded ${file} → $m/${file}"; fi`
  )
}


// Cap a path list in a message: enough to recognise, not a wall of text.
function listPaths(paths) {
  const shown = paths.slice(0, 5).join(', ')
  return paths.length > 5 ? `${shown}, and ${paths.length - 5} more` : shown
}

/**
 * Decide what an uncommitted tree means for a provisioning run: commit it, refuse
 * it, or ignore it.
 *
 * `/spec-start` refuses a dirty tree so another spec's unfinished work is never
 * moved without its author asking. But the commonest dirty tree of all is the
 * spec you just wrote and are now starting, and refusing THAT costs a round trip
 * through `/commit` on every start. So the question asked here is not "does this
 * dirt look important?" — a judgement the gate rightly declines to make — but
 * membership in an exactly-known set (see `classify.js`). One foreign path
 * disqualifies the whole tree.
 *
 * WHAT WOULD FOOL THIS: `ctx.dirtyPaths` being absent. That is not "the tree is
 * clean" — it is "nobody looked", which happens on every legacy caller and
 * whenever git itself could not be read. Either way it is never permission to
 * commit: with no classification there is no owned set, so no commit is planned.
 *
 * Whether it also REFUSES depends on `carriesChanges`, and the asymmetry is the
 * two modes' actual risk, not an inconsistency:
 *
 *   - checkout mode (`carriesChanges`) — `git switch -c` silently carries
 *     uncommitted work onto the new branch. Unable to see the tree means unable
 *     to rule that out, so it refuses, exactly as it did before this gate existed.
 *   - worktree mode — `git worktree add` carries nothing, and forks from a commit
 *     regardless. Refusing here would fire on a healthy repo whose git we merely
 *     could not read, which is a cost paid by someone who did nothing wrong. So
 *     it plans no commit and provisions as before.
 *
 * `specOnFork` is the other half, and a POSITIVE signal rather than an absence:
 * the worktree forks from a specific commit, so a spec absent from it produces a
 * branch missing the very spec it is for. A clean tree cannot detect that — the
 * spec may be committed, just somewhere else. `null` means the caller could not
 * tell (an unreadable git, or a hotfix, which forks from a tag predating its own
 * spec), and routes to carrying on, never to refusing.
 *
 * ctx: { dirtyPaths?, clean?, specOnFork?, specFoundOn?, forkRef?, specUntracked? }
 * @returns {{blocked: boolean, reason: string|null, commands: string[]}}
 */
function planSpecCommit(spec, ctx, config, { carriesChanges = false } = {}) {
  const ok = { blocked: false, reason: null, commands: [], owned: [], verb: null }
  const c = ctx || {}

  if (!Array.isArray(c.dirtyPaths)) {
    // Nobody looked: never commit, and refuse only where switching could carry
    // work we cannot see (see the asymmetry above).
    if (carriesChanges && c.clean === false) {
      return {
        blocked: true,
        reason:
          'the primary checkout has uncommitted changes — commit or stash them first' +
          (carriesChanges ? ' (switching would carry them onto the new branch)' : ''),
        commands: [],
        owned: [],
        verb: null,
      }
    }
    return ok
  }

  const { owned, foreign } = classifyDirtyTree(spec, c.dirtyPaths, config)

  if (foreign.length) {
    return {
      blocked: true,
      reason:
        `the primary checkout has uncommitted changes that are not ${spec.folder}'s — ` +
        'commit or stash them first' +
        (carriesChanges ? ' (switching would carry them onto the new branch)' : '') +
        `: ${listPaths(foreign)}`,
      commands: [],
    }
  }

  if (owned.length) {
    // `add` or `update`? Asked of git (`ctx.specUntracked`, from `git ls-files`)
    // rather than inferred from the shape of the status output. The inference —
    // "a bare directory entry means the folder is wholly untracked" — was wrong in
    // the ordinary case of the FIRST spec in a bucket, where git reports the
    // bucket as the untracked directory instead. The old inference stays as a
    // fallback for callers that pass no fact; unknown yields `update`, which is
    // never a false claim.
    const isNew =
      typeof c.specUntracked === 'boolean'
        ? c.specUntracked
        : owned.includes(`specs/${spec.bucket}/${spec.folder}`)
    const verb = isNew ? 'add' : 'update'
    return {
      blocked: false,
      reason: null,
      owned,
      verb,
      commands: [
        `git add ${owned.map((p) => `"${p}"`).join(' ')}`,
        `git commit -m "chore(spec): ${verb} ${spec.folder}"`,
      ],
    }
  }

  // Tree is clean. The spec must already be in the base branch's tree, or the
  // worktree forks without it.
  if (c.specOnFork === false) {
    return {
      blocked: true,
      reason:
        `${spec.folder} is not committed in ${c.forkRef || 'the fork point'}` +
        (c.specFoundOn ? ` — it is on ${c.specFoundOn}` : '') +
        ' — the worktree would fork without the spec it is for',
      commands: [],
    }
  }
  return ok
}

/**
 * Plan a provisioning run.
 *
 * @param {object} spec  resolved spec (from resolveSpec): { slug, type, branch,
 *                       worktreePath, projectName, ... }
 * @param {object} alloc { slot, attached } — attached:true when the slot already
 *                       existed in the registry (re-run → attach, don't clobber).
 * @param {object} config normalised env config.
 * @returns {object} { worktreePath, branch, projectName, slot, portOffset,
 *                     envContents, commands, seedCommands,
 *                     setupCommands, attached }
 */
function planUp(spec, alloc, config, ctx) {
  const { slot, attached } = alloc

  // Per-spec escalation: bring Docker up only when this spec's Stack is `docker`,
  // gated by the project master switch. A spec resolved without an explicit stack
  // (legacy/tests) follows the master switch — preserving pre-`Stack` behaviour.
  const stack = spec.stack || (config.docker.enabled ? 'docker' : 'worktree')
  const wantsDocker = stack === 'docker' && config.docker.enabled

  // Slot, port block and `.env` are Docker-only. A worktree-only spec takes none
  // of them: no registry slot, no PORT_OFFSET, no `.env`.
  const offset = wantsDocker ? portOffset(slot, config) : null
  const envContents = wantsDocker
    ? renderEnvFile({ projectName: spec.projectName, portOffset: offset })
    : null

  const tokens = {
    worktreePath: spec.worktreePath,
    slug: spec.slug,
    branch: spec.branch,
    projectName: spec.projectName,
    portOffset: offset === null ? '' : String(offset),
  }


  // File seeding runs *in the worktree* after `git worktree add`, before the
  // setup commands (which may depend on the seeded .env). Each entry becomes an
  // idempotent shell command resolving the main checkout at run time. Absent
  // config ⇒ no commands ⇒ current behaviour.
  const seed = config.seedFiles || { mode: 'symlink', files: [] }
  const seedMode = seed.mode === 'copy' ? 'copy' : 'symlink'
  const guard = worktreeCd(spec.worktreePath)
  const seedCommands = (seed.files || []).map(
    (file) => `${guard}; ${seedCommandFor(file, seedMode)}`,
  )

  // Bootstrap commands run *in the worktree* after `git worktree add` (before
  // Docker/dev), on every provision including re-attach — deps must exist for
  // the worktree to be usable. Kept separate from `commands` (run from the
  // primary checkout root); the CLI prints them under an "in the worktree" head.
  const setupCommands = (config.setup || []).map(
    (cmd) => `${guard}; ${expandTokens(cmd, tokens)}`,
  )

  const commands = []
  // Fresh branch → -b; attach an existing branch/slot → plain form (never clobber).
  // A hotfix forks its fresh branch from a release tag (`spec.baseRef`, e.g.
  // `v33.16.4`) instead of base HEAD — so the fix is built on the exact commit
  // line prod runs. Attaching an existing branch ignores baseRef (already forked).
  const forkPoint = !attached && spec.baseRef ? ` ${spec.baseRef}` : ''
  commands.push(
    attached
      ? `git worktree add ${spec.worktreePath} ${spec.branch}`
      : `git worktree add ${spec.worktreePath} -b ${spec.branch}${forkPoint}`,
  )
  if (wantsDocker) {
    commands.push(`docker compose --project-name ${spec.projectName} up -d`)
  }

  // The tree gate. A worktree forks from the base branch's tree, so an
  // uncommitted spec would produce a branch missing the spec it is for — this is
  // where that gets committed, or refused. Worktree mode had NO clean gate before
  // this: `git worktree add` does not carry uncommitted changes anywhere, so the
  // failure surfaced three steps later as a live-overlay refusal naming the wrong
  // stage. An absent `ctx` means no caller looked, and changes nothing.
  const gate = planSpecCommit(spec, ctx, config)

  return {
    blocked: gate.blocked,
    reason: gate.reason,
    specCommit: gate.owned && gate.owned.length ? { paths: gate.owned, verb: gate.verb } : null,
    worktreePath: spec.worktreePath,
    branch: spec.branch,
    projectName: spec.projectName,
    slot: wantsDocker ? slot : null,
    portOffset: offset,
    envContents,
    commands: gate.blocked ? [] : [...gate.commands, ...commands],
    seedCommands: gate.blocked ? [] : seedCommands,
    setupCommands: gate.blocked ? [] : setupCommands,
    attached,
  }
}

/**
 * Plan `spec-env up` in CHECKOUT mode — the branch is built in the primary
 * checkout and there is no worktree at all.
 *
 * Pure: every git fact it needs arrives in `ctx`, and it writes nothing.
 *
 * ctx: { current, base, onBase, clean, branchExists }
 *
 * What it refuses, and why each is a refusal rather than a warning:
 *  - a dirty tree, because `git switch -c` CARRIES uncommitted changes onto the
 *    new branch. That is silent and it is the operator's work, so it is theirs
 *    to place, not ours.
 *  - standing on another branch, because switching away from it is a decision
 *    about someone else's unfinished spec. Being on THIS spec's branch is not a
 *    refusal — it is the re-run, and the answer is "already attached".
 *
 * There is no bootstrap: the primary checkout already has its dependencies.
 */
function planCheckoutUp(spec, ctx, config) {
  const base = ctx.base || (config && config.baseBranch) || 'main'
  const result = {
    mode: 'checkout',
    blocked: false,
    reason: null,
    attached: false,
    branch: spec.branch,
    checkoutPath: ctx.checkoutPath || null,
    commands: [],
  }
  const block = (reason) => ({ ...result, blocked: true, reason })

  // Order matters: report "already attached" before anything else, so a re-run
  // on the spec's own branch is never refused for a dirty tree it legitimately
  // has — you are mid-phase, with the phase's own edits in progress.
  if (ctx.current && ctx.current === spec.branch) {
    return { ...result, attached: true }
  }
  // Same gate as worktree mode, but `git switch -c` genuinely CARRIES uncommitted
  // work onto the new branch, so the refusal keeps saying so.
  const gate = planSpecCommit(spec, ctx, config, { carriesChanges: true })
  if (gate.blocked) return block(gate.reason)
  if (!ctx.onBase) {
    return block(
      `the primary checkout is on ${ctx.current || '(detached)'}, not ${base} — ` +
        'finish or park that branch first; checkout mode holds one spec at a time',
    )
  }

  if (gate.owned && gate.owned.length) {
    result.specCommit = { paths: gate.owned, verb: gate.verb }
  }
  result.commands.push(...gate.commands)
  result.commands.push(
    ctx.branchExists ? `git switch ${spec.branch}` : `git switch -c ${spec.branch}`,
  )
  return result
}

module.exports = { planUp, planCheckoutUp, planSpecCommit, seedCommandFor, worktreeCd }
