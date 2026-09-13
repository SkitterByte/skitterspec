'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { init, resync, reset, checkSync, isExistingSetup } = require('./init.js')
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
  liveWorktreePaths,
  collectSpecFolders,
  allSpecs,
  resolvePrimaryCheckout,
  assertPrimaryOnMain,
  currentBranch,
  repoInfo,
  expandTokens,
  splitPrefix,
  BUCKETS,
} = require('./env/resolve.js')
const building = require('./env/building.js')
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
const {
  rawGitReader,
  collectReview,
  renderReviewPage,
  renderReviewBlock,
  reviewOutPath,
  reviewFileUrl,
  reviewUrlPath,
  reviewPublishPath,
  readReviewUrl,
  publishedPageNotice,
  reviewServerNotice,
  renderReviewFragment,
  resolveReader,
  writeReviewPage,
  reviewNotesPath,
  readNotes,
  writeNotes,
  validateNotesBlob,
  validateResolutions,
  mergeNotes,
  applyResolutions,
} = require('./env/review.js')
const { planUp, planCheckoutUp } = require('./env/provision.js')
const { classifyDirtyTree } = require('./env/classify.js')
const { planDown, planDownCheckout } = require('./env/teardown.js')
const { planPrune, liveSlugsForSpecs, reconcileRegistry } = require('./env/prune.js')
const { planIntegrate, planIntegrateCheckout } = require('./env/integrate.js')
const { planHotfixLand } = require('./env/hotfix.js')
const { planDev } = require('./env/dev.js')
const { startProcess, stopProcess, waitHealthy, readPid, isAlive } = require('./env/supervise.js')
const { renderRoutes, portsInUse, waitListening } = require('./env/proxy.js')
const { mintToken, servableSpecs } = require('./env/serve.js')

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
                              .core config alone. --check reports what it would
                              change and writes nothing.
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
                                review <spec>     write an HTML page of the spec's diff
                                                  (--branch for the whole spec; --out, --json)
                                                  (--notes <json> merges a review pass back;
                                                   --resolve <json> records what was done)
                                resolve <spec>    print resolved slug/type/branch/paths
  skitterspec gating <cmd>    Release-gating check (opt-in; needs
                              specs/.core/gating.config.json). Subcommands:
                                check [spec]      report specs with no recorded gating
                                                  decision (--all, --json). Advisory:
                                                  always exits 0, never blocks.
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
  --gating                 (init) Adopt release gating: each spec records whether
                           it ships behind a feature flag
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
    check: false,
  }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') opts.force = true
    else if (a === '--no-claude-md') opts.claudeMd = false
    else if (a === '--yes' || a === '-y') opts.yes = true
    else if (a === '--isolation') opts.isolation = true
    else if (a === '--no-isolation') opts.isolation = false
    else if (a === '--gating') opts.gating = true
    else if (a === '--no-gating') opts.gating = false
    else if (a === '--all') opts.all = true
    else if (a === '--json') opts.json = true
    else if (a === '--remove-release-tooling') opts.removeReleaseTooling = true
    else if (a === '--resync') opts.resync = true
    else if (a === '--reset') opts.reset = true
    else if (a === '--diff') opts.diff = true
    else if (a === '--check') opts.check = true
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
  const worktreePaths = liveWorktreePaths(gitReader(dir))
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
// the /spec-env skill executes (git worktree add, docker compose up, .env).
// This creates no worktree and starts no stack — the caller runs the
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
  // Ask about EVERY bucket, by folder name — never about `spec.path`.
  //
  // A spec's folder is its identity; which bucket holds it is a property of the
  // ref you are asking about, and the two legitimately disagree: `/spec-start`
  // moves a spec to `in-progress` on its own branch while the base still shows
  // `backlog`. Worse, resolution PREFERS the worktree, so `spec.path` routinely
  // points outside this repo entirely (`../<repo>-wt/<slug>/specs/...`) — a path
  // no `cat-file` or `log` can ever match, which turned every in-flight spec
  // into "not committed" and silently emptied the `it is on <branch>` hint too.
  const rels = BUCKETS.map((bucket) => `specs/${bucket}/${spec.folder}`)
  for (const rel of rels) {
    if (git(['cat-file', '-e', `HEAD:${rel}/00-overview.md`]) !== null) {
      return { onFork: true, foundOn: null }
    }
  }
  // Best-effort: name the branch that does have it, so the refusal is actionable.
  let foundOn = null
  const sha = git(['log', '--all', '--format=%H', '-1', '--', ...rels])
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
  // "all of it" is a claim about the whole tree, and it stops being true the
  // moment somebody else's work is sitting there too.
  const head = (plan.untouched || []).length
    ? `uncommitted, and this much of it is ${folder}'s — it will be committed first:`
    : `uncommitted, and all of it is ${folder}'s — it will be committed first:`
  const out = ['', `  ${head}`]
  for (const p of plan.specCommit.paths) out.push(`    ${p}`)
  return out
}

// What the run is deliberately leaving alone. Printed rather than swallowed,
// because provisioning beside somebody else's uncommitted work is a fact the
// operator should be told — and never printed as a warning, because it is not
// one: a worktree carries nothing, and the spec commit above names its own paths.
function untouchedLines(plan) {
  const untouched = plan.untouched || []
  if (!untouched.length) return []
  const out = ['', `  not this spec's — left untouched (${untouched.length}):`]
  for (const p of untouched) out.push(`    ${p}`)
  return out
}

// `spec-env up` in checkout mode. Gathers the git facts, hands them to the pure
// planner, and prints the plan or the refusal.

/**
 * `skitterspec gating check [spec] [--all] [--json]`
 *
 * ADVISORY BY CONSTRUCTION. It reports and exits 0 — always, including when it
 * finds something. The point of release gating is that the decision is recorded
 * and reviewable, not that a machine enforces it: a project that has not decided
 * yet is not broken, and a check that stopped someone's work over a missing
 * header would be a worse failure than the omission it names.
 */
function gatingCheck(dir, argv) {
  const { opts, positional } = parse(argv)
  const { checkGating, activeSpecs } = require('./gating.js')

  let specs = null
  if (positional.length && !opts.all) {
    const name = path.basename(positional[0])
    const found = activeSpecs(dir).filter((s) => s.folder === name)
    if (!found.length) {
      // Not an accusation: a name that matches no ACTIVE spec is usually a
      // finished one, which gating never covers anyway.
      process.stdout.write(`gating: no active spec named ${name} — nothing to check.\n`)
      return
    }
    specs = found
  }

  const result = checkGating(dir, specs)

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return
  }
  if (!result.configured) {
    process.stdout.write('gating: not configured — nothing to check.\n')
    return
  }
  if (!result.findings.length) {
    process.stdout.write(
      `gating: ${result.checked} spec(s) checked — every one records a decision.\n`,
    )
    return
  }
  const lines = []
  for (const f of result.findings) {
    lines.push(
      f.kind === 'missing'
        ? `  ${f.folder} (${f.bucket}): no Gating: header`
        : `  ${f.folder} (${f.bucket}): Gating: "${f.raw}" says nothing — a bare "none" is not a reason`,
    )
  }
  lines.push('')
  lines.push('  decide, then record it on 00-overview.md beside Stack:')
  lines.push('    > **Gating:** <flag name — or "none: <one-line reason>">')
  if (result.guidance) lines.push(`  see ${result.guidance}`)
  process.stdout.write(
    `gating: ${result.findings.length} of ${result.checked} spec(s) record no decision\n` +
      lines.join('\n') +
      '\n',
  )
}

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
  // worktree machinery below applies — no slot, no trust entry and no bootstrap.
  // Handled first precisely so none of that runs by accident.
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
  out.push(...untouchedLines(plan))
  out.push('')
  out.push('  to provision, run:')
  for (const cmd of plan.commands) out.push(`    ${cmd}`)
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
/**
 * Gather the facts `reviewServerNotice` needs, and ask it what to say.
 *
 * `othersServed` counts the specs the server would still have work for once
 * this one is gone. Evaluated BEFORE the teardown commands run — the worktree
 * is still on disk at this point — so the spec being torn down is excluded by
 * name rather than by waiting for it to disappear.
 */
