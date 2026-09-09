'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { init, resync, reset, isExistingSetup } = require('./init.js')
const {
  detectReleaseTooling,
  removeReleaseTooling,
  releaseToolingNotice,
} = require('./deprecate.js')
const { loadEnvConfig } = require('./env/config.js')
const {
  readRegistry,
  writeRegistry,
  allocateSlot,
  freeSlot,
  portOffset,
} = require('./env/registry.js')
const {
  resolveSpec,
  resolveBaseBranch,
  resolvePrimaryCheckout,
  assertPrimaryOnMain,
  currentBranch,
  repoInfo,
  expandTokens,
  splitPrefix,
} = require('./env/resolve.js')
const {
  readReceipt,
  writeReceipt,
  clearReceipt,
  summarizeReceipt,
  migrationsHit,
  planTake,
  planRelease,
  planAbort,
} = require('./env/live.js')
const { ensureWorktreeDirTrusted } = require('./env/trust.js')
const { planUp, planCheckoutUp } = require('./env/provision.js')
const { planDown, planDownCheckout } = require('./env/teardown.js')
const { planPrune, liveSlugsForSpecs, reconcileRegistry } = require('./env/prune.js')
const { planIntegrate, planIntegrateCheckout } = require('./env/integrate.js')
const { planHotfixLand } = require('./env/hotfix.js')
const { planDev } = require('./env/dev.js')
const { startProcess, stopProcess, waitHealthy } = require('./env/supervise.js')
const { renderRoutes, portsInUse, waitListening } = require('./env/proxy.js')

const pkg = require('../package.json')

// Commands this (tracker-free) base does NOT ship, and the distribution that
// does. Without this the base says only "unknown command: spec-sync", which a
// user correctly reads as "no such feature" — nothing anywhere named the
// distribution that has it, so they were stranded. Naming Linear here is a
// diagnostic string, not provider machinery: `init.js` already knows
// `linear.config.json` and `linear-base/` by name in order to protect them.
const PROVIDER_COMMANDS = {
  'spec-sync': '@skitterbyte/skitterspec-linear',
  'spec-sanitise': '@skitterbyte/skitterspec-linear',
}

function unknownCommand(cmd) {
  const dist = PROVIDER_COMMANDS[cmd]
  if (dist) {
    return (
      `unknown command: ${cmd} — this is the base distribution, which does not ` +
      `ship it.\n  ${cmd} comes from ${dist} (a superset of this package): ` +
      `install that instead.`
    )
  }
  return `unknown command: ${cmd} (try --help)`
}

const HELP = `skitterspec — spec-driven-development for Claude Code

Usage:
  skitterspec init [dir]      Install the spec lifecycle skills, rule, and specs/
                              folders. On an already-set-up repo it detects that
                              and offers resync / start-again / leave (interactive)
                              — non-interactively it just adds anything missing.
  skitterspec update [dir]    Resync managed files to the latest, keeping your
                              edits (--force to overwrite). Leaves specs/ + live
                              .core config alone.
  skitterspec spec-env <cmd>  Per-spec isolation engine (opt-in; needs
                              specs/.core/env.config.json). Subcommands:
                                up <spec>         print the plan to provision a worktree +
                                                  Docker stack (prints commands; creates nothing)
                                down <spec>       tear down (guards; --keep-volumes, --force)
                                prune             reap orphaned test-DB volumes (--older-than <days>)
                                dev up <spec>     start host dev servers on the spec's ports
                                dev down <spec>   stop the spec's host dev servers
                                connect <spec>    expose a spec on the canonical ports (main = off)
                                integrate <spec>  plan rebase + fast-forward onto the base branch
                                hotfix land <spec>  tag + cherry-pick a hotfix (--also <tag>)
                                status            list provisioned specs + port blocks
                                resolve <spec>    print resolved slug/type/branch/paths
  skitterspec --help          Show this help
  skitterspec --version       Print version

Options (init / update):
  --resync                 (init) Update managed files to latest, keep your edits
  --reset                  (init) Start again: reset managed scaffolding fresh
                           (needs --yes; never touches your specs or config)
  --force                  Overwrite skill/rule/script files that already exist
  --diff                   (update) Show the upstream changes each customized
                           file declined, as a unified diff
  --dir <path>             Target project dir (default: positional arg or cwd)
  --no-claude-md           Skip creating/patching CLAUDE.md
  --yes, -y                Accept defaults; skip the interactive setup prompts
  --isolation / --no-isolation        Enable/skip per-spec isolation (a git
                                      worktree per spec; writes env.config.json)
  --remove-release-tooling            (update) Remove leftover release tooling
                                      non-interactively (moved to skittership)

Examples:
  npx @skitterbyte/skitterspec init
  npx @skitterbyte/skitterspec init ./my-app --yes
  npx @skitterbyte/skitterspec init --isolation
  npx @skitterbyte/skitterspec update --force
`

function parse(argv) {
  const opts = {
    force: false,
    claudeMd: true,
    dir: null,
    yes: false,
    isolation: undefined,
    removeReleaseTooling: false,
    resync: false,
    reset: false,
    diff: false,
  }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') opts.force = true
    else if (a === '--no-claude-md') opts.claudeMd = false
    else if (a === '--yes' || a === '-y') opts.yes = true
    else if (a === '--isolation') opts.isolation = true
    else if (a === '--no-isolation') opts.isolation = false
    else if (a === '--remove-release-tooling') opts.removeReleaseTooling = true
    else if (a === '--resync') opts.resync = true
    else if (a === '--reset') opts.reset = true
    else if (a === '--diff') opts.diff = true
    else if (a === '--dir') opts.dir = argv[++i]
    else if (a.startsWith('--')) throw new Error(`unknown option: ${a}`)
    else positional.push(a)
  }
  return { opts, positional }
}

// After an `update`, clean up release tooling left by an older skitterspec (it
// now lives in @skitterbyte/skittership). Deletes only on an explicit interactive
// "yes" or --remove-release-tooling; a non-TTY/--yes run only prints the pointer,
// so CI never mutates files. Nothing to do when no release tooling is present.
async function cleanupReleaseTooling(dir, opts) {
  const detection = detectReleaseTooling(dir)
  if (!detection.present) return

  const printRemoved = (removed) => {
    process.stdout.write('\nRemoved release tooling (moved to @skitterbyte/skittership):\n')
    for (const it of removed) process.stdout.write(`  ${it}\n`)
    process.stdout.write('Your CHANGELOG.md / RELEASES.md content was left untouched.\n')
  }

  if (opts.removeReleaseTooling) {
    printRemoved(removeReleaseTooling(dir, detection).removed)
    return
  }

  const interactive = Boolean(process.stdin.isTTY) && !opts.yes
  if (!interactive) {
    process.stdout.write(`\n${releaseToolingNotice()}\n`)
    return
  }

  const { confirmRemoveReleaseTooling } = require('./prompts.js')
  if (await confirmRemoveReleaseTooling(detection)) {
    printRemoved(removeReleaseTooling(dir, detection).removed)
  } else {
    process.stdout.write(`\n${releaseToolingNotice()}\n`)
  }
}

// --- spec-env: per-spec isolation engine (Phase 1: status + resolve) --------

/**
 * Print what is provisioned: every spec that owns a git worktree, with its slot
 * and port block when it has one.
 *
 * The worktree — not the slot registry — is what "provisioned" means. `specEnvUp`
 * allocates a slot only when `wantsDocker`, so a `Stack: worktree` spec never
 * enters the registry and a project with `docker.enabled: false` has an
 * permanently empty one. Reading the registry alone reported `no provisioned
 * specs` while worktrees were standing.
 *
 * The registry is still read, but only to ANNOTATE a spec that has a slot — it
 * is the authority on port blocks and nothing else.
 *
 * BLIND SPOT: a worktree removed behind git's back (`rm -rf` without
 * `git worktree prune`) stays listed until pruned. That over-reports, which is
 * the harmless direction for a read-only report.
 */
function specEnvStatus(dir, config) {
  const worktreePaths = liveWorktreePaths(dir)
  const provisioned = allSpecs(dir, config, worktreePaths)
    .map((s) => ({ folder: s.folder, wt: path.resolve(s.worktreePath) }))
    // The primary checkout is itself in `git worktree list`; a spec is
    // provisioned only when it has its OWN worktree, separate from it.
    .filter((s) => s.wt !== dir && worktreePaths.has(s.wt))
    .sort((a, b) => a.folder.localeCompare(b.folder))

  if (!provisioned.length) {
    process.stdout.write('spec-env: no provisioned specs.\n')
    return
  }

  const registry = readRegistry(dir, config)
  process.stdout.write('Provisioned specs:\n')
  for (const { folder, wt } of provisioned) {
    const slot = registry.slots[folder]
    let ports = ''
    if (slot !== undefined) {
      const off = portOffset(slot, config)
      ports = `  slot ${slot}  ports ${off}-${off + config.docker.portsPerSpec - 1}`
    }
    process.stdout.write(`  ${folder}${ports}\n    ${path.relative(dir, wt) || wt}\n`)
  }
}

// Plan a provision: allocate the slot, persist the registry, and print the plan
// the /spec-env skill executes (git worktree add, docker compose up, .env,
// opener). This creates no worktree and starts no stack — the caller runs the
// printed commands. Keep the output's verb honest about that.

// git quotes a path containing unusual bytes and C-escapes it. Unquote what we
// can; anything we cannot parse confidently is returned as-is, which makes it
// fail the spec-folder comparison and land in `foreign` — a refusal, which is the
// safe direction to be wrong in.
function unquotePath(p) {
  if (!p.startsWith('"') || !p.endsWith('"')) return p
  try {
    return JSON.parse(p)
  } catch {
    return p
  }
}