function reviewServerNoticeFor(dir, config, folder) {
  const sdir = stateDirLabel(config)
  const proc = serveProcFor(config, path.resolve(dir, `${sdir}/review-serve.json`), { root: dir })
  const pid = readPid(path.resolve(dir, proc.pidFile))
  let othersServed = 0
  try {
    othersServed = servableSpecs(dir, config, gitReader(dir)).filter(
      (sp) => sp.folder !== folder,
    ).length
  } catch {
    // Cannot tell how many are left — so say nothing rather than tell someone
    // to stop a server other specs may still need (negative-checks rule 4).
    return []
  }
  return reviewServerNotice({ running: Boolean(pid && isAlive(pid)), othersServed })
}

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
    // Checkout mode has no worktree, but a published page outlives it just the
    // same — the two modes must not disagree about what is left behind.
    dout.push(...publishedPageNotice(readReviewUrl(reviewOutPath(dir, spec.folder))))
    dout.push(...reviewServerNoticeFor(dir, config, spec.folder))
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
  // The one survivor. Read through `readReviewUrl` rather than by building the
  // path, and reported after the commands because it is not one of them.
  out.push(...publishedPageNotice(readReviewUrl(reviewOutPath(dir, spec.folder))))
  out.push(...reviewServerNoticeFor(dir, config, spec.folder))
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
/**
 * The same resolution as `soleProvisionedSpec`, returned as DATA rather than
 * thrown: `{ folder }` when exactly one answer, `{ candidates }` when several,
 * `{}` when none has a worktree.
 *
 * It exists because `liveGrammar` has to tell "several worktrees" from "no
 * worktrees" and act differently on each, and the only other way to do that is
 * to pattern-match the wording of an Error — which makes a message nobody
 * thought was load-bearing into API. One implementation, two presentations:
 * `soleProvisionedSpec` below is a thin wrapper that turns the two empty-handed
 * cases into the exact errors every other subcommand already relies on.
 */
function provisionedSpecChoice(dir, config, cwd = process.cwd()) {
  const worktreePaths = liveWorktreePaths(gitReader(dir))
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
  if (inside) return { folder: inside.folder }

  // 2. Otherwise only an unambiguous set answers.
  if (provisioned.length === 1) return { folder: provisioned[0].folder }
  return { candidates: provisioned.map((s) => s.folder) }
}

function soleProvisionedSpec(dir, config, cwd = process.cwd()) {
  const { folder, candidates } = provisionedSpecChoice(dir, config, cwd)
  if (folder) return folder
  if (!candidates.length) {
    throw new Error(
      'no spec given, and no spec has a worktree — name one explicitly, or run ' +
        '/spec-start to provision it.',
    )
  }
  throw new Error(
    `no spec given, and ${candidates.length} specs have worktrees — name the one ` +
      `you mean, or run this from inside one:\n` +
      candidates.map((f, i) => `  ${i + 1}. ${f}`).join('\n'),
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
  const searchDirs = [...new Set([worktreeGuess, ...liveWorktreePaths(gitReader(dir))])].filter(
    (p) => p !== dir,
  )
  // This spec's OWN worktree is preferred over the primary checkout, not merely a
  // fallback to it. `/spec-start` moves a spec to `in-progress` on the spec's own
  // branch, so the primary checkout goes on reporting `backlog` for the whole
  // life of the spec — and the same stale file supplies `Stack:` and
  // `Base version:`, so escalating a spec to docker by editing its header in the
  // worktree was invisible to `spec-env up`.
  //
  // WHAT WOULD FOOL THIS: only this spec's own worktree is promoted, never the
  // other entries in `searchDirs`. Those are other specs' checkouts, and letting
  // one of them answer for this spec would swap one wrong branch's view for
  // another's. A worktree left behind by a declined teardown can still answer
  // with a stale bucket — that is a leftover to prune, not a lookup to distrust.
  const preferDirs = worktreeGuess === dir ? [] : [worktreeGuess]
  return resolveSpec(specArg, dir, config, { searchDirs, preferDirs })
}

// Every spec folder name found under specs/* across the given checkout roots.

// Resolve every spec folder (found in the primary checkout OR any worktree) to
// { folder, slug, worktreePath }. `searchDirs` lets resolveSpec locate a spec
// that was authored on its branch and never committed to the primary checkout.

// Prune: reconcile namespace volumes against specs that still have a worktree and
// print the `docker volume rm` commands for the orphans. Liveness keys off the
// worktree, NOT the registry (a declined teardown leaves a stale slot behind), so
// this correctly reaps those and frees their stale slots. Destructive removal is
// executed by the caller (skill) after confirmation — the CLI only plans + writes
// the registry, mirroring `spec-env down`.
/**
 * Delete a review-server pidfile whose process is gone.
 *
 * A LIVE pid is left strictly alone: `isAlive` is the positive signal, and the
 * file merely existing proves nothing — a crashed server leaves one behind,
 * which is the whole case this reaps. Being wrong in the other direction would
 * mean deleting the record of a server that is still listening, so the unknown
 * case (unreadable file, failed unlink) does nothing at all.
 */
function reapStaleServePid(dir, config) {
  const proc = serveProcFor(config, path.resolve(dir, `${stateDirLabel(config)}/review-serve.json`), { root: dir })
  const file = path.resolve(dir, proc.pidFile)
  const pid = readPid(file)
  if (!pid || isAlive(pid)) return null
  try {
    fs.rmSync(file, { force: true })
  } catch {
    return null
  }
  return pid
}

function specEnvPrune(dir, config, flags) {
  // Before the docker section, deliberately: a stale pidfile is not docker's
  // business, and every branch below can return early.
  const reapedPid = reapStaleServePid(dir, config)
  if (reapedPid) {
    process.stdout.write(
      `spec-env prune: reaped a stale review-server pidfile (pid ${reapedPid} is gone).\n`,
    )
  }
  const { repoSlug } = repoInfo(dir)

  const vols = listRepoVolumes(repoSlug)
  if (!vols.ok) {
    process.stdout.write(
      `spec-env prune: could not list docker volumes — ${vols.err || 'docker unavailable'}.\n` +
        'Is Docker running? Nothing pruned.\n',
    )
    return
  }

  const worktrees = liveWorktreePaths(gitReader(dir))
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

// What the primary checkout has GAINED right now, by content. `dir` is already
// anchored on the primary checkout by the dispatcher, so this reads the tree the
// build must not be writing into. See env/building.js for why this is two
// content-based queries rather than one `status --porcelain`.
function primaryPaths(dir) {
  const git = gitReader(dir)
  return building.mergePaths(
    git(['diff', '--name-only', 'HEAD']),
    git(['ls-files', '--others', '--exclude-standard']),
  )
}

// `--record-primary`: stamp the baseline a later --assert-primary-clean reads.
function recordPrimary(dir, config, r) {
  const file = building.baselinePath(dir, config)
  const baseline = building.buildBaseline({
    spec: r.folder,
    worktreePath: r.worktreePath,
    primary: dir,
    paths: primaryPaths(dir),
  })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2) + '\n')
  const n = baseline.paths.length
  process.stdout.write(
    `spec-env resolve: baseline recorded for ${r.folder}\n` +
      `  primary:   ${dir}\n` +
      `  worktree:  ${r.worktreePath}\n` +
      `  dirty now: ${n === 0 ? 'nothing' : `${n} path(s) — these will not be reported later`}\n`,
  )
}

// `--assert-primary-clean`: did the build write into the primary checkout?
//
// THREE OUTCOMES, NOT TWO. It accuses only on `leaked`; `unknown` reports what
// blinded it and exits 0, because a baseline that is missing or belongs to
// another spec is an absence, and an absence is not evidence
// (`.claude/rules/negative-checks.md` rules 1 and 4). The blind spots this
// cannot see are named on `compare()` in env/building.js.
function assertPrimaryClean(dir, config, r) {
  const file = building.baselinePath(dir, config)
  let baseline = null
  try {
    baseline = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    baseline = null
  }
  const result = building.compare(baseline, primaryPaths(dir), {
    spec: r.folder,
    worktreePath: r.worktreePath,
    primary: dir,
  })

  if (result.verdict === 'leaked') {
    // States the OBSERVATION, not the attribution. All this knows is that the
    // primary checkout gained these paths since the baseline — it cannot know
    // who wrote them, and in practice another session writing a backlog spec
    // into the primary looks identical to a leaked build write. Both readings
    // get a next step, so being wrong about which one costs a re-record rather
    // than someone deleting work that was never a leak.
    throw new Error(
      `${result.paths.length} path(s) appeared in the PRIMARY checkout since the baseline:\n` +
        result.paths.map((p) => `    ${p}`).join('\n') +
        `\n  primary:  ${dir}` +
        `\n  worktree: ${r.worktreePath}` +
        '\n  if this build wrote them, move them into the worktree before committing.' +
        '\n  if something else did, re-run --record-primary and carry on.',
    )
  }
  if (result.verdict === 'unknown') {
    process.stdout.write(
      `spec-env resolve: cannot tell — ${result.reason}.\n` +
        '  no leak is being claimed; run --record-primary before the build to enable this check.\n',
    )
    return
  }
  process.stdout.write(
    `spec-env resolve: primary checkout clean for ${r.folder}\n` +
      `  nothing was written into ${dir}\n`,
  )
}

// Print the resolved identity/coordinates for a single spec.
function specEnvResolve(dir, config, specArg, flags = {}) {
  const r = resolveSpecWithWorktree(dir, config, specArg)
  if (flags.recordPrimary) return recordPrimary(dir, config, r)
  if (flags.assertPrimaryClean) return assertPrimaryClean(dir, config, r)
  process.stdout.write(
    `spec:       ${r.folder} (${r.bucket})\n` +
      `type/slug:  ${r.type} / ${r.slug}\n` +
      `branch:     ${r.branch}\n` +
      `worktree:   ${r.worktreePath}\n` +
      `project:    ${r.projectName}\n`,
  )
}

/**
 * `skitterspec spec-env stage [<spec>] [--json]`
 *
 * Which uncommitted paths belong to this spec, and which belong to someone else?
 *
 * `classifyDirtyTree` has answered that since the `/spec-start` gate was written,
 * but only `spec-env up` could reach it — so every skill that commits a spec
 * hand-wrote `git add specs/` instead, staging a DIRECTORY. With more than one
 * session writing into `specs/` at once that sweeps a colleague's in-progress
 * spec into this spec's commit, under this spec's ticket trailer. This verb is
 * how a skill asks instead of guessing.
 *
 * IT ACCUSES NOBODY. `foreign` is not a complaint and not a refusal — it is the
 * list of paths to leave alone. Nothing here exits non-zero and nothing here
 * writes.
 *
 * `owned` IS THE SPEC'S DOCUMENTS, NEVER ITS CODE. A phase's own implementation
 * lands in `foreign` — correctly, and this is the point: the commits this verb
 * exists to bound are the lifecycle ones (`chore(spec): complete <name>`), which
 * carry a status flip and a folder move and nothing else. A caller that staged
 * `owned` expecting a phase's work would commit the spec file alone and think it
 * had committed the feature.
 *
 * WHICH TREE IT READS: the one the caller is standing in, resolved from the
 * invocation cwd rather than from `dir` (which every subcommand re-anchors on
 * the primary checkout so worktree paths and the registry resolve identically).
 * That distinction is the whole point here: `/spec-complete` and `/spec-cancel`
 * run INSIDE the spec's worktree and must be told about that tree, while
 * `/spec-start` runs in the primary checkout and must be told about that one.
 * Re-anchoring would silently answer about the wrong checkout, so the tree read
 * is printed rather than assumed.
 */
function specEnvStage(dir, config, specArg, flags = {}, invokedFrom = dir) {
  const spec = resolveSpecWithWorktree(dir, config, specArg)

  // The git root CONTAINING the caller, not the primary checkout. `git ls-files`
  // is scoped to its cwd, so reading from a subdirectory would list only that
  // subdirectory's untracked files and report the rest of the spec as absent.
  const git = gitReader(invokedFrom)
  const tree = git(['rev-parse', '--show-toplevel']) || invokedFrom
  const paths = dirtyPaths(gitReader(tree))

  // Three states, not two (`.claude/rules/negative-checks.md` rule 4). A null
  // here is "nobody could look", never "clean" — so it must not become an empty
  // owned set, which a caller would stage happily and commit as nothing.
  if (paths === null) {
    if (flags.json) {
      process.stdout.write(
        JSON.stringify({
          spec: spec.folder,
          tree,
          owned: null,
          foreign: null,
          error: 'git could not be read',
        }) + '\n',
      )
      return
    }
    process.stdout.write(
      `spec-env stage: ${spec.folder} — git could not be read at ${tree}, so nothing was classified.\n` +
        '  This is not "clean": stage nothing on the strength of it.\n',
    )
    return
  }

  const { owned, foreign } = classifyDirtyTree(spec, paths, config)

  if (flags.json) {
    process.stdout.write(JSON.stringify({ spec: spec.folder, tree, owned, foreign }) + '\n')
    return
  }

  const out = [
    `spec-env stage: ${spec.folder} — ${owned.length} owned, ${foreign.length} foreign`,
    `  tree:  ${tree}`,
  ]
  // An empty list is omitted rather than printed under its heading: a heading
  // with nothing beneath it reads as a finding.
  if (owned.length) {
    out.push('', `  owned (${spec.folder}'s — safe to commit):`)
    for (const p of owned) out.push(`    ${p}`)
  }
  if (foreign.length) {
    out.push('', '  foreign (not this spec\'s — leave them alone):')
    for (const p of foreign) out.push(`    ${p}`)
  }
  if (!owned.length && !foreign.length) {
    out.push('', '  nothing uncommitted.')
  }
  process.stdout.write(out.join('\n') + '\n')
}