/**
 * Repo-relative paths of everything uncommitted. Returns null when git could not
 * be read at all — the caller must treat that as "nobody looked", never "clean".
 *
 * Two prefix-free listings rather than `git status --porcelain`, deliberately.
 * Porcelain prefixes every path with a two-character status field, and the shared
 * git reader TRIMS its output — which eats the leading space of the first line
 * only, so a fixed-offset parse silently returned `EADME.md` for `README.md`.
 * These emit bare paths, so there is no offset to get wrong. `--others` also
 * lists untracked files INDIVIDUALLY, where porcelain collapses them into their
 * topmost untracked directory — reporting a brand-new spec as `specs/backlog/`,
 * an ancestor attributable to no single spec, and so refusing the very tree this
 * gate exists to accept. Both were found by running it, not by reading it.
 */
function dirtyPaths(git) {
  const lists = [
    git(['diff', '--name-only', 'HEAD']),
    git(['ls-files', '--others', '--exclude-standard']),
  ]
  if (lists.every((l) => l === null)) return null
  const out = []
  for (const list of lists) {
    if (!list) continue
    for (const line of list.split('\n')) {
      const q = line.trim()
      if (q) out.push(unquotePath(q))
    }
  }
  return out
}

// Is this spec new to git? Asked directly, so the commit subject does not depend
// on the shape of `git status` output.
function specIsUntracked(dir, git, spec) {
  const rel = path.relative(dir, spec.path).split(path.sep).join('/')
  const tracked = git(['ls-files', '--', rel])
  return tracked === null ? null : tracked.length === 0
}

/**
 * Is this spec present in the commit the worktree will fork from?
 *
 * A worktree forks from HEAD (`git worktree add -b`), so a spec absent there
 * yields a branch missing the very spec it is for — and a clean working tree
 * cannot detect that, because the spec may be perfectly well committed elsewhere.
 * This asks the positive question rather than inferring it from cleanliness.
 *
 * A HOTFIX IS EXEMPT, and not as an edge case: it forks from a released tag
 * (`spec.baseRef`) that by definition predates the spec describing the fix, so
 * the spec is *supposed* to be absent there. Checking it would refuse every
 * hotfix — an accusation aimed squarely at correct behaviour.
 *
 * Returns `{ onFork, foundOn }`; `onFork: null` means "cannot tell" (a hotfix, or
 * a git that would not answer), which the planner routes to carrying on.
 */
function specOnForkPoint(dir, git, spec) {
  if (spec.baseRef) return { onFork: null, foundOn: null }
  const rel = path.relative(dir, spec.path).split(path.sep).join('/')
  if (git(['cat-file', '-e', `HEAD:${rel}/00-overview.md`]) !== null) {
    return { onFork: true, foundOn: null }
  }
  // Best-effort: name the branch that does have it, so the refusal is actionable.
  let foundOn = null
  const sha = git(['log', '--all', '--format=%H', '-1', '--', rel])
  if (sha) {
    const branches = git(['branch', '--contains', sha, '--format=%(refname:short)'])
    if (branches) foundOn = branches.split('\n').map((b) => b.trim()).filter(Boolean)[0] || null
  }
  return { onFork: false, foundOn }
}


// Say what is about to be committed, and why it qualified. The commit is planned
// on the operator's behalf, so it is never allowed to be a surprise: the paths are
// listed before the commands that stage them.
function specCommitLines(plan, folder) {
  if (!plan.specCommit) return []
  const out = ['', `  uncommitted, and all of it is ${folder}'s — it will be committed first:`]
  for (const p of plan.specCommit.paths) out.push(`    ${p}`)
  return out
}

// `spec-env up` in checkout mode. Gathers the git facts, hands them to the pure
// planner, and prints the plan or the refusal.
function specEnvUpCheckout(dir, config, spec) {
  const git = gitReader(dir)
  const primary = assertPrimaryOnMain(config, git)
  const base = resolveBaseBranch(config, git)
  const status = git(['status', '--porcelain', '-uall'])
  const onFork = specOnForkPoint(dir, git, spec)

  const plan = planCheckoutUp(
    spec,
    {
      current: primary.branch,
      base,
      onBase: primary.onBase,
      // A null status means git could not be read at all. Treated as NOT clean:
      // the harmless outcome of being wrong is a refusal the operator can act
      // on, and the harmful one is carrying their work onto a new branch.
      clean: status !== null && status.length === 0,
      dirtyPaths: dirtyPaths(git),
      specOnFork: onFork.onFork,
      specFoundOn: onFork.foundOn,
      forkRef: primary.branch || 'HEAD',
      specUntracked: specIsUntracked(dir, git, spec),
      branchExists: git(['rev-parse', '--verify', `refs/heads/${spec.branch}`]) !== null,
      checkoutPath: dir,
    },
    config,
  )

  if (plan.blocked) {
    process.stdout.write(`spec-env up: blocked — ${plan.reason}.\n`)
    return
  }

  const out = [
    `spec-env up: ${spec.folder} ` +
      (plan.attached ? '(already on this branch — nothing to do)' : '(plan — nothing created yet)'),
    '',
    `  mode:      checkout (branch built in the primary checkout)`,
    `  checkout:  ${plan.checkoutPath}`,
    `  branch:    ${plan.branch}`,
    '  stack:     checkout-only (no worktree, no docker, no port block)',
  ]
  out.push(...specCommitLines(plan, spec.folder))
  if (plan.commands.length) {
    out.push('')
    out.push('  to provision, run:')
    for (const cmd of plan.commands) out.push(`    ${cmd}`)
  }
  process.stdout.write(out.join('\n') + '\n')
}

function specEnvUp(dir, config, specArg) {
  const spec = resolveSpecWithWorktree(dir, config, specArg)

  // Checkout mode: the branch is built in the primary checkout, so none of the
  // worktree machinery below applies — no slot, no trust entry, no bootstrap and
  // no opener. Handled first precisely so none of that runs by accident.
  if (config.mode === 'checkout') {
    specEnvUpCheckout(dir, config, spec)
    return
  }

  // Live-safe: if this spec is already live on the primary checkout (its branch was
  // branch-switched in by `live take`), a `git worktree add` would fail — the branch
  // is checked out there. Point the operator at the primary checkout rather than
  // emit a plan that can't run (see spec feat-live-spec-flow).
  const primaryUp = assertPrimaryOnMain(config, gitReader(dir))
  if (!primaryUp.onBase && primaryUp.branch === spec.branch) {
    process.stdout.write(
      `spec-env up: ${spec.folder} is live in the primary checkout — work there directly ` +
        '(its branch is checked out), or run `/spec-live main` first to re-isolate its worktree.\n',
    )
    return
  }

  // Trust the shared worktree root so edits into the freshly-provisioned worktree
  // don't prompt. One absolute entry (the root) covers every spec; self-heals on
  // every provision for teammates who only cloned and ran /spec-start.
  const worktreeRootAbs = path.dirname(spec.worktreePath)
  const trust = ensureWorktreeDirTrusted(dir, worktreeRootAbs)

  const wantsDocker = spec.stack === 'docker' && config.docker.enabled

  // Slot allocation is Docker-only: a worktree-only spec never touches the
  // registry (no slot, no port block). Its re-run signal is the worktree already
  // existing on disk (attach the branch, don't `-b`); a Docker spec's is its slot.
  let slot = null
  let attached
  if (wantsDocker) {
    const before = readRegistry(dir, config)
    attached = Object.prototype.hasOwnProperty.call(before.slots, spec.folder)
    const alloc = allocateSlot(before, spec.folder)
    slot = alloc.slot
    writeRegistry(dir, config, alloc.registry) // the engine's only write (Docker path)
  } else {
    attached = fs.existsSync(spec.worktreePath)
  }

  // The tree gate: the same facts the checkout planner gets. A worktree forks
  // from base, so an uncommitted spec would produce a branch without it.
  const upGit = gitReader(dir)
  const upStatus = upGit(['status', '--porcelain'])
  const upOnFork = specOnForkPoint(dir, upGit, spec)
  const plan = planUp(spec, { slot, attached }, config, {
    clean: upStatus !== null && upStatus.length === 0,
    dirtyPaths: dirtyPaths(upGit),
    specOnFork: upOnFork.onFork,
    specFoundOn: upOnFork.foundOn,
    forkRef: spec.baseRef || currentBranch(upGit) || 'HEAD',
    specUntracked: specIsUntracked(dir, upGit, spec),
  })

  if (plan.blocked) {
    process.stdout.write(`spec-env up: blocked — ${plan.reason}.\n`)
    return
  }

  const out = []
  // `up` is a planner: it prints commands for the caller to run and creates no
  // worktree or stack itself (the registry slot and the trust entry, both reported
  // separately below, are its only writes). Say so in the verb — a past-tense
  // "(provisioned)" reads as a completed state change, and a caller that believes
  // it skips the commands and works on `main`, which is what isolation exists to
  // prevent.
  out.push(
    `spec-env up: ${spec.folder} ` +
      (attached ? '(plan — worktree exists; will attach)' : '(plan — nothing created yet)'),
  )
  out.push('')
  out.push(`  worktree:  ${plan.worktreePath}`)
  out.push(`  branch:    ${plan.branch}`)
  if (plan.slot !== null) {
    const hi = plan.portOffset + config.docker.portsPerSpec - 1
    out.push(`  project:   ${plan.projectName}`)
    out.push(`  slot:      ${plan.slot}  (ports ${plan.portOffset}-${hi})`)
  } else {
    out.push('  stack:     worktree-only (no docker, no port block)')
  }
  // The loader falls back silently on an unrecognised `mode`, so this line is
  // the operator's only evidence of which mode actually resolved — print it
  // whenever it was set explicitly, right or wrong.
  out.push('  mode:      worktree (each spec gets its own checkout)')
  if (trust.reason === 'malformed') {
    out.push(
      '  trusted:   ! .claude/settings.local.json is not valid JSON — left it;' +
        `\n             add ${worktreeRootAbs} to permissions.additionalDirectories yourself`,
    )
  } else {
    out.push(
      `  trusted:   ${worktreeRootAbs}  ` +
        `(${trust.changed ? 'added to' : 'already in'} .claude/settings.local.json)`,
    )
  }
  out.push(...specCommitLines(plan, spec.folder))
  out.push('')
  out.push('  to provision, run:')
  for (const cmd of plan.commands) out.push(`    ${cmd}`)
  if (plan.openCommand) out.push(`    ${plan.openCommand}`)
  // Seed files first (setup may depend on them), then the setup commands —
  // both run in the worktree, under one heading.
  const worktreeSteps = [...plan.seedCommands, ...plan.setupCommands]
  if (worktreeSteps.length) {
    out.push('')
    out.push('  then, in the worktree, run:')
    for (const cmd of worktreeSteps) out.push(`    ${cmd}`)
  }
  if (plan.envContents) {
    out.push('')
    out.push(`  write ${config.docker.envFile} in the worktree:`)
    for (const line of plan.envContents.replace(/\n$/, '').split('\n')) {
      out.push(`    ${line}`)
    }
  }
  process.stdout.write(out.join('\n') + '\n')
}