/**
 * Write a self-contained HTML review of a spec's diff.
 *
 * Read entirely through `git -C <worktreePath>` — the caller's shell never moves,
 * which is the whole point: the work being reviewed lives in a worktree, and the
 * terminal is somewhere else (often a phone). Two shapes: the uncommitted working
 * tree (the default — "what did this phase just do") and `--branch` (everything
 * since the base branch — "what does this whole spec do").
 */
async function specEnvReview(dir, config, specArg, flags) {
  // An unknown name throws here rather than falling back to the branch: a review
  // of the wrong spec looks exactly like a review of the right one.
  const spec = resolveSpecWithWorktree(dir, config, specArg)

  // The worktree is what we read; without it there is nothing to say. This is an
  // absence that means something — `git worktree list` is the same source that
  // resolved the path — so it is safe to act on.
  if (!fs.existsSync(spec.worktreePath)) {
    process.stdout.write(
      `spec-env review: ${spec.folder} has no worktree at ${spec.worktreePath} — ` +
        'run /spec-start to provision it.\n',
    )
    return
  }

  const git = rawGitReader(spec.worktreePath)
  const trimmed = gitReader(spec.worktreePath)

  let mode = 'working'
  let ref = 'HEAD'
  let base = null

  // WHICH BASE THE BRANCH VIEW MEASURES FROM. A hotfix forks its worktree from a
  // release tag rather than the base branch, so the range that answers "what
  // does this spec change" starts at that tag — `spec.baseRef`, read from the
  // `> **Base version:**` header, and null for every other spec type.
  //
  // Measuring a hotfix from the base branch is wrong in two ways at once: the
  // header says `since main`, which is not where the work started, and when the
  // tag is not an ancestor of the base branch (a release line that never merged
  // back) the range widens to include commits the hotfix never touched.
  //
  // Lazy, so the common working-tree path pays nothing for it.
  const reviewBase = () => spec.baseRef || resolveBaseBranch(config, trimmed)

  if (flags.branch) {
    base = reviewBase()
    const mergeBase = trimmed(['merge-base', base, 'HEAD'])
    // Cannot tell → do nothing. A missing merge-base means the branch and the
    // base share no history (a fresh repo, an unfetched base); diffing against
    // the base tip anyway would report every file in the project as changed.
    if (!mergeBase) {
      process.stdout.write(
        `spec-env review: no merge-base between ${base} and ${spec.branch} — ` +
          'cannot compute the branch range (fetch the base branch?).\n',
      )
      return
    }
    ref = mergeBase
    mode = 'branch'
  }

  // The sidecar is keyed to the page's path, so resolve that first — `--out`
  // moves both together.
  const out = reviewOutPath(dir, spec.folder, flags.out)
  const stored = readNotes(out, spec.folder)
  let notes = stored.notes
  let merged = null

  if (flags.notes) {
    // Refuse rather than write over notes we could not read: an unreadable
    // sidecar is a whole review pass, and overwriting it is unrecoverable.
    if (stored.corrupt) {
      process.stdout.write(
        `spec-env review: ${reviewNotesPath(out)} is not readable JSON — ` +
          'move it aside and re-paste, rather than losing what it holds.\n',
      )
      return
    }
    let blob
    try {
      blob = JSON.parse(fs.readFileSync(path.resolve(flags.notes), 'utf8'))
    } catch (err) {
      process.stdout.write(`spec-env review: notes blob: not valid JSON (${err.message})\n`)
      return
    }
    let parsed
    try {
      parsed = validateNotesBlob(blob, spec.folder)
    } catch (err) {
      // Nothing has been written at this point, and nothing will be.
      process.stdout.write(`spec-env review: ${err.message}\n`)
      return
    }
    notes = mergeNotes(notes, parsed, new Date().toISOString())
    writeNotes(out, notes)
    merged = {
      accepted: parsed.accepted.length,
      unaccepted: parsed.unaccepted.length,
      comments: parsed.comments.length,
    }
  }

  let resolvedNow = null
  if (flags.resolve) {
    if (stored.corrupt) {
      process.stdout.write(
        `spec-env review: ${reviewNotesPath(out)} is not readable JSON — ` +
          'move it aside and re-paste, rather than losing what it holds.\n',
      )
      return
    }
    // Nothing recorded means every id would be unknown. Say that once, rather
    // than listing every id back as a mistake, and write no sidecar for it.
    if (!stored.present && !flags.notes) {
      process.stdout.write(
        `spec-env review: no notes recorded for ${spec.folder} — nothing to resolve.\n`,
      )
      return
    }
    let list
    try {
      list = validateResolutions(JSON.parse(fs.readFileSync(path.resolve(flags.resolve), 'utf8')))
    } catch (err) {
      process.stdout.write(`spec-env review: ${err.message}\n`)
      return
    }
    const result = applyResolutions(notes, list, new Date().toISOString())
    notes = result.notes
    writeNotes(out, notes)
    resolvedNow = { applied: result.applied, unknown: result.unknown }
  }

  const now = new Date().toISOString()
  let data = collectReview({ spec, git, mode, ref, base, now, notes })

  // A CLEAN WORKING TREE IS NOT "NOTHING TO REVIEW". It is the state a phase
  // ends in: the page is rendered before the commit, the commit happens
  // immediately after, and from then on the working view is empty for the rest
  // of the spec's life. Falling back to the branch range is what keeps the page
  // answering after that commit.
  //
  // What could fool this: a *fresh* branch is clean too, and its branch range is
  // empty as well. That costs nothing, because the fallback is kept only when it
  // actually found something — so a spec with no work at all prints exactly what
  // it printed before any of this existed.
  //
  // An explicit `--branch` is never re-interpreted, and a non-empty working tree
  // is never swapped out from under the reader. The swap only ever replaces an
  // empty view, so no information is lost by it.
  let fellBack = false
  if (!flags.branch && data.totals.files === 0) {
    const fallbackBase = reviewBase()
    const mergeBase = trimmed(['merge-base', fallbackBase, 'HEAD'])
    // Cannot tell -> do nothing, exactly as the `--branch` path refuses. No
    // merge-base means base and HEAD share no history, and diffing against the
    // base tip would report every file in the project as changed.
    if (mergeBase) {
      const wider = collectReview({
        spec,
        git,
        mode: 'branch',
        ref: mergeBase,
        base: fallbackBase,
        now,
        notes,
        fellBack: true,
      })
      if (wider.totals.files > 0) {
        data = wider
        mode = 'branch'
        base = fallbackBase
        ref = mergeBase
        fellBack = true
      }
    }
  }

  // The written review is the model's half, and it arrives as JSON so no prose
  // ever has to round-trip through markup. Absent → the page renders without it.
  if (flags.review) {
    const raw = fs.readFileSync(path.resolve(flags.review), 'utf8')
    data.review = JSON.parse(raw)
  }

  writeReviewPage(out, renderReviewPage(data, { reviewHtml: renderReviewBlock(data.review) }))

  // The publish-ready copy, ONLY when asked. An ordinary render must not pay for
  // a second copy of the whole diff on disk for a path most renders never take.
  let publishCopy = null
  if (flags.publishCopy) {
    publishCopy = reviewPublishPath(out)
    writeReviewPage(
      publishCopy,
      renderReviewFragment(data, { reviewHtml: renderReviewBlock(data.review) }),
    )
  }

  // Read, never written, and never interpreted: the engine cannot publish, and
  // names this file only so the skill that can never has to build a path.
  const urlFile = reviewUrlPath(out)
  const url = readReviewUrl(out)

  // Resolved before the --json early return, so both outputs agree.
  const reader = resolveReader(config, process.env)

  // A remote reader cannot open a path on this machine — that is the whole of
  // what detection established. Serving is how the engine answers it: a local
  // process, ended by one flag, leaving nothing behind. PUBLISHING is still
  // never automatic here; it leaves a page this tooling cannot remove, so it
  // stays an explicit ask no detection can stand in for.
  let served = null
  if (reader.reader === 'remote' && config.review.serveOnRemote) {
    const up = await ensureReviewServer(dir, config, { host: '0.0.0.0' })
    if (!up.error) {
      // The URLs come from the bind the server HAS, not the one asked for just
      // above — adoption can hand back a loopback server whatever was
      // requested. See `reviewServedUrls`.
      const urls = reviewServedUrls(up, lanAddresses(), spec.folder)
      if (urls) {
        served = { ...urls, port: up.port, token: up.token, started: up.started }
      }
    }
  }

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        {
          spec: spec.folder,
          branch: spec.branch,
          worktree: spec.worktreePath,
          mode,
          base,
          fellBack,
          out,
          publishCopy,
          reader: reader.reader,
          readerWhy: reader.why,
          served,
          fileUrl: reviewFileUrl(out),
          urlFile,
          url,
          notesFile: reviewNotesPath(out),
          reviewed: Boolean(data.review),
          totals: data.totals,
          notes: data.notes,
          merged,
          resolved: resolvedNow,
          files: data.files.map((f) => ({
            path: f.path,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            whole: f.whole,
            noise: f.noise,
            hash: f.hash,
            accepted: f.accepted,
            acceptedAt: f.acceptedAt,
            comments: f.comments,
          })),
        },
        null,
        2,
      ) + '\n',
    )
    return
  }

  const t = data.totals
  const n = data.notes.totals
  const hasNotes = n.accepted + n.lapsed + n.unresolved + n.resolved > 0
  process.stdout.write(
    `spec-env review: ${spec.folder} (${
      fellBack ? `working tree clean — since ${base}` : mode === 'branch' ? `since ${base}` : 'uncommitted'
    })\n` +
      `  ${t.files} file${t.files === 1 ? '' : 's'}, +${t.additions} -${t.deletions}\n` +
      (merged
        ? `  merged: ${merged.accepted} accept${merged.accepted === 1 ? '' : 's'}, ` +
          `${merged.unaccepted} withdrawn, ${merged.comments} comment${merged.comments === 1 ? '' : 's'}\n`
        : '') +
      (resolvedNow
        ? `  resolved: ${resolvedNow.applied} comment${resolvedNow.applied === 1 ? '' : 's'}` +
          (resolvedNow.unknown.length
            ? ` (skipped ${resolvedNow.unknown.length} unknown id: ${resolvedNow.unknown.join(', ')})`
            : '') +
          '\n'
        : '') +
      (hasNotes
        ? `  notes: ${n.accepted} accepted · ${n.lapsed} lapsed · ` +
          `${n.unresolved} open · ${n.resolved} resolved\n`
        : '') +
      // Said only when it is true, so a review with no sidecar reads exactly as
      // it did before any of this existed.
      (stored.corrupt && !flags.notes
        ? `  notes: ${reviewNotesPath(out)} is not readable JSON — ignored, not overwritten\n`
        : '') +
      // Said only when there is something to say. `unknown` is the ordinary
      // state on a local machine, and announcing it would be noise about a
      // healthy session.
      (reader.reader === 'unknown'
        ? ''
        : `  reader: ${reader.reader}${reader.why ? ` (${reader.why})` : ''}\n`) +
      `  page: ${out}\n` +
      // Served: the `open:` line is a URL the reader can actually use, and
      // `page:` above still says where the file is. Not served — including every
      // way serving can fail — falls back to exactly the output this printed
      // before, dead link and all: that is the floor, never made worse.
      (served
        ? `  open: ${served.url}\n` +
          // Said only when there is a runner-up. One address is not a choice,
          // and an `also:` line naming nothing reads as a warning.
          (served.alternates.length
            ? served.alternates.map((u) => `  also: ${u}\n`).join('')
            : '') +
          // A loopback server is reachable from this machine and nowhere else.
          // Said here rather than left to be discovered by a phone that cannot
          // open the URL — and it names the command instead of describing it.
          (served.loopback
            ? '  local only: this server is bound to 127.0.0.1 — not reachable from your phone.\n' +
              `  widen: ${served.widen}\n`
            : '') +
          (served.started && !served.loopback
            ? '  serving: every provisioned spec, to anyone with this URL on your network.\n' +
              '  stop:  skitterspec spec-env review serve --stop\n'
            : '')
        : `  open: ${reviewFileUrl(out)}${
            reader.reader === 'remote' ? '   (will not open where you are reading)' : ''
          }\n` +
          (reader.reader === 'remote'
            ? '  serve: skitterspec spec-env review serve --host 0.0.0.0\n'
            : '')) +
      // Named on its own line so the skill never has to build the path itself.
      (publishCopy ? `  publish: ${publishCopy}\n` : '') +
      (url ? `  published: ${url}\n` : '') +
      (t.files === 0 ? '  nothing to review — no changes found.\n' : ''),
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

// Where a checkout keeps its copy of the daemon, relative to its root: this
// monorepo developing itself, and a project that installed the package. Naming
// the distribution here is a path, not provider machinery — `init.js` and
// `PROVIDER_COMMANDS` above already know package names by name.
const DAEMON_LOCATIONS = [
  path.join('node_modules', '@skitterbyte', 'skitterspec', 'src', 'env', 'serve.js'),
  path.join('packages', 'common', 'src', 'env', 'serve.js'),
]

/**
 * The `serve.js` the daemon should actually execute.
 *
 * NOT `__dirname` — that is the module directory of whichever copy of the CLI
 * is running, and running one from a worktree pinned the daemon to that
 * worktree's tree (its `review.js` then resolves the page template into the
 * worktree's `assets/`). Teardown removed the worktree, the daemon carried on
 * answering on its port, and every render failed with ENOENT for every spec.
 *
 * `root` is the primary checkout, which every spec-env command has already
 * resolved. A copy found there outlives every worktree, which is the whole
 * point. Three states, and the third is the common one — a global install or
 * `npx` has no copy under the checkout at all — so it falls back to the running
 * module rather than refusing to serve. Being wrong there costs exactly what
 * happens today; refusing would cost a feature.
 */
function daemonScript(root) {
  if (root) {
    for (const rel of DAEMON_LOCATIONS) {
      const candidate = path.join(root, rel)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return path.join(__dirname, 'env', 'serve.js')
}

/**
 * Is a running server's recorded script still on disk?
 *
 * A POSITIVE SIGNAL, and the one adoption was missing: a live pid and a
 * readable settings file were treated as proof the server works, and neither
 * can see that the code the process is executing has been deleted.
 *
 * WHAT WOULD FOOL THIS: a settings file written before `script` was recorded
 * has no key to check. That absence is not evidence — it describes every
 * healthy server started by an older build — so it adopts as before. The
 * destructive reading would kill a working server over a key it never had
 * (`.claude/rules/negative-checks.md` rule 4).
 */
function serverScriptOk(settings) {
  const script = settings && settings.script
  if (!script) return true
  return fs.existsSync(script)
}

// The supervised review-server process descriptor. Same shape as the proxy's:
// a tiny detached node process reading its settings from a file, so a restart is
// a rewrite of that file rather than an argv change.
function serveProcFor(config, settingsFileAbs, { root = null } = {}) {
  const sdir = stateDirLabel(config)
  return {
    name: 'review-serve',
    command: `node ${daemonScript(root)} ${settingsFileAbs}`,
    script: daemonScript(root),
    env: {},
    logFile: `${sdir}/logs/review-serve.log`,
    pidFile: `${sdir}/pids/review-serve.pid`,
  }
}

// Interface names that mean "a network the reader's phone is not on". On the
// machine this was written for, `bridge100`/`bridge101` are Parallels and `en0`
// is the wifi the phone shares — so the real address is neither first nor last
// in `networkInterfaces()` order, and order alone is a coin toss.
//
// WHAT WOULD FOOL THIS: it reads interface NAMES, so a VPN on a renamed adapter,
// an unusual driver, or a platform that names things differently all rank wrong.
// That is exactly why the runners-up are printed rather than discarded — a bad
// guess costs a glance, not a dead end.
const VIRTUAL_IFACE = /^(bridge|vmnet|vnic|vboxnet|docker|utun|tap|tun|veth|ppp|awdl|llw)/i
const PHYSICAL_IFACE = /^(en|eth|wl)\d/i

// Within a tier, the range a phone most plausibly shares. Only ever a
// tie-break: a corporate LAN is legitimately 10/8, so this must never outrank
// the interface name.
function rangeRank(address) {
  if (/^192\.168\./.test(address)) return 0
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 1
  if (/^10\./.test(address)) return 2
  return 3
}

/**
 * Order this machine's non-loopback IPv4 addresses, best candidate first.
 *
 * PURE — takes the interface map as an argument rather than reading
 * `os.networkInterfaces()`, so a test states the machine it describes instead of
 * depending on the one it runs on. Same discipline as `detectReader` and its
 * environment, and for the same reason.
 */
function rankLanAddresses(nets) {
  const out = []
  for (const name of Object.keys(nets || {})) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue
      const tier = PHYSICAL_IFACE.test(name) ? 0 : VIRTUAL_IFACE.test(name) ? 2 : 1
      out.push({ address: net.address, iface: name, tier })
    }
  }
  // Stable sort, so an unrankable set keeps discovery order rather than
  // shuffling between runs.
  return out
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => a.tier - b.tier || rangeRank(a.address) - rangeRank(b.address) || a.i - b.i)
    .map(({ address, iface }) => ({ address, iface }))
}

// Every non-loopback IPv4 address of this machine, best candidate first, for
// printing a URL a phone on the same network can actually open.
function lanAddresses(nets = require('node:os').networkInterfaces()) {
  return rankLanAddresses(nets).map((e) => e.address)
}

/**
 * Bring the review server up, or adopt the one already running.
 *
 * Shared by `serve` (which prints its own report) and by `review` on a remote
 * reader (which needs a URL, not a report). Only the STARTING is shared — how
 * each one talks about the result is its own business — so the two can never
 * drift on how a server comes up.
 *
 * Reuse is deliberate and load-bearing: restarting mints a fresh token, which
 * would silently kill a URL the operator already has open on their phone. Only
 * an explicit `serve` invocation (`restart`) is allowed to do that.
 *
 * Returns `{ port, token, loopback, pid, started }`, or `{ error }` — never
 * throws, because every caller's fallback is to carry on without a server.
 */
async function ensureReviewServer(dir, config, { host = '127.0.0.1', port, restart = false } = {}) {
  const sdir = stateDirLabel(config)
  const abs = (rel) => path.resolve(dir, rel)
  const settingsFile = `${sdir}/review-serve.json`
  const proc = serveProcFor(config, abs(settingsFile), { root: dir })

  // A POSITIVE SIGNAL, not an absence: a pidfile on disk proves nothing (a
  // crashed process leaves one behind), so `isAlive` is what decides.
  const pid = readPid(abs(proc.pidFile))
  const running = pid && isAlive(pid) ? pid : null

  let replaced = false
  if (running && !restart) {
    let settings = null
    try {
      settings = JSON.parse(fs.readFileSync(abs(settingsFile), 'utf-8'))
    } catch {}
    if (settings && settings.port) {
      if (serverScriptOk(settings)) {
        const lb = settings.host === '127.0.0.1' || settings.host === 'localhost'
        return {
          port: settings.port,
          token: settings.token || null,
          loopback: lb,
          pid: running,
          started: false,
        }
      }
      // Alive, addressable, and executing code that has been deleted — the
      // worktree it was started from is gone. It answers on the port and fails
      // on every page, so adopting it is worse than replacing it.
      replaced = true
    } else {
      // Running, but its settings are unreadable — we cannot address it, and
      // killing a server we cannot describe is worse than declining to use it.
      return { error: 'unreadable', pid: running }
    }
  }

  const usePort = Number(port || config.review.servePort)
  const loopback = host === '127.0.0.1' || host === 'localhost'
  // The token is the ONLY guard on a non-loopback bind, so it is minted with the
  // bind rather than offered as an option to forget.
  const token = loopback ? null : mintToken()

  if (running) await stopProcess(proc, { rootDir: dir })

  const busy = await portsInUse([usePort], loopback ? host : '127.0.0.1')
  if (busy.length) return { error: 'busy', port: usePort }

  fs.mkdirSync(path.dirname(abs(settingsFile)), { recursive: true })
  fs.writeFileSync(
    abs(settingsFile),
    // `script` is recorded so adoption has something to check. Without it the
    // only evidence a server is healthy is that its process exists.
    JSON.stringify({ dir, port: usePort, host, token, script: proc.script }, null, 2) + '\n',
  )
  const res = startProcess(proc, { cwd: dir, rootDir: dir })
  const up = await waitListening([usePort], { host: loopback ? host : '127.0.0.1' })
  if (!up) return { error: 'silent', port: usePort, pid: res.pid }

  return { port: usePort, token, loopback, pid: res.pid, started: true, replaced }
}