// A read-only git reader over `cwd`: returns trimmed stdout, or null on failure.
function gitReader(cwd) {
  return (argv) => {
    try {
      return execFileSync('git', ['-C', cwd, ...argv], {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim()
    } catch {
      return null
    }
  }
}

// Query a worktree's git state (side-effecting — kept in the CLI, not the pure
// planner). A missing worktree → nothing to lose (safe to tear down). `base` is
// the resolved integration branch; `merged` is true when HEAD is already an
// ancestor of it (fully landed), which lets teardown skip the unpushed guard.
function worktreeGitState(worktreePath, base) {
  if (!fs.existsSync(worktreePath)) {
    return { dirty: false, unpushed: false, merged: true, reachableFromTag: false, remoteBranch: null }
  }
  const git = gitReader(worktreePath)

  const status = git(['status', '--porcelain'])
  const dirty = status !== null && status.length > 0

  let unpushed = false
  const ahead = git(['rev-list', '--count', '@{u}..HEAD'])
  if (ahead !== null) {
    // commits on HEAD's upstream branch not yet pushed
    unpushed = Number(ahead) > 0
  } else {
    // no upstream configured → any commit on HEAD not on a remote counts
    const local = git(['log', '--oneline', 'HEAD', '--not', '--remotes'])
    unpushed = local !== null && local.length > 0
  }

  // merged = HEAD is an ancestor of base (every commit already landed). The
  // worktree shares the object store, so `base` is visible here. `--is-ancestor`
  // exits 0 when true; gitReader maps a non-zero exit to null.
  const merged = base != null && git(['merge-base', '--is-ancestor', 'HEAD', base]) !== null

  // reachableFromTag = HEAD is captured by a tag (the deploy tag from `hotfix
  // land`). A hotfix branch is never merged into base, so this is what tells
  // teardown its commits are safely recoverable.
  const pointing = git(['tag', '--points-at', 'HEAD'])
  const reachableFromTag = pointing !== null && pointing.length > 0

  // remoteBranch = the remote-tracking ref for this worktree's branch when one
  // actually exists here (e.g. "origin/feat/thing"), else null. Teardown plans a
  // remote delete off it, so it has to be a ref we can SEE — never an inference
  // from the branch name, and never a bare assumption that `origin` has it.
  //
  // WHAT WOULD FOOL THIS, both left open deliberately:
  //   * A STALE ref — the branch was deleted from another clone and this one
  //     hasn't pruned. We plan a delete that no-ops: `git push --delete` errors
  //     on a branch that isn't there, which is loud, not destructive.
  //   * A branch pushed FROM ANOTHER MACHINE has no remote-tracking ref here, so
  //     teardown misses it and the remote branch survives. That is the safe
  //     direction — under-cleaning. Closing it means `git ls-remote`, which makes
  //     every teardown network-dependent for what is cosmetic cleanup. Not done.
  //
  // Upstream first, so a non-`origin` remote is honoured; `--abbrev-ref` gives the
  // short ref, and the verify catches an upstream configured for a ref that is
  // gone. With no upstream (the branch was pushed without `-u`), ask each remote
  // in turn rather than guessing a name.
  let remoteBranch = null
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (upstream && git(['rev-parse', '--verify', '--quiet', `refs/remotes/${upstream}`]) !== null) {
    remoteBranch = upstream
  } else {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
    if (branch && branch !== 'HEAD') {
      for (const remote of (git(['remote']) || '').split('\n').map((r) => r.trim()).filter(Boolean)) {
        if (git(['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`]) !== null) {
          remoteBranch = `${remote}/${branch}`
          break
        }
      }
    }
  }

  return { dirty, unpushed, merged, reachableFromTag, remoteBranch }
}

// A deterministic-enough compact timestamp for backup filenames (CLI-only; the
// pure planner receives this as input so it stays testable).
function compactTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '')
    .replace('T', '-')
}

// Teardown: evaluate guards, print the plan, free the slot. Idempotent no-op
// when the spec was never provisioned / already torn down. Deliberately does NOT
// touch the trusted worktree root in .claude/settings.local.json — that entry is
// the shared parent of every spec's worktree and harmless when empty; removing it
// would just re-prompt on the next /spec-start (see spec: isolation-trusts-worktree-dir).
function specEnvDown(dir, config, specArg, flags) {
  const spec = resolveSpecWithWorktree(dir, config, specArg)

  // A worktree-only spec never held a slot but its worktree still needs removing,
  // so "nothing to do" means neither a slot nor a worktree exists.
  // Checkout mode first: there is no worktree and no registry slot by design, so
  // the "not provisioned" guard below would report a live spec as absent.
  if (config.mode === 'checkout') {
    const dgit = gitReader(dir)
    const dbase = resolveBaseBranch(config, dgit)
    if (dgit(['rev-parse', '--verify', `refs/heads/${spec.branch}`]) === null) {
      process.stdout.write(`spec-env down: ${spec.folder} has no branch — nothing to do.\n`)
      return
    }
    const dst = dgit(['status', '--porcelain'])
    const contains = dgit(['branch', '--contains', spec.branch, '--list', dbase])
    const dplan = planDownCheckout(spec, config, flags, {
      dirty: dst === null || dst.length > 0,
      landed: Boolean(contains && contains.trim()),
      onBranch: dgit(['rev-parse', '--abbrev-ref', 'HEAD']) === spec.branch,
      base: dbase,
      checkoutPath: dir,
    })
    if (dplan.blocked) {
      process.stdout.write(
        `spec-env down: blocked — ${dplan.reason}.\n` +
          'Re-run with --force to tear down anyway (deletes the branch).\n',
      )
      return
    }
    const dout = [`spec-env down: ${spec.folder}`, '',
                  '  mode:      checkout (no worktree, no slot, no volumes)',
                  `  branch:    ${dplan.branch}`, '', '  run these:']
    for (const cmd of dplan.commands) dout.push(`    ${cmd}`)
    process.stdout.write(dout.join('\n') + '\n')
    return
  }

  const registry = readRegistry(dir, config)
  const hasSlot = Object.prototype.hasOwnProperty.call(registry.slots, spec.folder)
  if (!hasSlot && !fs.existsSync(spec.worktreePath)) {
    process.stdout.write(`spec-env down: ${spec.folder} is not provisioned — nothing to do.\n`)
    return
  }

  const base = resolveBaseBranch(config, gitReader(dir))
  const worktreeState = worktreeGitState(spec.worktreePath, base)
  const plan = planDown(spec, config, flags, { worktreeState, timestamp: compactTimestamp() })

  if (plan.blocked) {
    process.stdout.write(
      `spec-env down: blocked — ${plan.reason}.\n` +
        'Re-run with --force to tear down anyway (destroys the worktree).\n',
    )
    return
  }

  // Free the slot (the engine's only write on down) — only if one was held; a
  // worktree-only teardown never touches the registry.
  if (hasSlot) {
    writeRegistry(dir, config, freeSlot(registry, spec.folder))
  }

  const out = []
  out.push(`spec-env down: ${spec.folder}${hasSlot ? ' (slot freed)' : ''}`)
  out.push('')
  out.push(`  worktree:  ${spec.worktreePath}`)
  out.push(`  volumes:   ${plan.volumesDropped ? 'dropped' : 'kept'}`)
  if (plan.backupPath) out.push(`  backup:    ${plan.backupPath}`)
  else if (plan.volumesDropped) out.push('  backup:    none (no docker.backupCommand set)')
  out.push('')
  out.push('  run these:')
  for (const cmd of plan.commands) out.push(`    ${cmd}`)
  // Kept out of `run these:` on purpose — everything above is local and
  // reversible-ish, while this reaches a shared remote. The skills ask before
  // running it; a project that never wants to be asked sets
  // `teardown.deleteRemoteBranch: "always"`, which folds it in above instead.
  if (plan.remoteCommands && plan.remoteCommands.length) {
    out.push('')
    out.push('  remote branch — confirm with the user first:')
    for (const cmd of plan.remoteCommands) out.push(`    ${cmd}`)
  }
  process.stdout.write(out.join('\n') + '\n')
}

// --- prune: reap orphaned per-spec test-DB volumes -------------------------

// Live Docker volumes in the repo namespace (`{repoSlug}_…`). Returns
// { ok, names }: ok:false means docker is unavailable / errored (non-fatal — the
// caller reports and skips). The `name=` filter is a substring match, so we
// re-check the prefix in the pure planner.
function listRepoVolumes(repoSlug) {
  try {
    const out = execFileSync(
      'docker',
      ['volume', 'ls', '--format', '{{.Name}}', '--filter', `name=${repoSlug}_`],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
      .toString()
      .trim()
    const names = out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : []
    return { ok: true, names }
  } catch (error) {
    const err = (error.stderr && error.stderr.toString().trim()) || error.message
    return { ok: false, names: [], err }
  }
}

// Map orphan-candidate volume names → creation epoch-ms via `docker volume
// inspect`. Unknown/unparseable timestamps stay null (the planner keeps them).
function volumeCreatedAt(names) {
  const byName = new Map()
  if (!names.length) return byName
  try {
    const out = execFileSync(
      'docker',
      ['volume', 'inspect', '--format', '{{.Name}}\t{{.CreatedAt}}', ...names],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
      .toString()
      .trim()
    for (const line of out.split('\n')) {
      const [name, created] = line.split('\t')
      const ms = created ? Date.parse(created.trim()) : NaN
      if (name) byName.set(name.trim(), Number.isNaN(ms) ? null : ms)
    }
  } catch {
    // Inspect failed wholesale → treat every candidate as unknown-age (kept).
  }
  return byName
}

// Absolute paths of every checkout git knows about (primary + all worktrees).
function liveWorktreePaths(dir) {
  const out = gitReader(dir)(['worktree', 'list', '--porcelain'])
  const paths = new Set()
  if (out == null) return paths
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      paths.add(path.resolve(line.slice('worktree '.length).trim()))
    }
  }
  return paths
}

/**
 * The spec to act on when the caller named none.
 *
 * Two signals, strongest first:
 *
 *   1. **The worktree you are standing in.** A spec-env verb run from inside a
 *      spec's worktree means that spec — there is nothing to infer. This is the
 *      case that carries the feature in practice: several worktrees at once is
 *      the normal shape of this workflow, so "the only one" rarely resolves.
 *   2. **The only spec that has a worktree**, when cwd says nothing (you are in
 *      the primary checkout, or somewhere else entirely).
 *
 * `git worktree list` is the authority for both, and deliberately so. Two
 * nearer-looking signals are wrong here:
 *
 *   - The **slot registry** covers only Docker specs — `specEnvUp` allocates a
 *     slot exclusively when `wantsDocker`, so a `Stack: worktree` spec never
 *     appears in it and a project with `docker.enabled: false` has a permanently
 *     empty registry. Absence there says nothing about provisioning.
 *   - The **`specs/in-progress/` bucket** says a spec is being worked on, not
 *     that it has a worktree — and git does not track an empty directory, so the
 *     bucket disappears the moment it empties.
 *
 * Three outcomes, never two: resolved → that spec; several candidates and no cwd
 * hint → throw, listing them; none → throw, pointing at /spec-start. *Cannot tell*
 * never becomes a guess.
 *
 * BLIND SPOT: a spec taken live with `/spec-live` has had its branch moved into
 * the primary checkout and its worktree left on a detached HEAD — it still has a
 * worktree, so it is still a candidate, which is correct. What would fool this is
 * a worktree removed behind git's back (`rm -rf` without `git worktree prune`);
 * git keeps listing it as prunable. That over-reports rather than under-reports,
 * so the failure is an ambiguity error, never a wrong spec.
 */
function soleProvisionedSpec(dir, config, cwd = process.cwd()) {
  const worktreePaths = liveWorktreePaths(dir)
  const provisioned = allSpecs(dir, config, worktreePaths)
    .map((s) => ({ folder: s.folder, wt: path.resolve(s.worktreePath) }))
    // The primary checkout is itself in `git worktree list`; a spec is
    // provisioned only when it has its OWN worktree, separate from it.
    .filter((s) => s.wt !== dir && worktreePaths.has(s.wt))
    .sort((a, b) => a.folder.localeCompare(b.folder))

  // 1. Standing inside a spec's worktree names it outright. Deepest match wins,
  //    so a nested worktree is not shadowed by an ancestor one.
  let here
  try {
    here = fs.realpathSync(path.resolve(cwd))
  } catch {
    here = path.resolve(cwd)
  }
  const inside = provisioned
    .filter((s) => here === s.wt || here.startsWith(s.wt + path.sep))
    .sort((a, b) => b.wt.length - a.wt.length)[0]
  if (inside) return inside.folder

  // 2. Otherwise only an unambiguous set answers.
  if (provisioned.length === 1) return provisioned[0].folder
  if (provisioned.length === 0) {
    throw new Error(
      'no spec given, and no spec has a worktree — name one explicitly, or run ' +
        '/spec-start to provision it.',
    )
  }
  throw new Error(
    `no spec given, and ${provisioned.length} specs have worktrees — name the one ` +
      `you mean, or run this from inside one:\n` +
      provisioned.map((s, i) => `  ${i + 1}. ${s.folder}`).join('\n'),
  )
}

// Resolve a spec argument the ONE way every spec-env subcommand resolves it:
// against the primary checkout first, then the spec's own worktree, then every
// other checkout git knows about. An in-progress spec is git-mv'd into
// specs/in-progress/ **on its own branch**, so it exists only in its worktree —
// a primary-checkout-only lookup fails for exactly the specs these commands
// serve. The first fallback is the worktree path the config derives for this
// spec (cheap, no git); the rest come from `git worktree list`, so a worktree
// provisioned under an older `worktree.root` still resolves. Identity and
// coordinate tokens always expand against `dir` (the primary checkout), so the
// answer is identical whether the command was run from main or a worktree.
function resolveSpecWithWorktree(dir, config, specArg) {
  // Fill in a missing argument first: everything below (starting with
  // path.basename) assumes a string, and every subcommand that reaches here is
  // one where a missing spec was previously a usage error.
  specArg = specArg || soleProvisionedSpec(dir, config)
  const { slug } = splitPrefix(path.basename(specArg))
  const { repo, repoSlug } = repoInfo(dir)
  const wtTokens = { repo, repoSlug, slug }
  const worktreeGuess = path.resolve(
    dir,
    expandTokens(config.worktree.root, wtTokens),
    expandTokens(config.worktree.folderPattern, wtTokens),
  )
  const searchDirs = [...new Set([worktreeGuess, ...liveWorktreePaths(dir)])].filter(
    (p) => p !== dir,
  )
  return resolveSpec(specArg, dir, config, { searchDirs })
}

// Every spec folder name found under specs/* across the given checkout roots.
// An in-progress spec lives on its *worktree branch*, not the primary checkout,
// so we must scan the worktrees too — otherwise a live spec's DB looks orphaned.
function collectSpecFolders(roots) {
  const folders = new Set()
  for (const root of roots) {
    for (const bucket of ['backlog', 'in-progress', 'complete', 'cancelled']) {
      let entries
      try {
        entries = fs.readdirSync(path.join(root, 'specs', bucket), { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) if (entry.isDirectory()) folders.add(entry.name)
    }
  }
  return folders
}

// Resolve every spec folder (found in the primary checkout OR any worktree) to
// { folder, slug, worktreePath }. `searchDirs` lets resolveSpec locate a spec
// that was authored on its branch and never committed to the primary checkout.
function allSpecs(dir, config, worktreePaths) {
  const searchDirs = [...worktreePaths]
  const specs = []
  for (const folder of collectSpecFolders([dir, ...searchDirs])) {
    try {
      const spec = resolveSpec(folder, dir, config, { searchDirs })
      specs.push({ folder: spec.folder, slug: spec.slug, worktreePath: spec.worktreePath })
    } catch {
      // Unresolvable folder (not a real spec) — skip.
    }
  }
  return specs
}

// Prune: reconcile namespace volumes against specs that still have a worktree and
// print the `docker volume rm` commands for the orphans. Liveness keys off the
// worktree, NOT the registry (a declined teardown leaves a stale slot behind), so
// this correctly reaps those and frees their stale slots. Destructive removal is
// executed by the caller (skill) after confirmation — the CLI only plans + writes
// the registry, mirroring `spec-env down`.
function specEnvPrune(dir, config, flags) {
  const { repoSlug } = repoInfo(dir)

  const vols = listRepoVolumes(repoSlug)
  if (!vols.ok) {
    process.stdout.write(
      `spec-env prune: could not list docker volumes — ${vols.err || 'docker unavailable'}.\n` +
        'Is Docker running? Nothing pruned.\n',
    )
    return
  }

  const worktrees = liveWorktreePaths(dir)
  const specs = allSpecs(dir, config, worktrees)
  const liveSlugs = liveSlugsForSpecs(specs, worktrees)

  const olderThanDays =
    flags && Number.isFinite(flags.olderThanDays) ? flags.olderThanDays : null
  let volumes = vols.names
  let now = null
  if (olderThanDays != null) {
    const createdAt = volumeCreatedAt(vols.names)
    volumes = vols.names.map((name) => ({ name, createdAt: createdAt.get(name) ?? null }))
    now = Date.now()
  }

  const plan = planPrune(volumes, liveSlugs, { repoSlug, olderThanDays, now })

  if (!plan.orphans.length) {
    process.stdout.write(
      `spec-env prune: no orphaned volumes in ${repoSlug}_* ` +
        `(${vols.names.length} namespace volume(s), ${liveSlugs.size} live spec(s) protected).\n`,
    )
    return
  }

  // Reconcile the registry: free the slot of any spec whose volume we're reaping.
  const registry = readRegistry(dir, config)
  const { registry: nextRegistry, freed } = reconcileRegistry(registry, plan.orphans, repoSlug)
  if (freed.length) writeRegistry(dir, config, nextRegistry)

  const ageNote = olderThanDays != null ? ` older than ${olderThanDays}d` : ''
  const out = []
  out.push(
    `spec-env prune: ${plan.orphans.length} orphaned volume(s)${ageNote} ` +
      `(${liveSlugs.size} live spec(s) protected)`,
  )
  out.push('')
  out.push('  orphans:')
  for (const o of plan.orphans) out.push(`    ${o.name}`)
  if (freed.length) out.push(`  slots freed:  ${freed.join(', ')}`)
  out.push('  backup:       none (prune does not back up — orphans have no running DB)')
  out.push('')
  out.push('  run these:')
  for (const cmd of plan.commands) out.push(`    ${cmd}`)
  // Kept out of `run these:` on purpose — everything above is local and
  // reversible-ish, while this reaches a shared remote. The skills ask before
  // running it; a project that never wants to be asked sets
  // `teardown.deleteRemoteBranch: "always"`, which folds it in above instead.
  if (plan.remoteCommands && plan.remoteCommands.length) {
    out.push('')
    out.push('  remote branch — confirm with the user first:')
    for (const cmd of plan.remoteCommands) out.push(`    ${cmd}`)
  }
  process.stdout.write(out.join('\n') + '\n')
}

// Integrate: land a spec's worktree branch onto the base branch (rebase + ff).
// Queries git for the facts, prints the plan / block / no-op. The /spec-complete
// skill executes the printed commands (and aborts a conflicting rebase).
function specEnvIntegrate(dir, config, specArg) {

  // `dir` is already anchored on the primary checkout by the dispatch, so it is
  // both where the spec resolves and the target of the fast-forward — /spec-complete
  // can run this from inside the worktree and still land on main. A spec authored
  // entirely on its branch may not exist in the primary checkout's specs/** —
  // resolveSpecWithWorktree offers its worktree as a fallback search location.
  const spec = resolveSpecWithWorktree(dir, config, specArg)
  const base = resolveBaseBranch(config, gitReader(dir))

  // Checkout mode short-circuits everything below. The live handling in
  // particular reads "primary is on the spec's branch" as a live session — true
  // in worktree mode, and simply where the branch LIVES in checkout mode, so it
  // would refuse to land a spec sitting exactly where it belongs.
  if (config.mode === 'checkout') {
    const cgit = gitReader(dir)
    const cst = cgit(['status', '--porcelain'])
    const cahead = cgit(['rev-list', '--count', `${base}..${spec.branch}`])
    const cplan = planIntegrateCheckout(spec, config, {
      dirty: cst === null || cst.length > 0,
      base,
      aheadOfBase: cahead !== null && Number(cahead) > 0,
      checkoutPath: dir,
      onBranch: cgit(['rev-parse', '--abbrev-ref', 'HEAD']) === spec.branch,
    })
    if (cplan.blocked) {
      process.stdout.write(`spec-env integrate: blocked — ${cplan.reason}.\n`)
      return
    }
    if (cplan.noop) {
      process.stdout.write(
        `spec-env integrate: ${spec.folder} already landed on ${base} — nothing to integrate.\n`,
      )
      return
    }
    const cout = [`spec-env integrate: ${spec.folder}`, '', '  mode:      checkout',
                  `  base:      ${base}`, `  branch:    ${cplan.branch}`, '',
                  '  run these (abort the rebase on conflict):']
    for (const cmd of cplan.commands) cout.push(`    ${cmd}`)
    process.stdout.write(cout.join('\n') + '\n')
    return
  }

  // Live-aware: if this spec is live on the primary checkout (branch-switched by
  // `live take`), end the live session first — release back to base, re-isolate the
  // branch, clear the receipt — so the normal rebase→ff plan below applies
  // unchanged. Refuse if a *different* spec holds the primary checkout.
  const primary = assertPrimaryOnMain(config, gitReader(dir))
  if (!primary.onBase) {
    if (primary.branch !== spec.branch) {
      process.stdout.write(
        `spec-env integrate: blocked — another spec (${primary.branch}) holds the ` +
          'primary checkout; release it with `/spec-live main` first.\n',
      )
      return
    }
    const pstatus = gitReader(dir)(['status', '--porcelain'])
    if (pstatus === null || pstatus.length > 0) {
      process.stdout.write(
        `spec-env integrate: blocked — commit your live fixes to ${spec.branch} first.\n`,
      )
      return
    }
    // Work-loss guard — runs BEFORE the destructive `checkout base` that ends the
    // live session. Ending the session must leave landable work behind; if it
    // wouldn't, abort loudly instead of silently finalizing the spec with nothing
    // landed (see spec feat-live-spec-flow).
    if (!fs.existsSync(spec.worktreePath)) {
      process.stdout.write(
        `spec-env integrate: blocked — ${spec.folder} is live but has no worktree to land ` +
          `from. Re-isolate it with \`skitterspec spec-env up ${spec.folder}\`, then re-run.\n`,
      )
      return
    }
    const liveWtGit = gitReader(spec.worktreePath)
    if (liveWtGit(['symbolic-ref', '--short', 'HEAD']) === null) {
      // Detached worktree HEAD: any commits ahead of the branch ref (e.g. made by a
      // a build that committed in the worktree) would be abandoned by the re-isolate `switch` below.
      const stranded = liveWtGit(['rev-list', '--count', `${spec.branch}..HEAD`])
      const head = liveWtGit(['rev-parse', '--short', 'HEAD'])
      if (stranded !== null && Number(stranded) > 0) {
        process.stdout.write(
          `spec-env integrate: blocked — ${stranded} commit(s) are stranded on the detached ` +
            `HEAD of ${spec.worktreePath} (at ${head}), ahead of ${spec.branch}; re-isolating ` +
            `would abandon them. Recover with \`git -C ${spec.worktreePath} branch <tmp> ${head}\`, ` +
            `reconcile onto ${spec.branch}, then re-run.\n`,
        )
        return
      }
    }
    const co = runGit(dir, ['checkout', base])
    if (!co.ok) {
      process.stdout.write(`spec-env integrate: could not check out ${base} — ${co.err}\n`)
      return
    }
    if (fs.existsSync(spec.worktreePath)) runGit(spec.worktreePath, ['switch', spec.branch])
    clearReceipt(dir, config)
    process.stdout.write(
      `spec-env integrate: ended live session — ${spec.folder} released to its worktree.\n`,
    )
  }

  if (!fs.existsSync(spec.worktreePath)) {
    process.stdout.write(
      `spec-env integrate: ${spec.folder} has no worktree — nothing to integrate.\n`,
    )
    return
  }

  const wtGit = gitReader(spec.worktreePath)
  const status = wtGit(['status', '--porcelain'])
  const dirty = status !== null && status.length > 0
  const ahead = wtGit(['rev-list', '--count', `${base}..HEAD`])
  const aheadOfBase = ahead !== null && Number(ahead) > 0

  const plan = planIntegrate(spec, config, {
    worktreeState: { dirty },
    base,
    aheadOfBase,
    mainRepoPath: dir,
  })

  if (plan.blocked) {
    process.stdout.write(`spec-env integrate: blocked — ${plan.reason}.\n`)
    return
  }
  if (plan.noop) {
    process.stdout.write(
      `spec-env integrate: ${spec.folder} already landed on ${base} — nothing to integrate.\n`,
    )
    return
  }

  const out = []
  out.push(`spec-env integrate: ${spec.folder}`)
  out.push('')
  out.push(`  base:      ${plan.base}`)
  out.push(`  branch:    ${plan.branch}`)
  out.push(`  worktree:  ${spec.worktreePath}`)
  out.push('')
  out.push('  run these (abort the rebase on conflict):')
  for (const cmd of plan.commands) out.push(`    ${cmd}`)
  process.stdout.write(out.join('\n') + '\n')
}

// Land a hotfix: tag the branch with the patch-bumped base tag (the prod deploy
// tag), cherry-pick the fix onto any extra base tags (test/demo lines) and onto
// the base branch for the next release. Queries git for the facts, prints the plan
// / block / no-op. The /spec-complete skill runs the printed commands (aborting a
// cherry-pick on conflict). NEVER pushes — pushing the deploy tag is the operator's.
function specEnvHotfix(dir, config, positional, flags) {
  const action = positional[0]
  const specArg = positional[1]
  // The action must be named; the spec may be omitted (resolved from the registry).
  if (action !== 'land') {
    process.stdout.write('Usage: skitterspec spec-env hotfix land [spec] [--also <tag>]...\n')
    return
  }

  // A hotfix may be authored entirely on its branch, so fall back to its worktree.
  const spec = resolveSpecWithWorktree(dir, config, specArg)
  if (spec.type !== 'hotfix') {
    process.stdout.write(
      `spec-env hotfix land: ${spec.folder} is not a hotfix — needs Type: Hotfix / a hotfix- prefix.\n`,
    )
    return
  }
  if (!fs.existsSync(spec.worktreePath)) {
    process.stdout.write(`spec-env hotfix land: ${spec.folder} has no worktree — nothing to land.\n`)
    return
  }

  const base = resolveBaseBranch(config, gitReader(dir))
  const wtGit = gitReader(spec.worktreePath)
  const status = wtGit(['status', '--porcelain'])
  const dirty = status !== null && status.length > 0
  const ahead = wtGit(['rev-list', '--count', `${spec.baseRef}..HEAD`])
  const aheadOfBase = ahead !== null && Number(ahead) > 0
  const tagList = wtGit(['tag', '--list'])
  const existingTags = tagList ? tagList.split('\n').map((s) => s.trim()).filter(Boolean) : []

  // Extra targets: --also flags first, then any config defaults; drop blanks, the
  // base tag itself, and duplicates.
  const seen = new Set()
  const extraTargets = [...(flags.also || []), ...(config.hotfix.targets || [])].filter((t) => {
    if (!t || t === spec.baseRef || seen.has(t)) return false
    seen.add(t)
    return true
  })

  let plan
  try {
    plan = planHotfixLand(spec, config, {
      worktreeState: { dirty },
      aheadOfBase,
      fixRange: `${spec.baseRef}..${spec.branch}`,
      mainRepoPath: dir,
      base,
      extraTargets,
      existingTags,
    })
  } catch (error) {
    process.stdout.write(`spec-env hotfix land: ${error.message}.\n`)
    return
  }

  if (plan.blocked) {
    process.stdout.write(`spec-env hotfix land: blocked — ${plan.reason}.\n`)
    return
  }
  if (plan.noop) {
    process.stdout.write(`spec-env hotfix land: ${plan.reason}.\n`)
    return
  }

  const out = []
  out.push(`spec-env hotfix land: ${spec.folder}`)
  out.push('')
  out.push(`  base tag:  ${spec.baseRef}`)
  out.push(`  branch:    ${spec.branch}`)
  out.push(`  prod tag:  ${plan.prodTag}  (created locally — push to deploy)`)
  for (const t of plan.targets) {
    if (t.kind === 'extra') out.push(`  target:    ${t.base} -> ${t.tag}`)
    if (t.kind === 'main') out.push(`  next rel:  cherry-pick onto ${t.base}`)
  }
  out.push('')
  out.push('  run these (abort a cherry-pick on conflict, resolve, then re-run):')
  for (const cmd of plan.commands) out.push(`    ${cmd}`)
  out.push('')
  out.push(`  then push the deploy tag yourself:  git push origin ${plan.prodTag}`)
  process.stdout.write(out.join('\n') + '\n')
}

// Print the resolved identity/coordinates for a single spec.
function specEnvResolve(dir, config, specArg) {
  const r = resolveSpecWithWorktree(dir, config, specArg)
  process.stdout.write(
    `spec:       ${r.folder} (${r.bucket})\n` +
      `type/slug:  ${r.type} / ${r.slug}\n` +
      `branch:     ${r.branch}\n` +
      `worktree:   ${r.worktreePath}\n` +
      `project:    ${r.projectName}\n`,
  )
}

// Start/stop a spec's host dev servers on its reserved port block. Host dev
// servers (e.g. `pnpm dev`) need a block even on a worktree-only spec, so `up`
// allocates a slot if the spec has none (idempotent). The planner is pure
// (dev.js); the spawning/killing lives in supervise.js.
async function specEnvDev(dir, config, positional) {
  const action = positional[0]
  const specArg = positional[1]
  // The action must be named; the spec may be omitted (resolved from the registry).
  if (action !== 'up' && action !== 'down') {
    process.stdout.write('Usage: skitterspec spec-env dev <up|down> [spec]\n')
    return
  }
  const spec = resolveSpecWithWorktree(dir, config, specArg)
  if (!config.dev.length) {
    process.stdout.write(
      'spec-env dev: no dev processes configured — set "dev": [...] in env.config.json.\n',
    )
    return
  }

  const registry = readRegistry(dir, config)
  let slot
  if (action === 'up') {
    // Ensure a slot (idempotent) so the port block is reserved even worktree-only.
    const alloc = allocateSlot(registry, spec.folder)
    slot = alloc.slot
    writeRegistry(dir, config, alloc.registry)
  } else {
    // Teardown only needs the pid-file paths (keyed by folder, not slot), so the
    // slot value is immaterial — use the existing one, or 0 as a placeholder.
    slot = Object.prototype.hasOwnProperty.call(registry.slots, spec.folder)
      ? registry.slots[spec.folder]
      : 0
  }

  const plan = planDev(spec, slot, config)

  if (action === 'up') {
    const out = [`spec-env dev up: ${spec.folder}  slot ${slot}  (ports from ${plan.portOffset})`]
    for (const proc of plan.procs) {
      const res = startProcess(proc, { cwd: spec.worktreePath, rootDir: dir })
      let health = ''
      if (proc.health) {
        health = (await waitHealthy(proc.health)) ? '  health: ok' : '  health: TIMEOUT'
      }
      out.push(
        `  ${proc.name}: port ${proc.port}  pid ${res.pid}  ` +
          `${res.started ? 'started' : 'already running'}${health}`,
      )
    }
    out.push('')
    out.push(`  logs: ${stateDirLabel(config)}/logs/`)
    process.stdout.write(out.join('\n') + '\n')
  } else {
    const out = [`spec-env dev down: ${spec.folder}`]
    for (const proc of plan.procs) {
      const res = await stopProcess(proc, { rootDir: dir })
      out.push(`  ${proc.name}: ${res.stopped ? `stopped (pid ${res.pid})` : 'not running'}`)
    }
    process.stdout.write(out.join('\n') + '\n')
  }
}

// The `.spec-env`-style state dir label for user-facing messages.
function stateDirLabel(config) {
  return path.posix.dirname(config.registry) || '.spec-env'
}

// The supervised proxy process descriptor (paths relative to the checkout root).
function proxyProcFor(config, routesFileAbs) {
  const sdir = stateDirLabel(config)
  return {
    name: 'proxy',
    command: `node ${path.join(__dirname, 'env', 'proxy.js')} ${routesFileAbs}`,
    env: {},
    logFile: `${sdir}/logs/proxy.log`,
    pidFile: `${sdir}/pids/proxy.pid`,
  }
}

// Connect the canonical origin to ONE spec (exclusive model): (re)start the
// bundled proxy pointing at that spec's warm dev servers. `connect main` stops
// the proxy so the primary checkout owns the canonical ports again.
async function specEnvConnect(dir, config, specArg) {
  // Both verbs exist to route around the work living somewhere other than the
  // checkout you are in — a proxy to a second stack, or a temporary branch swap.
  // Checkout mode closes that gap permanently, so there is nothing to route.
  if (config.mode === 'checkout') {
    process.stdout.write(
      'spec-env connect: not applicable in checkout mode — the spec is built in the ' +
        'primary checkout, so your dev server already serves it on the canonical ports.\\n',
    )
    return
  }
  const sdir = stateDirLabel(config)
  const abs = (rel) => path.resolve(dir, rel)
  const routesFile = `${sdir}/proxy.json`
  const connectedFile = `${sdir}/connected`
  const proxyProc = proxyProcFor(config, abs(routesFile))
  const target = specArg || 'main'

  if (target === 'main') {
    const res = await stopProcess(proxyProc, { rootDir: dir })
    for (const f of [connectedFile, routesFile]) {
      try {
        fs.unlinkSync(abs(f))
      } catch {
        /* not connected */
      }
    }
    process.stdout.write(
      res.stopped
        ? 'spec-connect: disconnected — the primary checkout owns the canonical ports again.\n'
        : 'spec-connect: nothing was connected — the primary checkout already owns the ports.\n',
    )
    return
  }

  const spec = resolveSpecWithWorktree(dir, config, target)
  const registry = readRegistry(dir, config)
  if (!Object.prototype.hasOwnProperty.call(registry.slots, spec.folder)) {
    process.stdout.write(
      `spec-connect: ${spec.folder} has no reserved ports yet — ` +
        `run \`skitterspec spec-env dev up ${spec.folder}\` first.\n`,
    )
    return
  }

  const plan = planDev(spec, registry.slots[spec.folder], config)
  const routes = renderRoutes(plan.procs)
  if (!routes.length) {
    process.stdout.write(
      'spec-connect: no dev process declares a frontPort — nothing to expose.\n',
    )
    return
  }

  // Stop any proxy we already run (a previous connect), freeing the canonical
  // ports, then refuse if the primary checkout still holds one of them.
  await stopProcess(proxyProc, { rootDir: dir })
  const busy = await portsInUse(routes.map((r) => r.frontPort), config.proxy.host)
  if (busy.length) {
    process.stdout.write(
      `spec-connect: canonical port(s) ${busy.join(', ')} are in use (your main dev server?).\n` +
        'Stop main on those ports, then re-run spec-connect.\n',
    )
    return
  }

  fs.mkdirSync(abs(sdir), { recursive: true })
  fs.writeFileSync(abs(routesFile), JSON.stringify(routes, null, 2) + '\n')
  const res = startProcess(proxyProc, { cwd: dir, rootDir: dir })
  fs.writeFileSync(abs(connectedFile), spec.folder + '\n')

  const ready = await waitListening(
    routes.map((r) => r.frontPort),
    { host: config.proxy.host },
  )

  const out = [
    `spec-connect: ${spec.folder} → canonical ports (proxy pid ${res.pid})` +
      (ready ? '' : '  [WARNING: proxy did not come up — see .spec-env/logs/proxy.log]'),
  ]
  for (const r of routes) {
    out.push(
      `  http://${config.proxy.host}:${r.frontPort}  →  ${r.name} (127.0.0.1:${r.targetPort})`,
    )
  }
  out.push('')
  out.push('  Disconnect with: skitterspec spec-env connect main')
  process.stdout.write(out.join('\n') + '\n')
}

// Dispatch `skitterspec spec-env <sub> [args] [--dir path]`. No-ops with a clear
// message when the feature isn't enabled (no specs/.core/env.config.json).
// Run a mutating git command; return { ok, err } (stderr captured, not swallowed).
function runGit(cwd, args) {
  try {
    execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    return { ok: true, err: '' }
  } catch (error) {
    const err = (error.stderr && error.stderr.toString().trim()) || error.message
    return { ok: false, err }
  }
}

// Lockfiles/manifests whose change means a dev server needs a restart, not HMR.
const DEPS_RE = /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/

// Live overlay: test a spec on the already-running instance by checking its
// branch out in the primary checkout, so the running dev server hot-reloads the
// feature. The branch that's checked out IS the lock (assertPrimaryOnMain); the
// receipt is advisory metadata. `status` is read-only; `take` performs the switch
// (release/abort land in a later phase).
async function specEnvLive(dir, config, positional) {
  // Both verbs exist to route around the work living somewhere other than the
  // checkout you are in — a proxy to a second stack, or a temporary branch swap.
  // Checkout mode closes that gap permanently, so there is nothing to route.
  if (config.mode === 'checkout') {
    process.stdout.write(
      'spec-env live: not applicable in checkout mode — the spec branch is already ' +
        'checked out here. `mode: checkout` is the permanent form of what live overlay ' +
        'does temporarily.\\n',
    )
    return
  }
  const { action, specArg } = liveGrammar(dir, config, positional)
  switch (action) {
    case 'status':
      specEnvLiveStatus(dir, config, specArg)
      break
    case 'take':
      await specEnvLiveTake(dir, config, specArg)
      break
    case 'release':
      await specEnvLiveRelease(dir, config, specArg)
      break
    case 'abort':
      await specEnvLiveAbort(dir, config)
      break
    default:
      process.stdout.write(
        'Usage: skitterspec spec-env live <spec>|<base branch>|<take|release|abort|status> [spec]\n',
      )
  }
}

const LIVE_VERBS = new Set(['status', 'take', 'release', 'abort'])

// The two front doors every doc names — `/spec-live <spec>` and `/spec-live main`
// — translated to verbs. They live here rather than in the command because
// `.claude/commands/spec-live.md` relays `$ARGUMENTS` untranslated (it is a
// pre-executed script, with no model turn to rewrite them); the skill this
// replaced did the translation itself, which is how these forms came to be
// documented but unimplemented. `connect` needs no equivalent — its argument was
// always spec-shaped (`specArg || 'main'`).
//
// VERB PRECEDENCE IS DELIBERATE, and so is the order below: the four verbs and
// the base branch are matched BEFORE the spec-name fallback, so a spec folder
// that happens to be called `status` cannot silently branch-switch the primary
// checkout. Such a spec is still reachable — as `live take status`. The literal
// `main` is honoured even where the base branch is named something else,
// matching `connect main`, so the muscle memory works in either repo.
function liveGrammar(dir, config, positional) {
  const [first, second] = positional
  if (!first) return { action: 'status', specArg: undefined }
  if (LIVE_VERBS.has(first)) return { action: first, specArg: second }
  if (first === 'main' || first === resolveBaseBranch(config, gitReader(dir))) {
    return { action: 'release', specArg: undefined }
  }
  return { action: 'take', specArg: first }
}

// Take the running instance: rebase the spec's branch onto base, free it from its
// worktree, and check it out in the primary checkout so the dev server reloads it.
async function specEnvLiveTake(dir, config, specArg) {
  const spec = resolveSpecWithWorktree(dir, config, specArg)

  // Probe the primary checkout's git state (IO stays here; the planner is pure).
  const primaryGit = gitReader(dir)
  const primary = assertPrimaryOnMain(config, primaryGit)
  const base = resolveBaseBranch(config, primaryGit)
  const status = primaryGit(['status', '--porcelain'])
  const clean = status !== null && status.length === 0
  const worktreeExists = fs.existsSync(spec.worktreePath)
  // The tree the rebase actually runs in. Unreadable → treated as dirty: being
  // wrong that way costs a message, the other way moves work we could not see.
  const wtStatus = worktreeExists ? gitReader(spec.worktreePath)(['status', '--porcelain']) : ''
  const worktreeClean = wtStatus !== null && wtStatus.length === 0
  const baseMainCommit = primaryGit(['rev-parse', 'HEAD'])

  // Diff base...branch to spot migration / dependency changes (best-effort).
  const changed = primaryGit(['diff', '--name-only', `${base}...${spec.branch}`])
  const files = changed ? changed.split('\n').filter(Boolean) : []
  const depsChanged = files.some((f) => DEPS_RE.test(f))

  // Verify-only: probe the declared canonical (frontPort) ports. None declared →
  // no health gate (serverUp = null); the switch proceeds with a warning.
  const canonicalPorts = config.dev.map((d) => d.frontPort).filter((p) => typeof p === 'number')
  let serverUp = null
  if (canonicalPorts.length) {
    const up = await portsInUse(canonicalPorts, config.proxy.host)
    serverUp = up.length === canonicalPorts.length
  }

  const plan = planTake(spec, config, {
    primary,
    primaryPath: dir,
    inFlight: (readReceipt(dir, config) || {}).spec || null,
    clean,
    worktreeClean,
    worktreeExists,
    base,
    baseMainCommit,
    serverUp,
    canonicalPorts,
    migrationsHit: migrationsHit(files, config.live.migrations),
    depsChanged,
    holder: primaryGit(['config', 'user.name']) || 'unknown',
    heldSince: new Date().toISOString(),
  })

  if (plan.blocked) {
    process.stdout.write(`spec-env live take: blocked — ${plan.reason}.\n`)
    return
  }

  // Execute the switch. Rebase first; on conflict, abort and bail (state untouched).
  const reb = runGit(spec.worktreePath, ['rebase', base])
  if (!reb.ok) {
    // A rebase fails two ways and they need different answers. It can REFUSE TO
    // START (unstaged changes, a missing base) — nothing to abort, nothing to
    // resolve — or start and CONFLICT. Calling both "hit conflicts" sent people
    // hunting a conflict that did not exist, and `--abort` on a rebase that
    // never began discarded git's own explanation of what was actually wrong.
    const started = runGit(spec.worktreePath, ['rebase', '--show-current-patch']).ok
    if (started) runGit(spec.worktreePath, ['rebase', '--abort'])
    process.stdout.write(
      started
        ? `spec-env live take: rebase of ${spec.branch} onto ${base} hit conflicts — ` +
            `resolve them in ${spec.worktreePath}, then retry.\n`
        : `spec-env live take: rebase of ${spec.branch} onto ${base} could not start — ` +
            `git said:\n    ${reb.err.split('\n').join('\n    ')}\n`,
    )
    return
  }
  const det = runGit(spec.worktreePath, ['switch', '--detach'])
  if (!det.ok) {
    process.stdout.write(`spec-env live take: could not detach the worktree — ${det.err}\n`)
    return
  }
  const co = runGit(dir, ['checkout', spec.branch])
  if (!co.ok) {
    // Roll the detach back so the worktree keeps its branch.
    runGit(spec.worktreePath, ['switch', spec.branch])
    process.stdout.write(
      `spec-env live take: could not check out ${spec.branch} in the primary ` +
        `checkout — ${co.err}\n`,
    )
    return
  }
  const receipt = writeReceipt(dir, config, plan.receipt)

  const out = [`spec-env live take: ${spec.folder} is live on the primary checkout`]
  out.push('')
  out.push(`  primary:   now on ${receipt.branch} (was ${base} @ ${receipt.baseMainCommit.slice(0, 7)})`)
  out.push(`  worktree:  ${spec.worktreePath} (detached — branch handed to the primary checkout)`)
  for (const w of plan.warnings) out.push(`  ! ${w}`)
  out.push('')
  out.push('  Test at your canonical URL; release with: /spec-live main')
  process.stdout.write(out.join('\n') + '\n')
}

// Release the running instance: hand the primary checkout back to base and
// re-isolate the spec's branch into its worktree. With no spec arg, the live spec
// is read from the receipt (this is what `/spec-live main` runs).
async function specEnvLiveRelease(dir, config, specArg) {
  const receipt = readReceipt(dir, config)
  const target = specArg || (receipt && receipt.spec)
  if (!target) {
    const primaryGit = gitReader(dir)
    const primary = assertPrimaryOnMain(config, primaryGit)
    process.stdout.write(
      primary.onBase
        ? `spec-env live release: nothing is live — the primary checkout is on ${primary.baseBranch}.\n`
        : `spec-env live release: no receipt, but the primary checkout is on ${primary.branch} — ` +
            'use `spec-env live abort` to recover.\n',
    )
    return
  }

  const spec = resolveSpecWithWorktree(dir, config, target)
  const primaryGit = gitReader(dir)
  const primary = assertPrimaryOnMain(config, primaryGit)
  const base = resolveBaseBranch(config, primaryGit)
  const status = primaryGit(['status', '--porcelain'])
  const clean = status !== null && status.length === 0
  const worktreeExists = fs.existsSync(spec.worktreePath)

  const plan = planRelease(spec, config, {
    primary,
    primaryPath: dir,
    base,
    clean,
    worktreeExists,
  })

  if (plan.noop) {
    process.stdout.write(`spec-env live release: ${plan.reason}.\n`)
    return
  }
  if (plan.blocked) {
    process.stdout.write(`spec-env live release: blocked — ${plan.reason}.\n`)
    return
  }

  const co = runGit(dir, ['checkout', base])
  if (!co.ok) {
    process.stdout.write(`spec-env live release: could not check out ${base} — ${co.err}\n`)
    return
  }
  if (worktreeExists) runGit(spec.worktreePath, ['switch', spec.branch])
  clearReceipt(dir, config)

  process.stdout.write(
    `spec-env live release: ${spec.folder} released — primary back on ${base}, ` +
      `${spec.branch} re-isolated to its worktree.\n`,
  )
}

// Crash recovery: force the primary checkout back to base from the receipt and
// re-isolate, without discarding uncommitted work (it refuses on a dirty tree).
async function specEnvLiveAbort(dir, config) {
  const receipt = readReceipt(dir, config)
  const primaryGit = gitReader(dir)
  const primary = assertPrimaryOnMain(config, primaryGit)
  const base = resolveBaseBranch(config, primaryGit)
  const status = primaryGit(['status', '--porcelain'])
  const clean = status !== null && status.length === 0

  // Resolve the worktree from the receipt (best-effort — may be gone/unresolvable).
  let worktreePath = null
  if (receipt) {
    try {
      worktreePath = resolveSpecWithWorktree(dir, config, receipt.spec).worktreePath
    } catch {
      worktreePath = null
    }
  }
  const worktreeExists = worktreePath !== null && fs.existsSync(worktreePath)

  const plan = planAbort(config, {
    receipt,
    primary,
    primaryPath: dir,
    base,
    clean,
    worktreeExists,
    worktreePath,
  })

  if (plan.noop) {
    process.stdout.write(`spec-env live abort: ${plan.reason}.\n`)
    return
  }
  if (plan.blocked) {
    process.stdout.write(`spec-env live abort: blocked — ${plan.reason}.\n`)
    return
  }

  if (!primary.onBase) {
    const co = runGit(dir, ['checkout', base])
    if (!co.ok) {
      process.stdout.write(`spec-env live abort: could not check out ${base} — ${co.err}\n`)
      return
    }
  }
  if (worktreeExists) runGit(worktreePath, ['switch', plan.branch])
  clearReceipt(dir, config)

  process.stdout.write(
    `spec-env live abort: recovered — primary back on ${base}` +
      (worktreeExists ? `, ${plan.branch} re-isolated to its worktree` : '') +
      '.\n',
  )
}

function specEnvLiveStatus(dir, config, specArg) {
  const { onBase, branch, baseBranch } = assertPrimaryOnMain(config, gitReader(dir))

  // Per-spec query (`live status <spec>`): a clear yes/no verdict /spec-start and
  // skill branches on to decide whether to skip worktree provisioning and work in
  // the primary checkout. The stable `live:      yes|no` line is the machine seam.
  if (specArg) {
    const spec = resolveSpecWithWorktree(dir, config, specArg)
    const live = !onBase && branch === spec.branch
    process.stdout.write(
      `spec-env live status: ${spec.folder}\n` +
        `  spec:      ${spec.folder}  (branch ${spec.branch})\n` +
        `  primary:   ${branch || '(detached)'}\n` +
        `  live:      ${
          live
            ? `yes — ${spec.folder} holds the primary checkout; work there`
            : `no — primary is on ${branch || '(detached)'}`
        }\n`,
    )
    return
  }

  const receipt = readReceipt(dir, config)
  const state = onBase
    ? 'on base — free'
    : `feature in control — not on ${baseBranch}`

  // `in-flight:` is a MACHINE SEAM, like the per-spec `live:` line above, and
  // `/spec-next` reads it to decide which spec it is allowed to build. It answers
  // in three states rather than two, because "cannot tell" is real here: a branch
  // switched by hand carries no receipt, so the spec is unknown even though the
  // checkout is plainly busy. Reporting that as `none` would invite building the
  // wrong spec; reporting the branch says what is true and lets the caller stop.
  const inFlight = onBase
    ? 'none — the workbench is free'
    : receipt && receipt.spec
      ? `${receipt.spec}  (branch ${branch || '(detached)'})`
      : `unknown  (branch ${branch || '(detached)'} — no receipt; switched by hand?)`

  process.stdout.write(
    'spec-env live:\n' +
      `  primary:   ${branch || '(detached)'}  (${state})\n` +
      `  in-flight: ${inFlight}\n` +
      `  receipt:   ${summarizeReceipt(receipt)}\n`,
  )
}

async function specEnv(rest) {
  const [sub, ...args] = rest
  let dir = process.cwd()
  const positional = []
  const flags = { keepVolumes: false, force: false, also: [], olderThanDays: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = path.resolve(args[++i])
    else if (args[i] === '--keep-volumes') flags.keepVolumes = true
    else if (args[i] === '--force') flags.force = true
    else if (args[i] === '--also') flags.also.push(args[++i])
    else if (args[i] === '--older-than') flags.olderThanDays = Number(args[++i])
    else positional.push(args[i])
  }
  dir = path.resolve(dir)
  // Anchor on the primary checkout so every subcommand resolves {repo}, worktree
  // paths, and the registry identically whether run from main or a worktree.
  dir = resolvePrimaryCheckout(dir, gitReader(dir))

  const { config, present } = loadEnvConfig(dir)
  if (!present) {
    process.stdout.write(
      'spec-env: isolation not enabled (no specs/.core/env.config.json).\n' +
        'Opt in by copying specs/.core/env.config.json.example → env.config.json.\n',
    )
    return
  }

  switch (sub) {
    case 'up':
      specEnvUp(dir, config, positional[0])
      break
    case 'down':
      specEnvDown(dir, config, positional[0], flags)
      break
    case 'prune':
      specEnvPrune(dir, config, flags)
      break
    case 'dev':
      await specEnvDev(dir, config, positional)
      break
    case 'connect':
      await specEnvConnect(dir, config, positional[0])
      break
    case 'integrate':
      specEnvIntegrate(dir, config, positional[0])
      break
    case 'hotfix':
      specEnvHotfix(dir, config, positional, flags)
      break
    case 'status':
      specEnvStatus(dir, config)
      break
    case 'resolve':
      specEnvResolve(dir, config, positional[0])
      break
    case 'live':
      await specEnvLive(dir, config, positional)
      break
    default:
      process.stdout.write(
        'Usage: skitterspec spec-env <up|down|prune|dev|connect|integrate|hotfix|live|status|resolve> [spec] [--keep-volumes] [--force] [--also <tag>] [--older-than <days>]\n' +
          '  [spec] is optional for up/down/dev/integrate/hotfix/resolve and live take:\n' +
          '  omit it and the sole provisioned spec is used (several -> it lists them).\n' +
          '  NOTE connect and live status keep their own meaning for a missing spec:\n' +
          '  connect disconnects (= main), live status reports on the whole repo.\n' +
          '  connect and live also take a bare spec name: `live <spec>` takes the\n' +
          '  instance, `live main` (or your base branch) hands it back.\n',
      )
  }
}

async function run(argv) {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    process.stdout.write(HELP)
    return
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${pkg.version}\n`)
    return
  }

  const [cmd, ...rest] = argv

  if (cmd === 'spec-env') {
    await specEnv(rest)
    return
  }

  const { opts, positional } = parse(rest)
  const dir = path.resolve(opts.dir || positional[0] || process.cwd())

  switch (cmd) {
    case 'init': {
      const interactive = Boolean(process.stdin.isTTY) && !opts.yes

      // Already set up? Route to resync / reset / leave instead of a silent
      // create-missing (safer-init). A fresh repo falls straight through.
      if (isExistingSetup(dir)) {
        let action
        if (opts.reset) {
          if (!opts.yes) {
            process.stdout.write('init: --reset overwrites managed files — re-run with --yes. Left unchanged.\n')
            break
          }
          action = 'reset'
        } else if (opts.resync) action = 'resync'
        else if (opts.force) action = 'resync' // --force resyncs, clobbering customized
        else if (interactive) {
          const { promptExistingSetup } = require('./prompts.js')
          action = await promptExistingSetup()
        } else action = 'create-missing' // non-interactive default: add missing, never clobber

        if (action === 'leave') {
          process.stdout.write('init: existing setup left unchanged.\n')
          break
        }
        if (action === 'reset') {
          reset(dir, { claudeMd: opts.claudeMd })
          break
        }
        if (action === 'resync') {
          resync(dir, { claudeMd: opts.claudeMd, force: opts.force, diff: opts.diff })
          break
        }
        // action === 'create-missing' → fall through to a normal (skip-existing) init.
      }

      // Fresh repo (or create-missing): isolation defaults OFF; a flag or an
      // interactive "yes" opts in. Only prompt for isolation on a fresh repo.
      let isolation = opts.isolation === true
      let workspaceMode = 'worktree'
      if (interactive && !isExistingSetup(dir)) {
        const { promptSetup } = require('./prompts.js')
        const answers = await promptSetup({ isolationSeed: isolation })
        isolation = answers.isolation
        workspaceMode = answers.mode
      }
      await init({
        dir,
        force: opts.force,
        claudeMd: opts.claudeMd,
        mode: 'init',
        isolation,
        workspaceMode,
      })
      break
    }
    case 'update':
      // `update` is a resync — refresh managed files, keep customized ones
      // (--force to overwrite). Leaves specs/ and live .core config alone.
      resync(dir, { claudeMd: opts.claudeMd, force: opts.force, diff: opts.diff })
      await cleanupReleaseTooling(dir, opts)
      break
    default:
      throw new Error(unknownCommand(cmd))
  }
}

module.exports = { run, parse, HELP, unknownCommand }