/**
 * `spec-env review serve` — stand up the local diff server.
 *
 * Three actions on one verb: start (the default), `--stop`, `--status`. The
 * pidfile is the single source of truth for all three, so `--status` cannot
 * claim a server that died and `--stop` cannot kill something it did not start.
 */
async function specEnvReviewServe(dir, config, flags) {
  const sdir = stateDirLabel(config)
  const abs = (rel) => path.resolve(dir, rel)
  const settingsFile = `${sdir}/review-serve.json`
  const proc = serveProcFor(config, abs(settingsFile), { root: dir })

  // A POSITIVE SIGNAL, not an absence: a pidfile on disk proves nothing (a
  // crashed process leaves one behind), so `isAlive` is what decides. Three
  // states — running, not running, and a stale file, which reads as not running
  // and is overwritten rather than reported as an error.
  const pid = readPid(abs(proc.pidFile))
  const running = pid && isAlive(pid) ? pid : null

  if (flags.status) {
    if (!running) {
      process.stdout.write('spec-env review serve: not running.\n')
      return
    }
    let settings = {}
    try {
      settings = JSON.parse(fs.readFileSync(abs(settingsFile), 'utf-8'))
    } catch {}
    process.stdout.write(
      `spec-env review serve: running (pid ${running})\n` +
        (settings.port ? `  local: ${serveUrl('127.0.0.1', settings)}\n` : ''),
    )
    return
  }

  if (flags.stop) {
    if (!running) {
      process.stdout.write('spec-env review serve: not running — nothing to stop.\n')
      return
    }
    await stopProcess(proc, { rootDir: dir })
    process.stdout.write(`spec-env review serve: stopped (pid ${running}).\n`)
    return
  }

  // Read what the running server is bound to BEFORE replacing it, so a restart
  // without `--host` keeps that bind instead of silently narrowing to loopback.
  let currentSettings = null
  try {
    currentSettings = running ? JSON.parse(fs.readFileSync(abs(settingsFile), 'utf-8')) : null
  } catch {}

  const started = await ensureReviewServer(dir, config, {
    host: restartHost(flags.host, currentSettings),
    port: flags.port,
    restart: true,
  })

  if (started.error === 'busy') {
    process.stdout.write(
      `spec-env review serve: port ${started.port} is already in use — ` +
        'pass --port, or --stop if this is an older server.\n',
    )
    return
  }
  if (started.error === 'silent') {
    process.stdout.write(
      `spec-env review serve: started (pid ${started.pid}) but port ${started.port} never came up — ` +
        `see ${proc.logFile}\n`,
    )
    return
  }

  const { port, token, loopback } = started
  const res = { pid: started.pid }

  const specs = servableSpecs(dir, config, gitReader(dir))
  process.stdout.write(
    `spec-env review serve: serving ${specs.length} spec${specs.length === 1 ? '' : 's'} ` +
      `(pid ${res.pid})\n` +
      `  local: ${serveUrl('127.0.0.1', { port, token })}\n` +
      (loopback
        ? ''
        : lanAddresses()
            .map((a) => `  lan:   ${serveUrl(a, { port, token })}\n`)
            .join('') +
          '  anyone with the lan URL can read every spec\'s diff while this runs.\n') +
      '  stop:  skitterspec spec-env review serve --stop\n',
  )
}

/**
 * The URLs to print for a served page — derived from the bind the server
 * ACTUALLY has, never from the one the caller asked for.
 *
 * `specEnvReview` requests `0.0.0.0` on a remote reader, but
 * `ensureReviewServer` adopts a server that is already running rather than
 * restarting it — deliberately, since a restart mints a fresh token and kills
 * the URL already open on someone's phone. So the server in hand may be
 * loopback-bound whatever was asked for, and printing `lanAddresses()` anyway
 * produced a URL that could not be opened, with nothing saying why.
 *
 * Loopback does not go widened silently. Restarting to satisfy the printout
 * would break the open URL to fix a description, so it prints the address that
 * works and names the command that widens it.
 */
function reviewServedUrls(up, addrs, folder) {
  const page = (host) => `${serveUrl(host, up)}${encodeURIComponent(folder)}`
  if (up.loopback) {
    return {
      url: page('127.0.0.1'),
      // No runners-up: every other address on this machine is one the server
      // is not listening on.
      alternates: [],
      loopback: true,
      widen: 'skitterspec spec-env review serve --host 0.0.0.0',
    }
  }
  // Best candidate first, with the rest kept: the ranking reads interface names
  // and can be wrong, so the alternates are offered rather than thrown away. No
  // address at all means nothing to offer, and the `file://` fallback is the
  // honest answer.
  if (!addrs.length) return null
  return { url: page(addrs[0]), alternates: addrs.slice(1).map(page), loopback: false, widen: null }
}

/**
 * The host a `--restart` should bind to.
 *
 * An explicit `--host` wins. Otherwise KEEP WHAT THE RUNNING SERVER HAD: a
 * restart defaulting back to `127.0.0.1` narrowed the bind silently, which is
 * how a `--host 0.0.0.0` server became unreachable without anyone touching a
 * flag.
 *
 * WHAT WOULD FOOL THIS: nothing running, or a settings file with no `host`.
 * Both read as loopback — the narrow branch — because widening a bind by
 * inference is the one direction that must never happen by accident
 * (`.claude/rules/negative-checks.md` rule 4).
 */
function restartHost(flagHost, settings) {
  if (flagHost) return flagHost
  return (settings && settings.host) || '127.0.0.1'
}

function serveUrl(hostname, { port, token }) {
  return `http://${hostname}:${port}/${token ? token + '/' : ''}`
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

  // DISCONNECT IS NAMED, NOT ASSUMED. A missing spec used to mean `main` — so
  // the bare form handed the ports BACK, the one verb in the family whose
  // zero-arg behaviour was the opposite of acting on your spec. It now resolves
  // like every other verb: the worktree you are standing in, else the sole
  // provisioned spec, else a refusal that names the candidates.
  //
  // This reverses `feat-script-only-commands` Decision 8, deliberately and as
  // the whole point of the change rather than as a side effect of one — see
  // `feat-bare-argument-parity`. The literal `main` is honoured even where the
  // base branch is called something else, matching `live main`, so the muscle
  // memory works in either repo.
  const base = resolveBaseBranch(config, gitReader(dir))
  if (specArg === 'main' || specArg === base) {
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

  // Ambiguity REFUSES here rather than degrading. `live` can fall back to its
  // status report; `connect` has no read-only answer to fall back to, and a
  // fallback to `main` would reinstate the very inversion above — disconnecting
  // you at the moment you are least sure what is connected.
  const spec = resolveSpecWithWorktree(dir, config, specArg)
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
  const { action, specArg, note } = liveGrammar(dir, config, positional)
  switch (action) {
    case 'status':
      // Only the bare form sets a note, and only for the one ambiguity the
      // report cannot describe. It prints ABOVE the report, not instead of it:
      // you asked a question and should still get the answer.
      if (note) process.stdout.write(note)
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
  if (!first) return bareLive(dir, config)
  if (LIVE_VERBS.has(first)) return { action: first, specArg: second }
  if (first === 'main' || first === resolveBaseBranch(config, gitReader(dir))) {
    return { action: 'release', specArg: undefined }
  }
  return { action: 'take', specArg: first }
}

/**
 * `/spec-live` with nothing after it: take the spec you are on, when there is
 * exactly one answer and the workbench is free — otherwise print the status
 * report.
 *
 * TWO POSITIVE SIGNALS, both required, and neither is an absence: a spec must
 * RESOLVE (not "no error"), and the primary checkout must be demonstrably on
 * base with no receipt (not "no evidence it is busy"). Every other state —
 * several worktrees, none, a spec already live, a hand-switched branch — is
 * *cannot tell*, and cannot-tell prints the report. That is the whole safety
 * argument for letting a bare command switch a branch at all: the one case it
 * acts on is the case with a single possible meaning.
 *
 * It decides WHICH VERB, never whether the verb is allowed. `specEnvLiveTake`
 * keeps every refusal it already had — dirty tree, hotfix, stateful spec,
 * migrations, a held instance — through `planTake`. Re-checking any of them here
 * would be a second copy free to drift from the first.
 */
function bareLive(dir, config) {
  const choice = provisionedSpecChoice(dir, config)
  if (!choice.folder) {
    // Several worktrees is the only cannot-tell the status report does not
    // explain — it reports on the repo, not on what you might have meant. With
    // none provisioned the report's own `in-flight:` line already says it.
    const note = choice.candidates.length
      ? `spec-env live: ${choice.candidates.length} specs have worktrees — name the one you mean:\n` +
        choice.candidates.map((f, i) => `  ${i + 1}. ${f}`).join('\n') +
        '\n'
      : undefined
    return { action: 'status', specArg: undefined, note }
  }

  // The workbench must be FREE, not merely un-refused. When it is not, the
  // report names the branch, the in-flight spec and the receipt — so it already
  // says why nothing was taken, and a note here would only repeat it.
  const primary = assertPrimaryOnMain(config, gitReader(dir))
  const receipt = readReceipt(dir, config)
  if (!primary.onBase || (receipt && receipt.spec)) {
    return { action: 'status', specArg: undefined }
  }

  // Resolved here rather than passed as `undefined`, so the verb acts on the
  // spec this function actually decided about.
  return { action: 'take', specArg: choice.folder }
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
  const flags = {
    keepVolumes: false,
    force: false,
    also: [],
    olderThanDays: null,
    branch: false,
    out: null,
    review: null,
    notes: null,
    resolve: null,
    json: false,
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = path.resolve(args[++i])
    else if (args[i] === '--keep-volumes') flags.keepVolumes = true
    else if (args[i] === '--force') flags.force = true
    else if (args[i] === '--also') flags.also.push(args[++i])
    else if (args[i] === '--older-than') flags.olderThanDays = Number(args[++i])
    else if (args[i] === '--branch') flags.branch = true
    else if (args[i] === '--stop') flags.stop = true
    else if (args[i] === '--status') flags.status = true
    else if (args[i] === '--port') flags.port = args[++i]
    else if (args[i] === '--host') flags.host = args[++i]
    else if (args[i] === '--publish-copy') flags.publishCopy = true
    else if (args[i] === '--out') flags.out = args[++i]
    else if (args[i] === '--review') flags.review = args[++i]
    else if (args[i] === '--notes') flags.notes = args[++i]
    else if (args[i] === '--resolve') flags.resolve = args[++i]
    else if (args[i] === '--json') flags.json = true
    else if (args[i] === '--record-primary') flags.recordPrimary = true
    else if (args[i] === '--assert-primary-clean') flags.assertPrimaryClean = true
    else positional.push(args[i])
  }
  dir = path.resolve(dir)
  // Where the caller actually is, kept before the re-anchor below. Only `stage`
  // wants it: every other subcommand asks about the repo, while that one asks
  // about the tree in front of you, and the two differ inside a worktree.
  const invokedFrom = dir
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
      specEnvResolve(dir, config, positional[0], flags)
      break
    case 'stage':
      specEnvStage(dir, config, positional[0], flags, invokedFrom)
      break
    case 'review':
      // `serve` is the one review sub-action rather than a verb of its own: it
      // answers the same question ("show me this diff") from the same engine,
      // and a sibling verb would have to re-derive every bit of that.
      if (positional[0] === 'serve') {
        await specEnvReviewServe(dir, config, flags)
        break
      }
      await specEnvReview(dir, config, positional[0], flags)
      break
    case 'live':
      await specEnvLive(dir, config, positional)
      break
    default:
      process.stdout.write(
        'Usage: skitterspec spec-env <up|down|prune|dev|connect|integrate|hotfix|live|review|stage|status|resolve> [spec] [--keep-volumes] [--force] [--also <tag>] [--older-than <days>] [--branch] [--out <file>] [--review <json>] [--notes <json>] [--resolve <json>] [--json] [--record-primary] [--assert-primary-clean]\n' +
        '  review serve [--port <n>] [--host <addr>] [--stop] [--status]  serve every diff locally\n' +
          '  [spec] is optional everywhere: omit it and the worktree you are standing\n' +
          '  in is used, else the sole provisioned spec (several -> it lists them).\n' +
          '  A bare `live` takes that spec when the workbench is free, and prints the\n' +
          '  status report when it cannot tell. `live status` still reports on the\n' +
          '  whole repo. `live main` / `connect main` (or your base branch) hand the\n' +
          '  instance and the ports back.\n',
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

  if (cmd === 'gating') {
    const [sub, ...gArgs] = rest
    const gDir = process.cwd()
    if (sub === 'check') gatingCheck(gDir, gArgs)
    else process.stdout.write('Usage: skitterspec gating check [spec] [--all] [--json]\n')
    return
  }

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
      let gating = opts.gating === true
      if (interactive && !isExistingSetup(dir)) {
        const { promptSetup } = require('./prompts.js')
        const answers = await promptSetup({ isolationSeed: isolation, gatingSeed: gating })
        isolation = answers.isolation
        workspaceMode = answers.mode
        gating = answers.gating
      }
      await init({
        dir,
        force: opts.force,
        claudeMd: opts.claudeMd,
        mode: 'init',
        isolation,
        workspaceMode,
        gating,
      })
      break
    }
    case 'update':
      // `update` is a resync — refresh managed files, keep customized ones
      // (--force to overwrite). Leaves specs/ and live .core config alone.
      // `--check` reports what it WOULD change and writes nothing.
      if (opts.check) {
        checkSync(dir, { claudeMd: opts.claudeMd })
        break
      }
      resync(dir, { claudeMd: opts.claudeMd, force: opts.force, diff: opts.diff })
      await cleanupReleaseTooling(dir, opts)
      break
    default:
      throw new Error(unknownCommand(cmd))
  }
}

module.exports = {
  run,
  parse,
  HELP,
  unknownCommand,
  rankLanAddresses,
  serveProcFor,
  serverScriptOk,
  daemonScript,
  reviewServedUrls,
  restartHost,
}
