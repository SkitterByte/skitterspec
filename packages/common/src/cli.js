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
const { loadEnvConfig, resolveServePort, servePortReason } = require('./env/config.js')

// Named once so the advisory below and any future caller agree on the wording.
const ENV_CONFIG_LABEL = 'env.config.json'

// The `spec-env` verbs, in the order the usage line prints them. ONE list,
// because two drifted: `live` and `stage` were each added to the dispatcher and
// to this usage line while `--help` was left listing ten of twelve — separately,
// months apart, which is what makes it a missing constraint rather than two
// slips. An undocumented verb reads as a removed one.
//
// `cli-help-verbs.test.js` holds the three ends together: every verb here
// appears in HELP, HELP names no verb that is not here, and this list matches
// the `case` labels the dispatcher actually handles.
//
// The `review` SUB-ACTIONS (serve/arm/gate/skip) are deliberately absent — they
// are arguments to `review`, not verbs, and the usage block spells them out on
// their own lines below.
const SPEC_ENV_VERBS = Object.freeze([
  'up',
  'down',
  'prune',
  'dev',
  'connect',
  'integrate',
  'hotfix',
  'live',
  'review',
  'stage',
  'status',
  'resolve',
  'nospec',
  'main',
])
const {
  readRegistry,
  writeRegistry,
  allocateSlot,
  freeSlot,
  portOffset,
  recordSpecless,
  forgetSpecless,
  isSpecless,
} = require('./env/registry.js')
const {
  resolveSpec,
  resolveSpecless,
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
  liveStateFor,
  liveStateLine,
  planRelease,
  planAbort,
} = require('./env/live.js')
const { ensureWorktreeDirTrusted } = require('./env/trust.js')
const {
  rawGitReader,
  collectReview,
  reviewTierStack,
  reviewTierLine,
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
  VERDICTS,
  validateNotesBlob,
  judgeVerdict,
  appendDecision,
  annotateLastDecision,
  readPending,
  writePending,
  claimPending,
  passesSince,
  waitForPass,
  waitingPasses,
  describePending,
  pendingAge,
  reviewPendingPath,
  validateResolutions,
  mergeNotes,
  applyResolutions,
  COMMITTING,
  BUTTON_SETS,
  DEFAULT_BUTTON_SET,
  reviewGatePath,
  readGate,
  writeGate,
  writeRenderRecord,
  armGate,
  disarmGate,
  gateState,
  markGateOffered,
} = require('./env/review.js')
const {
  CHECKS_VERSION,
  BUNDLED_ADAPTERS,
  runReviewers,
  diffHashOf,
  readChecks,
  writeChecks,
  cacheHit,
  asCached,
} = require('./env/reviewers.js')
const { planUp, planCheckoutUp, worktreeCd, resolveStack } = require('./env/provision.js')
const { classifyDirtyTree, dirtyPaths, specDocsIn } = require('./env/classify.js')
const { isGitCommit } = require('./env/commitcmd.js')
const { planDown, planDownCheckout } = require('./env/teardown.js')
const {
  checkMainWrite,
  recordAllow,
  clearAllow,
  mainGuardStatus,
} = require('./env/mainguard.js')
const { planPrune, liveSlugsForSpecs, reconcileRegistry } = require('./env/prune.js')
const { planIntegrate, planIntegrateCheckout } = require('./env/integrate.js')
const { planHotfixLand } = require('./env/hotfix.js')
const { planDev } = require('./env/dev.js')
const { startProcess, stopProcess, waitHealthy, readPid, isAlive } = require('./env/supervise.js')
const { renderRoutes, portsInUse, portsInUseOn, waitListening } = require('./env/proxy.js')
const {
  mintToken,
  servableSpecs,
  engineVersionFor,
  staleServer,
  pageTiers,
} = require('./env/serve.js')

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
                                                  --docs: a tree to write documents in — no
                                                  setup commands, no Docker
                                nospec <name>     record a branch with no spec document
                                                  (/no-spec work) and print its plan
                                main <check|allow|status>
                                                  the main guard — is a write about to land
                                                  on the base branch? (/allow-main lifts it)
                                down <spec>       tear down (guards; --keep-volumes, --force)
                                prune             reap orphaned test-DB volumes (--older-than <days>)
                                dev up <spec>     start host dev servers on the spec's ports
                                dev down <spec>   stop the spec's host dev servers
                                connect <spec>    expose a spec on the canonical ports (main = off)
                                integrate <spec>  plan rebase + fast-forward onto the base branch
                                hotfix land <spec>  tag + cherry-pick a hotfix (--also <tag>)
                                live <spec>       check a spec out in the primary checkout so
                                                  the running dev server serves it (take |
                                                  release | abort | status; main hands it back)
                                review <spec>     write an HTML page of the spec's diff
                                                  (--branch for the whole spec; --out, --json)
                                                  (--notes <json> merges a review pass back;
                                                   --resolve <json> records what was done;
                                                   --run-reviewers runs review.reviewers)
                                stage [spec]      split the uncommitted tree into this spec's
                                                  documents and everything else
                                status            list provisioned specs + port blocks
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
/**
 * The reviews sidecar directory for this repo. Named once, because the scan and
 * everything that renders it must agree on where to look.
 */
function reviewsDirFor(dir, config) {
  return path.join(dir, stateDirLabel(config), 'reviews')
}

/**
 * Render "what is waiting" for a human. Returns '' when nothing is — a repo
 * with no waiting pass must read exactly as it did before this existed, so the
 * heading is absent rather than printed over an empty list.
 */
function waitingSection(dir, config, now = new Date().toISOString()) {
  const found = waitingPasses(reviewsDirFor(dir, config))
  if (!found.passes.length && !found.unreadable.length) return ''
  const width = Math.max(0, ...found.passes.map((p) => p.spec.length))
  const rows = found.passes
    .map(
      (p) =>
        `  ${p.spec.padEnd(width)}  ${p.code} · ${p.action || p.verdict || 'no verdict'} · ` +
          `${pendingAge(p.at, now)}\n`,
    )
    .join('')
  // Named, never counted as zero: an unreadable store holds someone's pass, and
  // reporting "nothing waiting" over it is the one answer certainly wrong.
  const broken = found.unreadable
    .map((folder) => `  ${folder}: its pending store is not readable JSON — move it aside\n`)
    .join('')
  // The disown line only where there is something to disown. It is information
  // beside a list, not an instruction to act on every pass in it.
  const how = found.passes.length
    ? '  disown one with: skitterspec spec-env review <spec> --drop <code>\n'
    : ''
  return `\nReviews waiting:\n${rows}${broken}${how}`
}

// `review waiting` — the same answer on its own, for a caller who wants only
// this. It claims nothing and exits 0 whatever it finds: a waiting pass is
// information, never an accusation.
function specEnvReviewWaiting(dir, config, flags) {
  const found = waitingPasses(reviewsDirFor(dir, config))
  if (flags.json) {
    // ABSENT, NOT EMPTY. A consumer that predates this must see a
    // byte-identical object when there is nothing waiting.
    const out = {}
    if (found.passes.length) out.waiting = found.passes
    if (found.unreadable.length) out.unreadable = found.unreadable
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
    return
  }
  const section = waitingSection(dir, config)
  process.stdout.write(section ? `${section.replace(/^\n/, '')}` : 'spec-env review: nothing waiting.\n')
}

function specEnvStatus(dir, config) {
  const worktreePaths = liveWorktreePaths(gitReader(dir))
  const provisioned = allSpecs(dir, config, worktreePaths, speclessMap(dir, config))
    .map((s) => ({ folder: s.folder, wt: path.resolve(s.worktreePath), specless: s.specless }))
    // The primary checkout is itself in `git worktree list`; a spec is
    // provisioned only when it has its OWN worktree, separate from it.
    .filter((s) => s.wt !== dir && worktreePaths.has(s.wt))
    .sort((a, b) => a.folder.localeCompare(b.folder))

  // REACHED EITHER WAY. This used to return here, so a repo with nothing in
  // flight could say nothing about a waiting pass — and a repo with nothing in
  // flight is exactly where one hides longest.
  if (!provisioned.length) {
    process.stdout.write(`spec-env: no provisioned specs.\n${waitingSection(dir, config)}`)
    return
  }

  const registry = readRegistry(dir, config)
  process.stdout.write('Provisioned specs:\n')
  for (const { folder, wt, specless } of provisioned) {
    const slot = registry.slots[folder]
    let ports = ''
    if (slot !== undefined) {
      const off = portOffset(slot, config)
      ports = `  slot ${slot}  ports ${off}-${off + config.docker.portsPerSpec - 1}`
    }
    // SAID, not left to be noticed. A `/no-spec` branch appears in this list
    // because it has a worktree like everything else, and a reader who goes
    // looking for `specs/**/<name>/` must not conclude the repo is broken when
    // there is nothing there — it is not missing, there never was one.
    const tag = specless ? '  (no spec)' : ''
    process.stdout.write(`  ${folder}${tag}${ports}\n    ${path.relative(dir, wt) || wt}\n`)
  }
  process.stdout.write(waitingSection(dir, config))
}

// Plan a provision: allocate the slot, persist the registry, and print the plan
// the /spec-env skill executes (git worktree add, docker compose up, .env).
// This creates no worktree and starts no stack — the caller runs the
// printed commands. Keep the output's verb honest about that.


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

/**
 * `spec-env main <check|allow|status>` — the main guard.
 *
 * `check` is what the hook calls, so it follows `review gate --check`'s
 * contract exactly: **exit 1 and print the reason** when the write should be
 * refused, exit 0 and say nothing otherwise. Every cannot-tell is an exit 0.
 *
 * `allow` and `status` are for a person. `allow` is reached only through
 * `/allow-main`, which is user-only — a guard the model can lift is decoration.
 */
function specEnvMain(dir, config, positional, flags = {}, present = true, invokedFrom = dir) {
  const action = positional[0] || 'status'
  const sessionId = flags.session || process.env.CLAUDE_CODE_SESSION_ID || null
  const git = gitReader(dir)

  if (action === 'check') {
    // `invokedFrom`, NOT `dir`. Every subcommand is re-anchored on the primary
    // checkout before it runs, so asking `dir` whether it is the primary
    // checkout always answers yes — and the guard would fire on a write inside
    // somebody's worktree, which is the one place it must never fire.
    const from = invokedFrom || dir
    const verdict = checkMainWrite(from, config, gitReader(from), { sessionId, present })
    if (!verdict.refuse) return
    process.stdout.write(`spec-env main: ${verdict.reason}\n`)
    process.exitCode = 1
    return
  }

  if (action === 'allow') {
    // The primary checkout owns the allow file, so an `/allow-main` typed from a
    // worktree still lands where the guard reads it.
    const root = dir

    if (flags.off || positional[1] === 'off') {
      const had = clearAllow(root, config)
      process.stdout.write(
        had
          ? 'spec-env main: allow cleared — the base branch is guarded again.\n'
          : 'spec-env main: nothing to clear — the base branch was already guarded.\n',
      )
      return
    }

    const reason = positional.slice(1).join(' ').trim() || null
    const value = recordAllow(root, config, {
      sessionId,
      reason,
      at: new Date().toISOString(),
    })
    const scope =
      value.scope === 'session'
        ? 'this session only — it lapses when the session ends'
        : 'this repo until cleared — no session id available, so `/allow-main off` is what ends it'
    process.stdout.write(
      `spec-env main: writes to the base branch are allowed (${scope}).\n` +
        (reason ? `  reason: ${reason}\n` : '  reason: none given\n'),
    )
    return
  }

  if (action === 'status') {
    const st = mainGuardStatus(dir, config, { sessionId, present })
    if (flags.json) {
      process.stdout.write(JSON.stringify(st, null, 2) + '\n')
      return
    }
    if (st.state === 'unconfigured') {
      process.stdout.write('spec-env main: isolation is not configured — the guard is inactive.\n')
      return
    }
    if (st.state === 'off') {
      process.stdout.write(
        'spec-env main: off for this project (guards.mainIsLandingZone is false).\n',
      )
      return
    }
    if (st.state === 'allowed') {
      process.stdout.write(
        `spec-env main: allowed (${st.scope})\n  reason: ${st.reason || 'none given'}\n` +
          '  /allow-main off ends it\n',
      )
      return
    }
    process.stdout.write(
      'spec-env main: guarded — the base branch is a landing zone.\n' +
        (st.otherSession
          ? '  an allow exists for a different session, so it does not apply here\n'
          : ''),
    )
    return
  }

  process.stdout.write(
    `spec-env main: unknown action "${action}" — one of check, allow, status.\n`,
  )
}

/**
 * `spec-env nospec <name>` — record a SPECLESS branch and print its plan.
 *
 * `/no-spec` is the lane for work that genuinely has no spec: bumping four
 * projects to a new version, a lockfile refresh, a rename. It exists because a
 * guard that refuses writes on the base branch is a wall unless there is
 * somewhere cheap to go, and because work done on the base branch renders no
 * page and therefore gets no review at all.
 *
 * IT RECORDS FIRST, THEN PLANS, and the order is the correctness condition. The
 * record is what makes the name resolvable (`resolve.js`'s specless fallback),
 * so every later verb — `review`, `integrate`, `down`, `status`, a bare
 * `resolve` — can find a branch with no document behind it. Plan first and a
 * caller that runs the printed commands owns a worktree the engine cannot name.
 *
 * NO `--docs` HERE, deliberately, and it is the opposite call from `/spec`.
 * Documents mode skips the `setup` commands because writing markdown needs no
 * dependencies; `/no-spec` work is *code*, so it needs them. The two lanes want
 * opposite halves of the same provision.
 *
 * It is a planner like `up`: it creates no worktree. The registry write is its
 * only side effect, which is why it is safe to re-run.
 */
function specEnvNospec(dir, config, name, flags = {}) {
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    process.stdout.write(
      'spec-env nospec: needs a kebab-case name — it becomes the branch and the ' +
        'worktree folder.\n  e.g. skitterspec spec-env nospec bump-deps\n',
    )
    return
  }

  // A name that is already a spec is refused rather than shadowed. Two things
  // answering to one name is how `down` comes to tear the wrong tree down.
  let clash = null
  try {
    clash = resolveSpec(name, dir, config, {
      searchDirs: [...liveWorktreePaths(gitReader(dir))],
    })
  } catch {
    // Not found is the expected case, and the only one that proceeds.
  }
  if (clash && !clash.specless) {
    process.stdout.write(
      `spec-env nospec: ${name} is already a spec (${clash.bucket}) — ` +
        `use /spec-start ${name} instead.\n`,
    )
    return
  }

  const before = readRegistry(dir, config)
  const already = isSpecless(before, name)
  const spec = resolveSpecless(name, dir, config, before.specless[name])
  writeRegistry(dir, config, recordSpecless(before, name, { branch: spec.branch }))

  const worktreeRootAbs = path.dirname(spec.worktreePath)
  const trust = ensureWorktreeDirTrusted(dir, worktreeRootAbs)
  const attached = fs.existsSync(spec.worktreePath)

  const guard = worktreeCd(spec.worktreePath)
  const setupCommands = (config.setup || []).map((cmd) => `${guard}; ${cmd}`)

  const out = [
    `spec-env nospec: ${name} ` +
      (attached ? '(plan — worktree exists; will attach)' : '(plan — nothing created yet)'),
    '',
    `  worktree:  ${spec.worktreePath}`,
    `  branch:    ${spec.branch}`,
    '  stack:     worktree-only (no docker, no port block)',
    `  recorded:  ${already ? 'already in' : 'added to'} ${config.registry} as a specless branch`,
  ]
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
  out.push('')
  out.push('  to provision, run:')
  out.push(
    attached
      ? `    git worktree add ${spec.worktreePath} ${spec.branch}`
      : `    git worktree add ${spec.worktreePath} -b ${spec.branch}`,
  )
  if (setupCommands.length) {
    out.push('')
    out.push('  then, in the worktree, run:')
    for (const cmd of setupCommands) out.push(`    ${cmd}`)
  }
  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        {
          name,
          branch: spec.branch,
          worktreePath: spec.worktreePath,
          specless: true,
          attached,
          recorded: !already,
        },
        null,
        2,
      ) + '\n',
    )
    return
  }
  process.stdout.write(out.join('\n') + '\n')
}

function specEnvUp(dir, config, specArg, flags = {}) {
  const spec = resolveSpecWithWorktree(dir, config, specArg)
  const docs = flags.docs === true

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

  // READ THE TREE BEFORE WRITING ANYTHING INTO IT.
  //
  // The report below divides the uncommitted tree into this spec's paths and
  // everyone else's, and "everyone else's" means *the operator's* — work that
  // was here before this command ran. Anything this command writes must
  // therefore be invisible to that read, or `up` reports its own output as
  // somebody's unfinished business.
  //
  // It did exactly that: the trust write below creates
  // .claude/settings.local.json, and a clean checkout then reported
  // "not this spec's — left untouched (1)" naming that very file. It went
  // unnoticed for as long as it did because git reads ~/.config/git/ignore as
  // its global excludes with no core.excludesFile setting needed, and the
  // author's happened to list that path — so git never mentioned the file on
  // the one machine the suite ever ran on. The first CI runner disagreed.
  const upGit = gitReader(dir)
  const upStatus = upGit(['status', '--porcelain'])
  const upDirtyPaths = dirtyPaths(upGit)
  const upOnFork = specOnForkPoint(dir, upGit, spec)
  const upSpecUntracked = specIsUntracked(dir, upGit, spec)

  // Trust the shared worktree root so edits into the freshly-provisioned worktree
  // don't prompt. One absolute entry (the root) covers every spec; self-heals on
  // every provision for teammates who only cloned and ran /spec-start.
  const worktreeRootAbs = path.dirname(spec.worktreePath)
  const trust = ensureWorktreeDirTrusted(dir, worktreeRootAbs)

  // Documents mode brings no stack up, so a Docker spec provisioned this way is
  // a worktree-only run. Asked through `resolveStack`, which `planUp` also
  // calls, so the slot allocated here and the commands planned there cannot
  // disagree about whether there is a stack — they did, for a header-less spec.
  const wantsDocker = resolveStack(spec, config, {
    docs,
    composeFilePresent: composeFilePresent(dir, config),
  }).wantsDocker

  // Slot allocation is Docker-only: a worktree-only spec never touches the
  // registry (no slot, no port block). Its re-run signal is the worktree already
  // existing on disk (attach the branch, don't `-b`); a Docker spec's is its slot.
  //
  // THE WORKTREE ON DISK COUNTS IN BOTH PATHS, and documents mode is what makes
  // that necessary rather than merely tidy. A Docker spec provisioned with
  // `--docs` allocates no slot, so a later `up` without the flag would read the
  // registry, find nothing, and plan `git worktree add -b <branch>` over a
  // worktree and a branch that both already exist — a plan that cannot run. The
  // stronger signal is the honest one either way: a tree on disk is a re-run,
  // whatever the registry remembers.
  let slot = null
  let attached
  const worktreeOnDisk = fs.existsSync(spec.worktreePath)
  if (wantsDocker) {
    const before = readRegistry(dir, config)
    attached =
      Object.prototype.hasOwnProperty.call(before.slots, spec.folder) || worktreeOnDisk
    const alloc = allocateSlot(before, spec.folder)
    slot = alloc.slot
    writeRegistry(dir, config, alloc.registry) // the engine's only write (Docker path)
  } else {
    attached = worktreeOnDisk
  }

  // The tree gate: the same facts the checkout planner gets, all of them read
  // above — before this command wrote anything of its own into the tree.
  const plan = planUp(spec, { slot, attached }, config, {
    clean: upStatus !== null && upStatus.length === 0,
    dirtyPaths: upDirtyPaths,
    specOnFork: upOnFork.onFork,
    specFoundOn: upOnFork.foundOn,
    forkRef: spec.baseRef || currentBranch(upGit) || 'HEAD',
    specUntracked: upSpecUntracked,
    composeFilePresent: composeFilePresent(dir, config),
  }, { docs })

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
  // Said positively and only when asked for, so the absent setup step below
  // reads as a choice rather than as a project with nothing configured.
  if (plan.docs) {
    out.push('  docs:      documents only — no setup commands, no docker')
  }
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

/**
 * The recorded specless branches (`/no-spec` work), or an empty map.
 *
 * Wrapped because every caller wants the same cannot-tell behaviour: a
 * malformed or unreadable registry must not stop a resolution that the folder
 * search can answer on its own (`.claude/rules/negative-checks.md` rule 4).
 */
function speclessMap(dir, config) {
  try {
    return readRegistry(dir, config).specless || {}
  } catch {
    return {}
  }
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
  const plan = planDown(spec, config, flags, {
    worktreeState,
    timestamp: compactTimestamp(),
    composeFilePresent: composeFilePresent(dir, config),
  })

  if (plan.blocked) {
    process.stdout.write(
      `spec-env down: blocked — ${plan.reason}.\n` +
        'Re-run with --force to tear down anyway (destroys the worktree).\n',
    )
    return
  }

  // Free the slot (the engine's only write on down) — only if one was held; a
  // worktree-only teardown never touches the registry.
  //
  // A SPECLESS BRANCH IS FORGOTTEN HERE TOO, and it has to be: the record is the
  // only thing that made the name resolvable, so leaving it behind would keep a
  // torn-down `/no-spec` branch answering to `review`, `integrate` and a bare
  // `resolve` with a worktree path that is no longer on disk. `forgetSpecless`
  // is idempotent, so this costs a write and nothing else.
  const wasSpecless = isSpecless(registry, spec.folder)
  if (hasSlot || wasSpecless) {
    let next = registry
    if (hasSlot) next = freeSlot(next, spec.folder)
    if (wasSpecless) next = forgetSpecless(next, spec.folder)
    writeRegistry(dir, config, next)
  }

  const out = []
  out.push(
    `spec-env down: ${spec.folder}` +
      (hasSlot ? ' (slot freed)' : wasSpecless ? ' (specless record forgotten)' : ''),
  )
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
  const provisioned = allSpecs(dir, config, worktreePaths, speclessMap(dir, config))
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
  // A SPECLESS BRANCH RESOLVES TOO, on the registry's word and nothing else.
  // `/no-spec` work has a worktree and a branch and no document under
  // `specs/**`, so every verb below — down, integrate, review, resolve, status —
  // would refuse it as "spec not found". Passing the recorded map here is what
  // makes one name resolvable without making every typo resolvable: `resolveSpec`
  // consults it only after the folder search has come up empty, and only for a
  // name the engine itself wrote down.
  return resolveSpec(specArg, dir, config, {
    searchDirs,
    preferDirs,
    specless: speclessMap(dir, config),
  })
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
  const specs = allSpecs(dir, config, worktrees, speclessMap(dir, config))
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
    // A specless branch has no bucket because it has no document — say that
    // rather than printing `(null)`, which reads as a lookup that failed.
    `spec:       ${r.folder} (${r.specless ? 'no spec' : r.bucket})\n` +
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
 * The tree and the file set behind `review --docs`: this spec's own uncommitted
 * documents, in the checkout the caller is standing in.
 *
 * It is `stage`'s split, reused rather than re-derived — same tree resolution,
 * same `classifyDirtyTree`. THE `owned` HALF IS WHAT MAKES THIS SAFE TO RENDER:
 * a checkout is shared by every session standing in it, so the uncommitted tree
 * routinely holds spec documents this spec has no claim on. Rendering the tree
 * would put them on this page, and a committing verdict here would then commit
 * them under this spec's ticket.
 *
 * WHAT WOULD FOOL THIS: nothing, for a path outside the spec's folder that the
 * project declared a companion — those are owned by construction. What it
 * cannot see is a document belonging to this spec that is already committed:
 * `dirtyPaths` answers about the uncommitted tree only, so a spec whose files
 * are all committed renders as nothing to review rather than as its own text.
 * That is the intended reading — there is no change to review — and it is why
 * the empty case says so instead of drawing an empty page.
 *
 * Three states, never two (`.claude/rules/negative-checks.md` rule 4). A git
 * that could not be read is `cannot tell`, and must not become an empty file
 * set: an empty set renders a page saying nothing changed, which is the one
 * reading that is certainly wrong.
 *
 * @returns {{tree: string, owned: string[]}|{error: string}}
 */
function resolveSpecDocs(config, spec, invokedFrom) {
  const git = gitReader(invokedFrom)
  const tree = git(['rev-parse', '--show-toplevel']) || invokedFrom
  // THE CLASSIFICATION IS SHARED with the review server's route for the same
  // spec (`specDocsIn`), so the served page and the written page cannot
  // disagree about which files they show. This function adds only the wording.
  const found = specDocsIn(tree, spec, config, gitReader(tree))
  if (found.error) {
    return {
      error:
        `git could not be read at ${tree}, so ${spec.folder}'s documents were not classified — ` +
        'nothing rendered. This is not "nothing to review".',
    }
  }
  if (found.empty) {
    return {
      error: `${spec.folder} has no uncommitted documents in ${tree} — nothing to review.`,
    }
  }
  return found
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
// How a judged verdict reads on the `notes:` line. The refused case leads with
// the word `refused` rather than burying it after the reason, because the one
// thing the reader must take away is that the approval did not happen.
function verdictSaid(v) {
  if (!v.honoured) return `commit refused — ${v.reason}`
  // A committing verdict names what it hands off to, because that is the next
  // thing that will happen to the repo and the reader should see it coming.
  if (v.effective === 'commit') return `committing with ${v.commitWith}`
  if (v.effective === 'commit-continue') return `committing with ${v.commitWith}, then the next phase`
  // EVERY COMMITTING VERDICT NEEDS A LINE HERE, and the fall-through below is
  // why: a verdict this function does not know reads as `discuss first`, so a
  // reader who pressed a green button would be told their review ended in a
  // conversation. Adding one to `COMMITTING` and not to this list is silent.
  if (v.effective === 'commit-start') return `committing with ${v.commitWith}, then putting it in flight`
  // Names what it does NOT do, because the reader of a mid-run page has just
  // pressed a green button and must not read it as a commit.
  if (v.effective === 'continue') return 'read — carrying on, nothing committed'
  if (v.effective === 'changes') return 'changes requested'
  return 'discuss first'
}

/**
 * Resolve the spec and its page path for a gate verb, or say why not.
 *
 * Shared by `arm`, `gate` and `skip` so all three answer about the same
 * sidecar the render writes beside the page — `--out` moves them together, and
 * a gate keyed to a different path than its page is a gate nobody can clear.
 *
 * It never throws. Resolution failure is a cannot-tell for these verbs, not an
 * error: `gate --check` is called by a commit hook, and a hook that fails on a
 * repo it could not resolve would block every commit in it.
 */
function gateTarget(dir, config, specArg) {
  try {
    const spec = resolveSpecWithWorktree(dir, config, specArg)
    return { spec, out: reviewOutPath(dir, spec.folder), reason: null }
  } catch (err) {
    return { spec: null, out: null, reason: err.message }
  }
}

/**
 * `review wait` — block until a verdict arrives, so nobody has to improvise it.
 *
 * THE COMMAND EXISTS BECAUSE THE WAIT DID NOT. The skills said "watch the
 * pending store and end your turn", so every run wrote its own watcher in
 * shell — and one of them wrote `[ "$x" \> "$y" ]`, which is valid bash and a
 * syntax error in zsh. It could never be true, spun for five minutes, and
 * looked exactly like patience the whole time.
 *
 * So this says it started. A caller can then tell a live wait from a dead one,
 * which is the one thing none of the improvised watchers could offer.
 *
 * It is a WAIT and not a claim: the pass is left in the holding area for
 * `--claim-since` to take, so the rule that a pass is never claimed without a
 * person asking (`/spec-diff` §0) is untouched by anything here.
 */
async function specEnvReviewWait(dir, config, specArg, flags) {
  let spec
  try {
    spec = resolveSpecWithWorktree(dir, config, specArg)
  } catch (err) {
    process.stdout.write(`spec-env review wait: ${err.message}\n`)
    process.exitCode = 1
    return
  }

  // A WINDOW IS REQUIRED, and an absent one is not an open one. Without it
  // there is no way to tell this sitting's pass from a stranger's, and waiting
  // for "any pass at all" is how one gets swept up.
  if (!flags.since) {
    process.stdout.write(
      'spec-env review wait: --since <iso> is required — it is the window that decides which pass is yours\n',
    )
    process.exitCode = 1
    return
  }

  const out = reviewOutPath(dir, spec.folder, flags.out)
  const timeoutMs =
    flags.timeout === undefined || flags.timeout === null ? null : Number(flags.timeout) * 1000
  if (timeoutMs !== null && !Number.isFinite(timeoutMs)) {
    process.stdout.write(`spec-env review wait: --timeout ${flags.timeout} is not a number of seconds\n`)
    process.exitCode = 1
    return
  }

  // SAID BEFORE THE FIRST POLL, not after it. The whole point is that a caller
  // knows the wait is running; a line printed on the way out would arrive only
  // for the waits that already worked.
  if (!flags.json) {
    process.stdout.write(
      `spec-env review wait: ${spec.folder} — waiting for a verdict sent since ${flags.since}` +
        `${timeoutMs === null ? '' : ` (up to ${flags.timeout}s)`}\n`,
    )
  }

  const result = await waitForPass(() => readPending(out, spec.folder), flags.since, { timeoutMs })

  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ spec: spec.folder, since: flags.since, ...result }, null, 2)}\n`)
  }

  if (result.state === 'arrived') {
    if (!flags.json) {
      process.stdout.write(
        `  arrived: ${result.code}\n` +
          `  claim it: skitterspec spec-env review ${spec.folder} --claim-since ${flags.since}\n`,
      )
    }
    return
  }

  process.exitCode = 1
  if (flags.json) return

  if (result.state === 'unusable') {
    process.stdout.write(`  --since ${flags.since} is not a timestamp — nothing to wait inside\n`)
    return
  }
  if (result.state === 'ambiguous') {
    // NAMES THE COUNT, NEVER THE CODES — the same silence `--claim-since` keeps.
    // Two in one window is two sittings or two people, and the operator has the
    // codes; printing them here would hand a guesser the answer.
    process.stdout.write(
      `  ${result.count} passes arrived in that window — claim one by its code rather than guessing\n`,
    )
    return
  }
  process.stdout.write('  timed out — no verdict arrived in the window\n')
}

// `review arm` — a phase ended, and its diff is now owed a verdict.
function specEnvReviewArm(dir, config, specArg, flags) {
  const target = gateTarget(dir, config, specArg)
  if (!target.spec) {
    // Arming is a best-effort half of a phase ending; the phase is still built.
    process.stdout.write(`spec-env review arm: cannot tell which spec — ${target.reason}\n`)
    return
  }
  const read = readGate(target.out, target.spec.folder)
  if (read.corrupt) {
    // Same rule as every other sidecar: never write over a file we could not
    // read. Here that also means never claiming to have armed something.
    process.stdout.write(
      `spec-env review arm: ${reviewGatePath(target.out)} is not readable JSON — ` +
        'move it aside rather than losing the history it holds.\n',
    )
    return
  }
  const phase = flags.phase === undefined ? null : flags.phase
  const before = read.gate
  const gate = armGate(before, { at: new Date().toISOString(), phase })
  writeGate(target.out, gate)
  const again = before.armed && gate.armedAt === before.armedAt
  if (flags.json) {
    process.stdout.write(JSON.stringify({ spec: target.spec.folder, armed: true, armedAt: gate.armedAt, phase: gate.phase, alreadyArmed: again }, null, 2) + '\n')
    return
  }
  process.stdout.write(
    `spec-env review arm: ${target.spec.folder} is awaiting a verdict` +
      `${gate.phase ? ` (phase ${gate.phase})` : ''}` +
      `${again ? ' — already was, since ' + String(gate.armedAt).slice(0, 19) : ''}\n`,
  )
}

/**
 * `review gate` — is anything owed?
 *
 * `--check` is the one call a commit hook makes, and it exits non-zero ONLY on
 * `armed`: a positive signal, read from a present and parseable sidecar. Every
 * other state — cleared, unreadable, versioned past this engine, switched off
 * — exits 0 and says which, because a check that accuses on an absence accuses
 * healthy repos (`.claude/rules/negative-checks.md`).
 */
function specEnvReviewGate(dir, config, specArg, flags, invokedFrom = dir) {
  // `--for-command` is the hook's half: it asks about a command line rather
  // than about the repo, and a command that is not a commit is simply not this
  // check's business. Answered FIRST and in silence, because the overwhelming
  // majority of tool calls land here and every one of them must cost nothing
  // and say nothing.
  if (flags.forCommand !== undefined && !isGitCommit(flags.forCommand)) return

  const target = gateTarget(dir, config, specArg)
  let judged = target.spec
    ? gateState({ ...readGate(target.out, target.spec.folder), required: config.review.required })
    : { state: 'unknown', reason: target.reason, gate: null }

  // ASKED ABOUT A COMMAND, the question is narrower than "is anything owed in
  // this repo": it is "does the commit happening HERE owe a verdict". The bare
  // resolution answers with the sole provisioned spec wherever you stand, which
  // is right for a person typing the verb and wrong for this — it denied a
  // commit on the base branch because some other spec was mid-review, which is
  // exactly how a backlog spec authored from the primary checkout (the thing
  // `commit-trailers.md` asks for) would be blocked by unrelated work.
  //
  // So it wants a POSITIVE signal (`.claude/rules/negative-checks.md` rule 1):
  // this commit is running inside that spec's own worktree. Anything else —
  // the primary checkout, another spec's tree, a path that cannot be resolved —
  // is a cannot-tell, and cannot-tell allows.
  if (flags.forCommand !== undefined && judged.state === 'armed') {
    const inside = (child, parent) => {
      try {
        const rel = path.relative(fs.realpathSync(parent), fs.realpathSync(child))
        return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
      } catch {
        return false
      }
    }
    if (!inside(invokedFrom, target.spec.worktreePath)) {
      judged = {
        state: 'unknown',
        reason: `this command is not running inside ${target.spec.folder}'s worktree`,
        gate: judged.gate,
      }
    }
  }

  // RECORDED BEFORE THE ANSWER IS WRITTEN, so the offer this call hands back is
  // also the one it spends. Explicit rather than automatic: a plain read of the
  // gate must stay a read, because `/spec-next` makes one on every run.
  //
  // Best-effort, like the render record. A sidecar that could not be written
  // costs a second offer, which is the harmless direction — where refusing to
  // answer would block a commit over a bookkeeping failure.
  if (flags.offered && judged.state === 'armed' && target.spec) {
    const marked = markGateOffered(judged.gate, { at: new Date().toISOString() })
    if (marked.marked) {
      try {
        writeGate(target.out, marked.gate)
      } catch {
        /* the gate is the guard; this is only its memory of having asked */
      }
    }
  }

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        {
          spec: target.spec ? target.spec.folder : null,
          state: judged.state,
          reason: judged.reason,
          armedAt: judged.gate ? judged.gate.armedAt : null,
          phase: judged.gate ? judged.gate.phase : null,
          required: config.review.required,
          // Absent stays absent: only an `armed` gate has a way out to declare,
          // and every cannot-tell state carries none.
          ...(judged.offer ? { offer: judged.offer } : {}),
          log: judged.gate && Array.isArray(judged.gate.log) ? judged.gate.log : [],
        },
        null,
        2,
      ) + '\n',
    )
  } else if (judged.state === 'armed') {
    const g = judged.gate
    process.stdout.write(
      `spec-env review gate: ${target.spec.folder} is awaiting a verdict` +
        `${g.phase ? ` (phase ${g.phase})` : ''}` +
        `${g.armedAt ? ` since ${String(g.armedAt).slice(0, 19)}` : ''}\n` +
        '  read the page and send a verdict, or record why you are moving on:\n' +
        '    skitterspec spec-env review skip "<reason>"\n',
    )
  } else if (judged.state === 'clear') {
    process.stdout.write(`spec-env review gate: ${target.spec.folder} owes nothing — ${judged.reason}\n`)
  } else {
    process.stdout.write(
      `spec-env review gate: cannot tell — ${judged.reason}.\n` +
        '  nothing is being claimed, and nothing is blocked.\n',
    )
  }

  // The exit status is the whole interface for a hook, so it is set from the
  // one state that is evidence and never from the two that are not.
  if (flags.check && judged.state === 'armed') process.exitCode = 1
}

/**
 * `review allow <network|remote> [--off]` — permit or withdraw a review tier.
 *
 * THE FIRST THING IN THIS ENGINE TO WRITE `env.config.json`, and that is why it
 * is narrow: it reads, sets one key under `review`, and writes back with the
 * indent the file already uses. It never reorders, never adds a key nobody
 * asked for, and never touches another section.
 *
 * WHAT WOULD FOOL THIS: a config written with comments. `loadEnvConfig` parses
 * it with `JSON.parse`, so such a file already fails to load and there is no
 * comment-preserving case to protect — but a file indented with anything other
 * than two spaces IS reformatted, which is cosmetic and worth knowing before it
 * shows up in someone's diff.
 *
 * IT EDITS A COMMITTED FILE. Turning network reviews on for yourself turns them
 * on for everyone who pulls, so the output says so rather than leaving it to be
 * discovered by a colleague's render.
 */
function specEnvReviewAllow(dir, config, tier, flags) {
  const TIERS = { network: 'allowNetwork', remote: 'allowRemote' }
  const key = TIERS[String(tier || '').trim()]
  if (!key) {
    // Refused by name, never coerced to a default: silently permitting the
    // wrong tier is the one outcome worth more than a round trip.
    process.stdout.write(
      `spec-env review allow: ${JSON.stringify(tier || '')} is not a tier — ` +
        `one of ${Object.keys(TIERS).join(', ')}. Nothing changed.\n`,
    )
    process.exitCode = 1
    return
  }
  // THREE WAYS TO SAY WHAT THE TIER SHOULD BE, and only the third is new.
  // Bare `allow <tier>` turns it ON and `--off` turns it off, exactly as they
  // always have — every existing caller and test reads those.
  //
  // `--set` exists because a SLASH COMMAND can only make one static
  // substitution: `/spec-remote-review on` has to reach the engine as the word
  // the person typed, not as a flag the command file worked out. An EMPTY value
  // is the bare form of that command, and it toggles — which is the common case,
  // because a reader flipping a tier is looking at the line that says which way
  // it currently is.
  let on = !flags.off
  if (flags.set !== undefined) {
    const said = String(flags.set).trim().toLowerCase()
    if (said === '') {
      // Toggle. Read through the same precedence the report below uses, so
      // "turn it to the other thing" means the other thing the render showed.
      const current = Boolean(
        (() => {
          try {
            const now = JSON.parse(fs.readFileSync(path.resolve(dir, 'specs/.core/env.config.json'), 'utf8'))
            return now.review && now.review[key] !== undefined ? now.review[key] : config.review[key]
          } catch {
            return config.review[key]
          }
        })(),
      )
      on = !current
    } else if (said === 'on' || said === 'off') {
      on = said === 'on'
    } else {
      // Refused by name, like an unknown tier. A misspelt state coerced to a
      // default is the one outcome worth more than a round trip — and the
      // wrong default here opens a port or permits a publish.
      process.stdout.write(
        `spec-env review allow: ${JSON.stringify(String(flags.set))} is not a state — ` +
          'one of on, off, or nothing at all to toggle. Nothing changed.\n',
      )
      process.exitCode = 1
      return
    }
  }
  const file = path.resolve(dir, 'specs/.core/env.config.json')
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    // Cannot tell what is in there, so write nothing. Overwriting a config we
    // could not read is unrecoverable, and the alternative costs one message.
    //
    // NARROWER THAN IT LOOKS: `loadEnvConfig` already refuses the whole
    // `spec-env` command on an unparseable config, naming the file and the
    // parse position — so this branch is reachable only if the file changes
    // between that load and this write. It is kept for that race rather than
    // deleted as dead, and the upstream refusal is what the test asserts.
    process.stdout.write(
      `spec-env review allow: ${file} could not be read as JSON (${err.message}) — ` +
        'nothing changed.\n',
    )
    process.exitCode = 1
    return
  }
  const before = Boolean(
    parsed.review && parsed.review[key] !== undefined ? parsed.review[key] : config.review[key],
  )
  parsed.review = { ...(parsed.review || {}), [key]: on }
  fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + '\n')

  const lines = [
    `spec-env review allow: ${tier} reviews are now ${on ? 'ON' : 'OFF'}` +
      (before === on ? ' (unchanged)' : ''),
    // THE ABSOLUTE PATH, not one relative to `dir`. `dir` is re-anchored to the
    // primary checkout, so run from inside a worktree this writes a file in a
    // DIFFERENT TREE — and a relative path reads as the tree you are standing
    // in. Found by running it from a worktree and reverting the surprise.
    `  wrote: ${file}`,
    '  that is the primary checkout, whichever tree you ran this from, and the file is',
    '  COMMITTED — so it changes for everyone who pulls, and leaves that tree dirty.',
  ]
  if (key === 'allowNetwork') {
    lines.push(
      on
        ? '  the next render binds every interface, so the page opens on your phone.'
        : '  the next render binds 127.0.0.1 only, reachable from this machine.',
    )
  } else {
    lines.push(
      on
        ? '  this PERMITS publishing; it publishes nothing. A published page cannot be\n' +
          '  deleted by skitterspec, and a verdict there needs /spec-reviewed.\n' +
          '  turn it back off with: /spec-remote-review'
        : '  publishing is no longer permitted; any page already published stays up.\n' +
          '  turn it back on with: /spec-remote-review',
    )
  }
  process.stdout.write(lines.join('\n') + '\n')
}

// `review skip` — move on without a verdict, on the record.
function specEnvReviewSkip(dir, config, reason, flags) {
  const said = String(reason || '').trim()
  if (!said) {
    // The reason IS the feature. A skip with no reason is the silence this
    // whole gate exists to replace, so it is refused rather than defaulted.
    process.stdout.write(
      'spec-env review skip: needs a reason — skitterspec spec-env review skip "<why>"\n',
    )
    process.exitCode = 1
    return
  }
  const target = gateTarget(dir, config, null)
  if (!target.spec) {
    process.stdout.write(`spec-env review skip: cannot tell which spec — ${target.reason}\n`)
    process.exitCode = 1
    return
  }
  const read = readGate(target.out, target.spec.folder)
  if (read.corrupt) {
    process.stdout.write(
      `spec-env review skip: ${reviewGatePath(target.out)} is not readable JSON — ` +
        'move it aside rather than losing the history it holds.\n',
    )
    process.exitCode = 1
    return
  }
  const result = disarmGate(read.gate, { at: new Date().toISOString(), by: 'skip', reason: said })
  if (!result.logged) {
    // Nothing was owed, so nothing is recorded: a log entry here would claim a
    // decision was taken about an obligation that did not exist.
    process.stdout.write(`spec-env review skip: ${target.spec.folder} owes nothing — nothing to skip\n`)
    return
  }
  writeGate(target.out, result.gate)
  if (flags.json) {
    process.stdout.write(JSON.stringify({ spec: target.spec.folder, skipped: true, reason: said }, null, 2) + '\n')
    return
  }
  process.stdout.write(
    `spec-env review skip: ${target.spec.folder} moved on without a verdict\n  reason: ${said}\n`,
  )
}

async function specEnvReview(dir, config, specArg, flags, invokedFrom = dir) {
  // REFUSED BY NAME, never coerced to the default. A typo'd button set silently
  // rendering the committing page is the same failure the verdict validator
  // refuses for the same reason: a caller asking for the mid-run page and
  // getting the committing one would offer a reader a commit on unfinished
  // work, and nothing would have said so.
  if (flags.buttons !== null && !BUTTON_SETS.includes(flags.buttons)) {
    process.stdout.write(
      `spec-env review: --buttons ${JSON.stringify(flags.buttons)} is not one of ` +
        `${BUTTON_SETS.join(', ')} — nothing rendered.\n`,
    )
    return
  }
  const buttons = flags.buttons || DEFAULT_BUTTON_SET

  // An unknown name throws here rather than falling back to the branch: a review
  // of the wrong spec looks exactly like a review of the right one.
  const spec = resolveSpecWithWorktree(dir, config, specArg)

  // THE SIDECAR PATHS, RESOLVED BEFORE THE WORKTREE CHECK — and that ordering
  // is the whole of this feature. `.spec-env/reviews/` lives in the PRIMARY
  // CHECKOUT, keyed by the spec's folder name; not one byte of it comes from
  // the worktree. `--out` moves the page and its sidecars together.
  const out = reviewOutPath(dir, spec.folder, flags.out)

  // The other half of a confirmation: a pass the operator says is not theirs.
  // Left in the store it is reported on every render until they stop reading the
  // line — which is how the real one gets waved away too.
  //
  // AHEAD OF THE WORKTREE CHECK, because a pass that needs disowning has almost
  // always outlived its spec. `review waiting` finds the stranded ones and tells
  // the reader to `--drop` them; refusing that on a missing worktree made the
  // hint impossible to follow for every pass it could find, and ten real passes
  // sat behind it. Disowning reads and writes this one file, so the tree it was
  // being refused for was never involved.
  //
  // IT DOES NOT RETURN when it succeeds. A spec that still HAS a worktree falls
  // through to the render exactly as before, so the page is rewritten without
  // the pass on it; the gate below is what turns a successful drop into an
  // ending, and only when there is no page left to write.
  //
  // WHAT WOULD FOOL THIS: a spec whose FOLDER was deleted rather than completed.
  // `resolveSpecWithWorktree` above needs a document to resolve a name, so such
  // a pass stays unreachable by name however this gate is ordered — only
  // `spec-env review waiting`, which scans the store directly, can see it.
  // Relaxing the worktree check does not cover that case and was never meant to:
  // the two absences are different, and only one of them is what the ten
  // stranded passes were behind.
  let dropped = null
  if (flags.drop) {
    const heldRead = readPending(out, spec.folder)
    if (heldRead.corrupt) {
      process.stdout.write(
        `spec-env review: ${reviewPendingPath(out)} is not readable JSON — ` +
          'move it aside rather than losing the passes it holds.\n',
      )
      return
    }
    // Same match and the SAME SILENCE as a claim. A drop that listed the codes
    // it could not find would hand a guesser exactly what the claim withholds.
    const result = claimPending(heldRead.pending, String(flags.drop).trim())
    if (!result.pass) {
      process.stdout.write(
        `spec-env review: no pending pass with that code` +
          `${result.count ? ` (${result.count} waiting)` : ''}\n`,
      )
      return
    }
    writePending(out, result.pending)
    // Nothing is merged, and the notes sidecar is not touched.
    dropped = { code: result.pass.code, remaining: result.count }
  }

  // `--docs` reviews the spec's OWN DOCUMENTS from the tree in hand, and so
  // never consults a worktree — a spec in `backlog/` has none, which is exactly
  // the case with no page today.
  let docs = null
  if (flags.docs) {
    docs = resolveSpecDocs(config, spec, invokedFrom)
    if (docs.error) {
      process.stdout.write(`spec-env review: ${docs.error}\n`)
      return
    }
  }

  // The worktree is what we read; without it there is nothing to say. This is an
  // absence that means something — `git worktree list` is the same source that
  // resolved the path — so it is safe to act on.
  //
  // It names `--docs` because for a spec that has landed or has not yet started,
  // provisioning a worktree is not what the reader wanted: they wanted to read
  // the spec.
  // A LIVE SPEC IS THE EXCEPTION, and it is not a loosening of this absence.
  // `live take` moves the branch into the primary checkout, so the work is
  // somewhere readable even when the worktree has gone — refusing here would
  // refuse a spec whose diff is right there. Every other missing worktree still
  // refuses exactly as before.
  const liveHere = (() => {
    try {
      const st = assertPrimaryOnMain(config, gitReader(dir))
      return st.onBase === false && st.branch === spec.branch
    } catch {
      return false
    }
  })()
  if (!docs && !liveHere && !fs.existsSync(spec.worktreePath)) {
    // A DROP THAT ALREADY HAPPENED IS AN ENDING, not a refusal. The work this
    // invocation asked for is done and written; there is simply no page left to
    // rewrite, which is a fact about the spec rather than a failure of the run.
    if (dropped) {
      // THE SAME SPELLING the render uses for the same event. A drop reported
      // one way here and another way there is two events as far as anyone
      // grepping their scrollback is concerned.
      process.stdout.write(
        `spec-env review: ${spec.folder}\n` +
          `  dropped: ${dropped.code} — merged nothing` +
          `${dropped.remaining ? ` (${dropped.remaining} still waiting)` : ''}\n` +
          '  no worktree, so nothing was rendered.\n',
      )
      return
    }

    // THE REFUSAL NAMES THE EXIT THAT WORKS. It used to say "run /spec-start to
    // provision it", which for a completed spec is advice to resurrect it in
    // order to throw a pass away — and that was the only advice a reader holding
    // a stranded pass ever got.
    //
    // A STRANDED PASS STAYS UNCLAIMABLE, deliberately. Once the branch has
    // merged and the worktree is gone a `commit` verdict has nowhere to land, so
    // honouring one would report work that did not happen. Disowning is the only
    // honest ending, so it is the only one offered.
    // WHICH MESSAGE depends on a POSITIVE SIGNAL — a pass actually sitting in
    // the store. That is not decoration: the two readers are in opposite
    // situations, and one sentence cannot serve both.
    //
    // No pass waiting is overwhelmingly the commonest case — a spec in
    // `backlog/` that nobody has started — and there `/spec-start` is exactly
    // the right advice, so that message is left byte-for-byte as it was.
    //
    // A pass waiting means the spec has almost certainly finished, and telling
    // that reader to provision a worktree is telling them to resurrect a
    // completed spec in order to throw a pass away. A corrupt store reads as
    // zero, so it takes the untouched message rather than inventing a count.
    const held = readPending(out, spec.folder)
    const count = held.corrupt ? 0 : (held.pending.passes || []).length
    if (!count) {
      process.stdout.write(
        `spec-env review: ${spec.folder} has no worktree at ${spec.worktreePath} — ` +
          'run /spec-start to provision it, or --docs to review the spec itself.\n',
      )
      return
    }
    process.stdout.write(
      `spec-env review: ${spec.folder} has no worktree at ${spec.worktreePath}.\n` +
        `  ${count} waiting — disown ${count === 1 ? 'it' : 'one'} with --drop <code>, ` +
        'or `spec-env review waiting` to list them.\n' +
        // WHY CLAIMING IS NOT OFFERED, said rather than left to be discovered.
        // A stranded pass is unclaimable by design: with no worktree a `commit`
        // verdict has nowhere to land, so honouring one would report work that
        // did not happen. Disowning is the only honest ending, so it is the
        // only one named.
        '  It cannot be claimed: with no worktree, a verdict has nowhere to land.\n' +
        "  --docs reviews the spec's own documents.\n",
    )
    return
  }

  // WHERE THE BRANCH ACTUALLY IS. `live take` detaches the worktree and checks
  // the branch out in the primary checkout, so while a spec is live the tree
  // holding its work — including anything uncommitted, since a fix made while
  // live is made there — is the primary checkout. Reading the worktree then
  // reports a clean tree and shows the reader nothing.
  //
  // WHAT WOULD FOOL THIS: it trusts the branch the primary checkout is on, so a
  // branch checked out there by hand with no receipt still reads as live. That
  // is the right answer — the work IS there — and it is the same authority
  // `assertPrimaryOnMain` and `liveStateFor` use.
  const primaryState = assertPrimaryOnMain(config, gitReader(dir))
  const live = liveStateFor(
    spec,
    liveContext(dir, config, spec, {
      onBase: primaryState.onBase,
      primaryBranch: primaryState.branch,
    }),
  )

  const readFrom = docs ? docs.tree : live.state === 'on' ? dir : spec.worktreePath
  const git = rawGitReader(readFrom)
  const trimmed = gitReader(readFrom)

  let mode = docs ? 'docs' : 'working'
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

  const stored = readNotes(out, spec.folder)
  let notes = stored.notes
  let merged = null
  let sentVerdict = null
  let claimed = null

  // `--claim-since <iso>` resolves to a code and then joins the ordinary claim
  // path below. THE ENGINE PICKS SO THE AGENT DOES NOT: an agent left to find
  // "the pass that just arrived" reads the store and chooses, and the rule that
  // it must not choose becomes a request. Here the window is the only input, and
  // an answer of anything but exactly one pass acts on nothing.
  let claimCode = flags.claim
  if (!claimCode && flags.claimSince) {
    const heldRead = readPending(out, spec.folder)
    if (heldRead.corrupt) {
      process.stdout.write(
        `spec-env review: ${reviewPendingPath(out)} is not readable JSON — ` +
          'move it aside rather than losing the passes it holds.\n',
      )
      return
    }
    const window = passesSince(heldRead.pending, flags.claimSince)
    if (!window.usable) {
      process.stdout.write(
        `spec-env review: --claim-since ${flags.claimSince} is not a timestamp — nothing claimed\n`,
      )
      return
    }
    if (window.codes.length === 0) {
      process.stdout.write(
        `spec-env review: no pass has arrived since ${flags.claimSince} — nothing claimed\n`,
      )
      return
    }
    if (window.codes.length > 1) {
      // Names the count, never the codes — the same silence a wrong `--claim`
      // keeps, for the same reason. The operator has them; the page prints them.
      process.stdout.write(
        `spec-env review: ${window.codes.length} passes arrived in that window — ` +
          'claim one by its code rather than guessing between them.\n',
      )
      return
    }
    claimCode = window.codes[0]
  }

  // ONE VERDICT PER INVOCATION, and this refuses rather than reconciles. The
  // three ways a verdict arrives can carry three different words, and there is
  // no honest rule for picking between them: acting on either would commit
  // somebody's work on the strength of a word they did not mean as the answer.
  // Refused BEFORE anything is looked up, so a rejected combination cannot also
  // spend a pending code or read a blob off disk.
  if (flags.verdict && (flags.claim || flags.claimSince || flags.notes)) {
    process.stdout.write(
      'spec-env review: --verdict carries one verdict and so does ' +
        `${flags.notes ? '--notes' : '--claim'} — send one, not both\n`,
    )
    return
  }

  // A VERDICT WITH NOTHING ATTACHED — the word a `file://` page hands over when
  // the pass it would otherwise build carries nothing but the conclusion. It
  // joins the same merge below rather than forking: `judgeVerdict` still
  // refuses a commit over open comments, the log still records it, and the gate
  // still clears. What it cannot carry is marks, and it does not pretend to —
  // `merged` stays null, because nothing was.
  if (flags.verdict) {
    const word = String(flags.verdict).trim()
    if (!VERDICTS.includes(word)) {
      // The engine's own vocabulary, named in full. A word refused without the
      // list is a typo the reader has to go looking for.
      process.stdout.write(
        `spec-env review: verdict "${word}" is not one of ${VERDICTS.join(', ')}\n`,
      )
      return
    }
    sentVerdict = word
  }

  // A CLAIM IS A DELIVERY MECHANISM, not a second kind of review. It lifts a
  // pass out of the holding area and hands it to exactly the same merge a
  // pasted blob goes through, so nothing downstream can tell — or behave
  // differently — by how the pass arrived.
  if (claimCode) {
    const heldRead = readPending(out, spec.folder)
    if (heldRead.corrupt) {
      // Same rule as the notes sidecar: a file we cannot parse is not "nothing
      // pending", and claiming against it must refuse rather than find nothing.
      process.stdout.write(
        `spec-env review: ${reviewPendingPath(out)} is not readable JSON — ` +
          'move it aside rather than losing the passes it holds.\n',
      )
      return
    }
    const result = claimPending(heldRead.pending, String(claimCode).trim())
    if (!result.pass) {
      // NO FALLBACK, EVER. Not "the only one", not "the most recent" — either
      // would let a pass nobody read out reach the review, which is the whole
      // thing the code exists to prevent. And it names nothing: listing the
      // pending codes would hand a guesser the answer.
      process.stdout.write(
        `spec-env review: no pending pass with that code` +
          `${result.count ? ` (${result.count} waiting)` : ''}\n`,
      )
      return
    }
    // Validated on the way in as well as on the way out. The blob has been
    // through a socket and sat on disk, so it is untrusted input twice over.
    let parsed
    try {
      parsed = validateNotesBlob(result.pass.blob, spec.folder)
    } catch (err) {
      process.stdout.write(`spec-env review: ${err.message}\n`)
      return
    }
    notes = mergeNotes(notes, parsed, new Date().toISOString())
    writeNotes(out, notes)
    // Spent by the claim, so the same code cannot be claimed twice.
    writePending(out, result.pending)
    sentVerdict = parsed.verdict
    claimed = {
      code: result.pass.code,
      at: result.pass.at || null,
      remaining: result.count,
      accepted: parsed.accepted.length,
      unaccepted: parsed.unaccepted.length,
      comments: parsed.comments.length,
      // THE INSTRUCTION THE PASS CARRIED, and the one field here that is not a
      // count. An action blob concludes nothing — it asks for something to be
      // done and hands the page straight back — so a claim that reported only
      // the counts was indistinguishable from a pass carrying no decision at
      // all, and `/spec-diff` §2b could never fire. That is what a pressed
      // `live-on` looked like: "0 accepts, 0 withdrawn, 0 comments".
      //
      // `null` rather than absent, deliberately. Every other optional key on
      // this payload is spread away so an existing consumer sees nothing new,
      // but `claimed` is itself conditional — anything reading it was written
      // after this shipped, and a present `null` is what separates "carried no
      // action" from "an engine too old to say".
      //
      // It is NOT a verdict and must never reach `sentVerdict`: `ACTIONS` is
      // disjoint from `VERDICTS` by construction, and the gate reads the
      // verdict. This is a field beside it, not a widening of it.
      action: parsed.action || null,
    }
    merged = { accepted: claimed.accepted, unaccepted: claimed.unaccepted, comments: claimed.comments }
  }


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
    // MERGED BEFORE THE VERDICT IS JUDGED, and written either way. The notes
    // are good work even when the verdict that came with them is one we cannot
    // honour; dropping them would punish the mistake twice, and the reader
    // would have to re-read the diff to write them again.
    notes = mergeNotes(notes, parsed, new Date().toISOString())
    writeNotes(out, notes)
    sentVerdict = parsed.verdict
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

  // AFTER the merge and AFTER any resolutions, so the count the approval is
  // judged against is the one that is true now. A note raised and answered in
  // the same invocation is not an open note.
  //
  // Said nothing about when no verdict was sent: a blob without one behaves as
  // it always did, and gains no key in either output.
  let verdictReport = null
  if (sentVerdict) {
    const judged = judgeVerdict(sentVerdict, notes)
    if (judged.honoured) {
      // The log is appended only for a verdict that was ACTED ON. A refused
      // approval did not happen, and recording it as history would leave a
      // trail of decisions the repo never took.
      // THE CODE GOES IN THE LOG, and it is the only present thing that lets
      // the page conclude a pass was picked up. Without it `claimed` could only
      // be read off the code being gone from the holding area — which `--drop`,
      // a moved store and a mistyped folder all achieve without anyone claiming
      // anything. Null for a pasted blob, which carried no code to record.
      notes = appendDecision(notes, {
        verdict: judged.effective,
        at: new Date().toISOString(),
        code: claimed ? claimed.code : null,
      })
      writeNotes(out, notes)
    }
    verdictReport = {
      sent: judged.sent,
      effective: judged.effective,
      honoured: judged.honoured,
      reason: judged.reason,
      // `openCount` rather than the bare word: a dotted property of that name
      // is what the removed opener used, and `assets-spec-start-one-path`
      // guards the engine against it coming back under any spelling.
      openCount: judged.openCount,
      openFiles: judged.openFiles,
      // Named here so the skill that routes on the verdict does not have to
      // read the config itself — one answer, from the engine that owns it.
      commitWith: config.review.commitWith,
    }

    // A COMMITTING verdict is what the gate was waiting for, so it clears it —
    // and only it. `changes` leaves the gate armed deliberately: the work
    // happens, the page re-renders, and the next verdict is the exit. `discuss`
    // likewise, including a REFUSED commit, which did not happen and must not
    // clear an obligation on the strength of having been asked for.
    if (judged.honoured && COMMITTING.includes(judged.effective)) {
      const gateRead = readGate(out, spec.folder)
      if (!gateRead.corrupt) {
        const result = disarmGate(gateRead.gate, {
          at: new Date().toISOString(),
          by: 'verdict',
          reason: judged.effective,
        })
        if (result.logged) {
          writeGate(out, result.gate)
          verdictReport.gateCleared = true
        }
      }
      // A corrupt gate is left exactly as it is. It already reads as
      // cannot-tell everywhere, so it refuses nothing — there is no obligation
      // to clear, and writing over it would lose the log it holds.
    }
  }

  // What the last decision PRODUCED — written after the thing it asked for has
  // happened, which is why it is a separate invocation rather than part of the
  // verdict above. Nothing reads it back; it is history for the page to show.
  let outcomeSaid = null
  if (flags.outcome) {
    const result = annotateLastDecision(notes, flags.outcome)
    if (result.annotated) {
      notes = result.notes
      writeNotes(out, notes)
      outcomeSaid = flags.outcome
    } else {
      // Says so rather than inventing a decision to hang it on. An outcome with
      // no decision behind it is a record of something nobody chose.
      process.stdout.write('spec-env review: no decision to record an outcome against — ignored\n')
    }
  }

  // Information, never a prompt. Nothing counts these to decide anything and
  // nothing refuses over them — the same rule the marks have lived under since
  // `feat-review-round-trip`.
  //
  // DESCRIBED, not counted. The code is here so a skill can name it without
  // opening the store: an agent that still has to read `.pending.json` to find
  // a code will read it, and the rule against claiming unasked becomes a
  // request rather than a discipline.
  const waiting = describePending(readPending(out, spec.folder).pending)

  // Read AFTER the verdict half above, so a claim that just cleared the gate
  // renders as cleared rather than as still owing. Corrupt contributes nothing:
  // the page is a convenience and the gate is not what it is for.
  const gateNow = readGate(out, spec.folder)
  const gate = gateNow.corrupt ? null : gateNow.gate

  const now = new Date().toISOString()
  // The surfaces block, on a worktree view only: a `--docs` page belongs to a
  // spec with no branch to put live (decision 6), so it carries neither key and
  // renders exactly as it did before this existed.
  const surfaceArgs = docs ? {} : { live, tiers: pageTiers(config) }
  let data = collectReview({
    spec,
    git,
    mode,
    ref,
    base,
    now,
    notes,
    gate,
    buttons,
    ...surfaceArgs,
    ...(docs ? { only: docs.owned, treePath: docs.tree } : {}),
  })

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
  //
  // `--docs` NEVER FALLS BACK. Its file set is this spec's documents and the
  // branch range is every file on the branch, so the swap would replace "the
  // spec you asked for" with "everything this branch changed" — and on the base
  // branch, where a backlog spec is read, that range is the whole of main. The
  // empty case is already refused above, so there is nothing here to rescue.
  let fellBack = false
  if (!docs && !flags.branch && data.totals.files === 0) {
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
        gate,
        buttons,
        ...surfaceArgs,
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

  // THE MACHINE HALF. It composes with the written review rather than replacing
  // it: a page can carry a person's read and a tool's findings at once, and
  // which is which is on every check as its `source`.
  //
  // `--docs` deliberately never runs them. A spec document is prose, not the
  // code these tools read, and spending a rate-limited review on one is waste.
  let reviewerOutcomes = null
  if (flags.runReviewers && !docs && (config.review.reviewers || []).length) {
    const scope = mode === 'branch' ? 'branch' : 'working'
    const diffHash = diffHashOf(data.files)
    const { cache, corrupt } = readChecks(out, spec.folder)
    let checks
    let outcomes
    if (!corrupt && cacheHit(cache, spec.folder, diffHash)) {
      // KEYED ON THE DIFF, NOT A CLOCK. Re-rendering unchanged work must not
      // spend another review against an hourly limit — and any change at all
      // must re-run, because findings about code that has moved on are worse
      // than no findings.
      checks = cache.checks
      outcomes = asCached(cache.outcomes)
    } else {
      const ran = await runReviewers(config, {
        worktree: spec.worktreePath,
        base: base || reviewBase(),
        scope,
        spec: spec.folder,
        adapters: BUNDLED_ADAPTERS,
      })
      checks = ran.checks
      outcomes = ran.outcomes
      // Best-effort. A cache that could not be written costs a re-run next
      // time, which is the harmless direction — it must never fail the render.
      try {
        writeChecks(out, {
          version: CHECKS_VERSION,
          spec: spec.folder,
          diffHash,
          at: now,
          checks,
          outcomes,
        })
      } catch {
        /* a cache is an optimisation, never a record */
      }
    }
    reviewerOutcomes = outcomes
    // The written review's checks lead — a person's read is what the reader
    // came for — and the machine's follow, grouped by the reviewer that
    // produced them because `runReviewers` runs in sequence.
    data.review = {
      ...(data.review || {}),
      checks: [...((data.review && data.review.checks) || []), ...checks],
      reviewers: outcomes,
    }
  }

  writeReviewPage(out, renderReviewPage(data, { reviewHtml: renderReviewBlock(data.review) }))

  // RECORD WHAT THIS RENDER DECLARED, for the served copy to read back. The
  // daemon re-renders per request and is not the caller, so without this it can
  // only see what the work IS — enough for `authoring`, `nospec` and
  // `committing`, and blind to `midrun` and `refresh`, which say whether the run
  // had finished. `buttonsForView` takes only those two from here.
  //
  // Best-effort, like the reviewer cache: a record that could not be written
  // costs a served page its narrowing, which is the harmless direction, and it
  // must never fail a render.
  try {
    writeRenderRecord(out, { spec: spec.folder, buttons, at: now })
  } catch {
    /* the page is the artefact; this is a note for the daemon */
  }

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
  // What to say about the server, if anything. `current` and `unknown` say
  // nothing at all: the ordinary render must read exactly as it did before any
  // of this existed.
  let serverSaid = null
  // EVERY RENDER SERVES, because a `file://` page has no server to POST to and
  // so its verdict buttons have nowhere to go. The reader is not consulted here
  // any more — that gate is what handed a local machine a page it could read
  // and not answer.
  //
  // THE BIND STILL COMES FROM THE READER, and that is what makes this free of
  // new exposure: a remote reader binds every interface exactly as before, and
  // a local or unknown one binds loopback — `http://127.0.0.1` instead of
  // `file://`, which opens on the machine holding the page and, unlike
  // `file://`, can POST. Cannot-tell binds loopback, the harmless direction
  // (`.claude/rules/negative-checks.md` rule 4).
  // WHY THERE IS NO SERVED URL, when there is none. The `file://` line used to
  // mean "nobody asked for serving"; now that every render asks, it can only
  // mean the ask did not land — so the render says which: the operator turned
  // it off, or it failed and here is the reason.
  let noServeBecause = config.review.serve === 'never' ? 'review.serve is "never"' : null
  if (config.review.serve === 'always') {
    // THE BIND COMES FROM THE SETTING, not from a guess about the reader. That
    // guess was the last decision detection had, and it was wrong every time the
    // reader moved — a phone off the LAN, a local session reading a page whose
    // buttons cannot POST. `allowNetwork` is the project saying which surfaces
    // it permits, and the reader picks from what is listed.
    const host = config.review.allowNetwork ? '0.0.0.0' : '127.0.0.1'
    const up = await ensureReviewServer(dir, config, { host })
    // TRANSLATED, because `error` is a code for a caller and this line is read
    // by a person: `busy` alone does not say which port, and the port is the
    // whole of what they can act on. An unmapped code is passed through rather
    // than swallowed — a reason nobody anticipated still beats silence.
    if (up.error === 'busy') {
      noServeBecause = `port ${up.port} is already in use`
    } else if (up.error === 'unreadable') {
      noServeBecause = `a server is running (pid ${up.pid}) whose settings could not be read`
    } else if (up.error) {
      noServeBecause = String(up.error)
    }
    if (up.replaced === 'engine') {
      serverSaid = up.error
        ? // BOTH facts. A reader told only "could not start" cannot see why it
          // was trying, and "it is running an old engine and I could not replace
          // it" is the pair that explains the page they are about to open.
          `the server was running engine ${up.engineWas} and could not be replaced (${up.error}) — ` +
          `its pages are drawn by that engine`
        : `the server was running engine ${up.engineWas}; restarted on ${up.engineIs}`
    }
    if (!up.error) {
      // The URLs come from the bind the server HAS, not the one asked for just
      // above — adoption can hand back a loopback server whatever was
      // requested. See `reviewServedUrls`.
      const urls = reviewServedUrls(up, offerableLanAddresses(), spec.folder)
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
          // The tree the diff was read from — `spec.worktreePath` for every
          // mode but `docs`, where it would name a path that does not exist.
          worktree: readFrom,
          mode,
          base,
          fellBack,
          // The paths a committing verdict on this page must commit, so the
          // skill that routes on it never recomputes the set the reader saw.
          // Absent for every other mode, which keeps their output identical.
          ...(docs ? { docs: { paths: docs.owned } } : {}),
          out,
          publishCopy,
          reader: reader.reader,
          readerWhy: reader.why,
          served,
          // The same stack the text prints, so a skill reads the tiers rather
          // than parsing prose — and the two can never disagree, because both
          // come from `reviewTierStack`.
          tiers: reviewTierStack({
            served,
            fileUrl: reviewFileUrl(out),
            publishedUrl: url,
            config,
          }),
          // The same answer `live status --json` gives, from the same function,
          // so the page and the command cannot disagree. Always present, unlike
          // the tiers' optional keys: `unavailable` is a state a consumer needs
          // to see rather than an absence it has to interpret.
          live,
          // Absent when there IS a served URL, so a consumer that only ever
          // saw a served render sees no new key.
          ...(served ? {} : noServeBecause ? { notServed: noServeBecause } : {}),
          ...(serverSaid ? { server: serverSaid } : {}),
          fileUrl: reviewFileUrl(out),
          urlFile,
          url,
          notesFile: reviewNotesPath(out),
          // Absent stays absent, exactly as it is in the page payload: the
          // committing set is what a caller that did not ask always got, so
          // reporting it would make every existing consumer see a new key.
          ...(data.buttons ? { buttons: data.buttons } : {}),
          reviewed: Boolean(data.review),
          // Absent unless reviewers actually ran, so a consumer that never
          // configured one sees no new key. An empty ARRAY would be a claim
          // that they ran and said nothing.
          ...(reviewerOutcomes ? { reviewers: reviewerOutcomes } : {}),
          totals: data.totals,
          notes: data.notes,
          merged,
          resolved: resolvedNow,
          ...(verdictReport ? { verdict: verdictReport } : {}),
          ...(outcomeSaid ? { outcome: outcomeSaid } : {}),
          ...(claimed ? { claimed } : {}),
          ...(dropped ? { dropped } : {}),
          ...(waiting.length ? { pending: waiting } : {}),
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
      // The verdict is said ONCE, on the line that already carries the review
      // state. An approve of a clean read has no counts to print, so the line
      // appears for a verdict too — but never for a blob that carried none.
      (hasNotes || verdictReport
        ? `  notes: ${n.accepted} accepted · ${n.lapsed} lapsed · ` +
          `${n.unresolved} open · ${n.resolved} resolved` +
          (verdictReport ? ` · ${verdictSaid(verdictReport)}` : '') +
          '\n'
        : '') +
      (claimed
        ? `  claimed: ${claimed.code} — ${claimed.accepted} accept${claimed.accepted === 1 ? '' : 's'}, ` +
          `${claimed.unaccepted} withdrawn, ${claimed.comments} comment${claimed.comments === 1 ? '' : 's'}` +
          // Last on the line rather than folded into the counts: a reader
          // scanning for what a press did finds the verb at the end of the one
          // line the claim prints, and a pass with no action reads exactly as it
          // did before this existed.
          (claimed.action ? ` · action: ${claimed.action}` : '') +
          '\n'
        : '') +
      (dropped ? `  dropped: ${dropped.code} — merged nothing\n` : '') +
      (waiting.length
        ? `  pending: ${waiting.length} waiting\n` +
          waiting
            .map(
              (p) =>
                `    ${p.code} · ${p.action || p.verdict || 'no verdict'} · ${pendingAge(p.at, now)}\n`,
            )
            .join('')
        : '') +
      (outcomeSaid ? `  outcome: ${outcomeSaid}\n` : '') +
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
      // THE STACK, in a fixed order, every tier named. The single `open:` line
      // it replaces asked the engine to pick which surface the reader could
      // use, and the engine cannot know — that guess failed three separate ways
      // in one day. Now every tier is listed, labelled, and either a URL or the
      // one command that turns it on.
      reviewTierStack({
        served,
        fileUrl: reviewFileUrl(out),
        publishedUrl: url,
        config,
      })
        .map((t) => reviewTierLine(t) + '\n')
        .join('') +
      // The runners-up sit UNDER the network tier, because that is what they are
      // alternatives to — and virtual adapters are gone from them entirely.
      (served && !served.loopback && (served.alternates || []).length
        ? served.alternates.map((u) => `    also:  ${u}\n`).join('')
        : '') +
      // WHICH TIERS THE WAIT COVERS, once, next to the stack. `local` and
      // `network` are two doors into one room — the page POSTs to
      // `location.pathname`, so both reach this server and this pending store.
      // `remote` writes to the artifact's own store, which nothing here can see.
      '  the wait covers local + network; a remote verdict needs /spec-reviewed.\n' +
      // WHETHER IT IS ALSO RUNNING SOMEWHERE, which is the other way to judge a
      // change. `unavailable` prints nothing — see `liveStateLine`.
      (liveStateLine(live) ? `${liveStateLine(live)}\n` : '') +
      // The reason there is no served URL, when there is none. A `file://` link
      // with nothing said about it reads as the ordinary outcome, and it is not.
      (!served && noServeBecause ? `  not served: ${noServeBecause}\n` : '') +
      (served && served.loopback && config.review.allowNetwork
        ? `  network permitted but the running server is loopback-bound — ${served.widen}\n`
        : '') +
      (served && served.started && !served.loopback
        ? '  serving: every provisioned spec, to anyone with a URL on your network.\n' +
          '  stop:  skitterspec spec-env review serve --stop\n'
        : '') +
      // One line, and only when something was actually done on the reader's
      // behalf. An action nobody asked for is reported, not hidden.
      (serverSaid ? `  ${serverSaid}\n` : '') +
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

/**
 * The engine script's mtime in ms, or null when it cannot be read.
 *
 * WHY MTIME AND NOT A CONTENT HASH: the dist is assembled from several files,
 * so a hash needs a manifest to stay honest, and this answers the only question
 * asked — is the code on disk newer than the process serving it? WHY NOT THE
 * PROCESS START TIME: `ps -o lstart=` is platform-specific and needs parsing,
 * while this is a number we write ourselves into a file we already write.
 *
 * Null is cannot-tell and adopts. See `staleServer`.
 */
function scriptMtimeOf(scriptPath) {
  try {
    return fs.statSync(scriptPath).mtimeMs
  } catch {
    return null
  }
}

/**
 * This repo's serve token, minted once and then read.
 *
 * STORED, NOT DERIVED, and the asymmetry with the port is the point. The port
 * is `PORT_BASE + hash(realpath(repo)) % PORT_SPAN` because a port is not a
 * secret and a stable one keeps a handed-out link working. The token is the
 * only guard on a non-loopback bind, and a repo path is guessable by anyone on
 * the machine — so deriving it the same way would buy stability with the single
 * property it exists for. It keeps all 48 random bits; only its lifetime moved.
 *
 * WHAT WOULD FOOL THIS: a token file someone has emptied or truncated. A short
 * or non-hex value is treated as absent and replaced, because a malformed token
 * cannot guard anything — and the alternative, refusing to serve, would take
 * the page away over a file nobody reads.
 */
function repoToken(dir, config) {
  const file = path.resolve(dir, `${stateDirLabel(config)}/review-token`)
  try {
    const found = String(fs.readFileSync(file, 'utf8')).trim()
    if (/^[0-9a-f]{12}$/.test(found)) return found
  } catch {
    // Absent is the ordinary first-run state, not a problem.
  }
  const minted = mintToken()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, minted + '\n')
  } catch {
    // UNWRITEABLE IS NOT FATAL. The server can still serve on this token for
    // as long as it lives; what is lost is only the survival across a restart,
    // which is exactly where this started. Taking the page away instead would
    // be a worse answer to a read-only `.spec-env`.
  }
  return minted
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
 * The addresses worth OFFERING as alternatives — physical and unknown
 * interfaces, never virtual ones.
 *
 * The ranking already puts virtuals last, so the best guess was right; what was
 * wrong was listing them at all. A render offered `10.211.55.2` and
 * `10.37.129.2` — both Parallels adapters — as alternatives to a working link,
 * and no phone can route to either. An alternative that cannot work is worse
 * than no alternative: it reads as something to try when the first one fails.
 *
 * WHAT WOULD FOOL THIS: an interface named outside both patterns is `unknown`
 * and therefore KEPT, because a machine with unusual naming is more likely to
 * have a real address than a fake one — being wrong that way offers one dud,
 * where the opposite hides the only address that works.
 */
function offerableLanAddresses(nets = require('node:os').networkInterfaces()) {
  return rankLanAddresses(nets)
    .filter((e) => !VIRTUAL_IFACE.test(e.iface))
    .map((e) => e.address)
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
  // What the replaced server was running, and the URL it was answering on.
  // Both survive into the result so the caller can say what happened, and the
  // token survives into the NEW server so the operator's link keeps working.
  let engineWas = null
  let reuseToken = null
  if (running && !restart) {
    let settings = null
    try {
      settings = JSON.parse(fs.readFileSync(abs(settingsFile), 'utf-8'))
    } catch {}
    if (settings && settings.port) {
      if (serverScriptOk(settings)) {
        const now = engineVersionFor(proc.script)
        const verdict = staleServer(settings.engine, now, settings.scriptMtime, scriptMtimeOf(proc.script))
        if (verdict !== 'stale') {
          const lb = settings.host === '127.0.0.1' || settings.host === 'localhost'
          return {
            port: settings.port,
            // How the RUNNING server's port was chosen, as it recorded it. A
            // server from before this was written has no answer; `null` says so
            // rather than recomputing one, because a recomputed answer could
            // disagree with the port actually being served.
            portSource: settings.portSource || null,
            token: settings.token || null,
            loopback: lb,
            pid: running,
            started: false,
            // `current` needs no comment and `unknown` claims nothing — a server
            // from before the version was recorded is healthy, not suspect.
            engine: verdict,
            engineWas: settings.engine || null,
            engineIs: now,
          }
        }
        // STALE: alive, addressable, its script still on disk — and drawing
        // every page with an engine that has been replaced underneath it. This
        // is invisible to every other check here, because each render IS
        // current: the counts move, the timestamp moves, the diff is right.
        // Only the renderer is old. Replace it rather than serve yesterday's
        // output under today's timestamp.
        replaced = 'engine'
        engineWas = settings.engine || null
        // KEEP THE URL. The operator is usually holding the old link on a phone,
        // and a token minted here would kill it silently — the very thing the
        // adoption path exists to avoid. Reused only when the bind is unchanged;
        // a loopback restart has no token to carry and needs none.
        reuseToken = settings.token || null
      } else {
        // Alive, addressable, and executing code that has been deleted — the
        // worktree it was started from is gone. It answers on the port and fails
        // on every page, so adopting it is worse than replacing it.
        replaced = 'script'
      }
    } else {
      // Running, but its settings are unreadable — we cannot address it, and
      // killing a server we cannot describe is worse than declining to use it.
      return { error: 'unreadable', pid: running }
    }
  }

  // `--port` wins, then an explicit `review.servePort` number, then the
  // derivation. `source` is recorded in the settings file below so `--status`
  // can say WHY this port, rather than leaving the operator to read config.js.
  const resolved = resolveServePort(config, dir, port)
  const usePort = resolved.port
  const loopback = host === '127.0.0.1' || host === 'localhost'
  // The token is the ONLY guard on a non-loopback bind, so it is minted with the
  // bind rather than offered as an option to forget. It is read from the repo's
  // own store, so it OUTLIVES THIS PROCESS: the port beside it is a pure
  // function of the repo path and stable across a restart by design, and a URL
  // whose two halves disagree about that is a URL that dies for no reason the
  // reader can see. Six were handed out for one repo in a single session.
  //
  // `reuseToken` still wins where a server is being replaced on the same bind —
  // now redundant rather than wrong, and left alone as its own guarantee.
  //
  // EVERY BIND CARRIES IT, loopback included, and on loopback it guards nothing:
  // a server reachable only from this machine needs no credential. It is there
  // so the URL has ONE SHAPE. The bind comes from reader detection, and that
  // detection flipped `unknown` → `remote` inside a single session — so a
  // token-only-on-network rule meant the same repo's address gained and lost a
  // path segment underneath whoever was holding it.
  const token = reuseToken || repoToken(dir, config)

  if (running) await stopProcess(proc, { rootDir: dir })

  // ASK ABOUT BOTH ADDRESSES, because a loopback bind and a wildcard bind
  // COEXIST under BSD semantics and neither probe sees the other:
  //
  //   - probing 127.0.0.1 for a 0.0.0.0 bind succeeds while a wildcard squatter
  //     holds the port — the substitution that let a leaked daemon sit on 7777
  //     while every render claimed to have started a server
  //   - probing 0.0.0.0 alone succeeds while something holds 127.0.0.1, which
  //     would leave a server answering on the LAN and not on `localhost` — the
  //     `local:` URL this CLI prints would be dead
  //
  // A port either half-taken is not usable, so both are asked and either
  // refuses. Deduped, so a loopback bind asks once.
  //
  // ASKED ONE AT A TIME, and that is load-bearing rather than tidy. The probe
  // binds, so two probes of one port contend with each other — and the BSD
  // coexistence this comment relies on is exactly what Linux does NOT do, where
  // a wildcard and a loopback bind of one port are mutually exclusive. Asked
  // concurrently the pair therefore reported a free port as busy, and the review
  // server refused to start on every Linux machine while macOS stayed green.
  // `portsInUseOn` owns the ordering; see its comment for the verification.
  const busy = await portsInUseOn(usePort, [host, '127.0.0.1'])
  if (busy.length)
    return { error: 'busy', port: usePort, portSource: resolved.source, replaced, engineWas }

  fs.mkdirSync(path.dirname(abs(settingsFile)), { recursive: true })
  fs.writeFileSync(
    abs(settingsFile),
    // `script` is recorded so adoption has something to check. Without it the
    // only evidence a server is healthy is that its process exists. `engine` is
    // the second half of the same idea: the script can still be on disk and be a
    // DIFFERENT VERSION of itself, which is invisible to every other check here
    // — the process is alive, the file exists, and every page it renders is
    // drawn by code that was replaced underneath it.
    JSON.stringify(
      {
        dir,
        port: usePort,
        portSource: resolved.source,
        host,
        token,
        script: proc.script,
        engine: engineVersionFor(proc.script),
        // Recorded so the NEXT adoption can tell a rebuild from a restart. A
        // version alone cannot: the dist is rebuilt at the same version all day.
        scriptMtime: scriptMtimeOf(proc.script),
      },
      null,
      2,
    ) + '\n',
  )
  const res = startProcess(proc, { cwd: dir, rootDir: dir })
  const up = await waitListening([usePort], { host: loopback ? host : '127.0.0.1' })
  // A PORT ANSWERING IS NOT PROOF THAT OUR PROCESS IS ANSWERING IT. `waitListening`
  // connects, and anything already bound satisfies a connect — so on its own it
  // reports success for a daemon that died on EADDRINUSE seconds earlier. The
  // process we spawned still being alive is the specific evidence; the port
  // answering is merely consistent with it.
  if (!up || !isAlive(res.pid)) {
    // The stale context rides out on the failure too. A caller that only learns
    // "could not start" cannot say WHY it was trying, and "your server is running
    // an old engine and I could not replace it" is two facts the reader needs.
    return { error: up ? 'died' : 'silent', port: usePort, pid: res.pid, replaced, engineWas }
  }

  return {
    port: usePort,
    token,
    loopback,
    pid: res.pid,
    started: true,
    replaced,
    engineWas,
    engineIs: engineVersionFor(proc.script),
  }
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

  // ROTATION IS THE ONLY WAY TO CHANGE A TOKEN, and it says what it costs.
  // Every other path reads the stored one; a silent mint is the whole bug this
  // replaced, so the one place that mints deliberately announces it.
  if (flags.rotateToken) {
    const file = abs(`${sdir}/review-token`)
    const minted = mintToken()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, minted + '\n')
    process.stdout.write(
      'spec-env review serve: token rotated.\n' +
        '  EVERY LINK ALREADY HANDED OUT IS NOW DEAD — re-render and send the new one.\n' +
        (running
          ? `  the running server (pid ${running}) still answers on the old token; ` +
            '--stop it, then render again.\n'
          : ''),
    )
    return
  }

  if (flags.status) {
    if (!running) {
      process.stdout.write('spec-env review serve: not running.\n')
      return
    }
    let settings = {}
    try {
      settings = JSON.parse(fs.readFileSync(abs(settingsFile), 'utf-8'))
    } catch {}
    // Three states, and only one of them is worth a line. `current` is the
    // ordinary answer and needs no comment; `unknown` is a server from before
    // this was recorded, which is healthy and must not be accused of anything.
    const verdict = staleServer(settings.engine, engineVersionFor(proc.script))
    // The port AND how it was chosen, so "why is this on 7742?" is answered by
    // the tool. A server started before `portSource` was recorded has no answer
    // — the line then carries the port alone rather than a guess, because an
    // absence is not evidence of any particular source.
    const reason = servePortReason(settings.portSource)
    process.stdout.write(
      `spec-env review serve: running (pid ${running})\n` +
        (settings.port
          ? `  port:  ${settings.port}${reason ? ` (${reason})` : ''}\n`
          : '') +
        (settings.port ? `  local: ${serveUrl('127.0.0.1', settings)}\n` : '') +
        (settings.engine ? `  engine: ${settings.engine}\n` : '') +
        (verdict === 'stale'
          ? `  the engine moved under it — this one is ${engineVersionFor(proc.script)}\n`
          : ''),
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
    // NAME `servePort`, not only `--port`. `--port` moves this run aside and
    // leaves every link already handed out pointing at the busy port — which is
    // the bug this refusal used to send people straight into. Pinning
    // `review.servePort` is the durable fix: it is what the next link is built
    // from, so the move happens once and the links follow it.
    process.stdout.write(
      `spec-env review serve: port ${started.port} is already in use — ` +
        (started.portSource === 'derived'
          ? 'two repos derived the same port. '
          : '') +
        'pin a free one in specs/.core/env.config.json ("review": { "servePort": <n> }) ' +
        'so the links follow, or --stop if this is an older server.\n' +
        '  --port <n> moves this run only, and leaves existing links on the busy port.\n',
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
  // ALWAYS AVAILABLE WHEN SERVED. A server bound to 0.0.0.0 answers on loopback
  // too, so `local` is a real tier in both binds — it is not an alternative to
  // the network URL, it is the same page from the machine holding it.
  const loopbackUrl = page('127.0.0.1')
  if (up.loopback) {
    return {
      loopbackUrl,
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
  if (!addrs.length) return { loopbackUrl, url: null, alternates: [], loopback: false, widen: null }
  return {
    loopbackUrl,
    url: page(addrs[0]),
    alternates: addrs.slice(1).map(page),
    loopback: false,
    widen: null,
  }
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
// Is the project's configured compose file actually on disk?
//
// Read from the PRIMARY CHECKOUT rather than the worktree, and that is forced
// rather than chosen: a fresh provision plans before `git worktree add` runs, so
// the worktree does not exist yet to be looked in. A compose file is committed
// at the repo root in every layout this supports, so the two answers agree
// wherever both could be read.
//
// Any failure to look is `undefined` — cannot-tell, which callers route to the
// branch that does not escalate — never `false`.
function composeFilePresent(dir, config) {
  const file = config && config.docker && config.docker.composeFile
  if (!file) return undefined
  try {
    return fs.existsSync(path.join(dir, file))
  } catch {
    return undefined
  }
}

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
async function specEnvLive(dir, config, positional, flags) {
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
      specEnvLiveStatus(dir, config, specArg, flags)
      break
    case 'take':
      await specEnvLiveTake(dir, config, specArg, flags)
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
async function specEnvLiveTake(dir, config, specArg, flags = {}) {
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
    // A MACHINE-READABLE REFUSAL, so a caller reads the offer rather than
    // parsing the sentence. `take` had no `--json` at all, and a skill
    // scraping `blocked — …` prose for a command to run is exactly the kind of
    // second implementation that drifts out of step with the first.
    if (flags.json) {
      process.stdout.write(
        JSON.stringify(
          {
            spec: spec.folder,
            blocked: true,
            reason: plan.reason,
            // Absent stays absent — most refusals have no way out to declare.
            ...(plan.offer ? { offer: plan.offer } : {}),
          },
          null,
          2,
        ) + '\n',
      )
      return
    }
    // THE OFFER IS NAMED IN THE TEXT TOO, not only in `--json`. A reader in a
    // plain terminal is the one person a picker cannot reach, and they are
    // entitled to the same way out — so the refusal prints what it would have
    // offered rather than making a harness the only route to it.
    process.stdout.write(
      `spec-env live take: blocked — ${plan.reason}.\n` +
        (plan.offer ? `  ${plan.offer.label}: ${plan.offer.command}\n` : ''),
    )
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

function specEnvLiveStatus(dir, config, specArg, flags) {
  const { onBase, branch, baseBranch } = assertPrimaryOnMain(config, gitReader(dir))
  const json = Boolean(flags && flags.json)

  // Per-spec query (`live status <spec>`): a clear yes/no verdict /spec-start and
  // skill branches on to decide whether to skip worktree provisioning and work in
  // the primary checkout. The stable `live:      yes|no` line is the machine seam.
  if (specArg) {
    const spec = resolveSpecWithWorktree(dir, config, specArg)
    const live = !onBase && branch === spec.branch
    // `--json` answers with the SAME function the review render uses, so a page
    // and this command can never disagree about whether a spec is live. The
    // text form above is left exactly as it was: `/spec-start` reads its
    // `live:      yes|no` line, and a flag must not move a seam.
    if (json) {
      process.stdout.write(
        JSON.stringify(
          {
            spec: spec.folder,
            branch: spec.branch,
            primary: branch || null,
            base: baseBranch,
            live: liveStateFor(spec, liveContext(dir, config, spec, { onBase, primaryBranch: branch })),
          },
          null,
          2,
        ) + '\n',
      )
      return
    }
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

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          primary: branch || null,
          base: baseBranch,
          onBase,
          // The three-state answer the text's `in-flight:` line carries, kept
          // as three states here too: a branch switched by hand leaves no
          // receipt, so the spec is `null` while the checkout is plainly busy.
          inFlight: onBase ? null : receipt && receipt.spec ? String(receipt.spec) : null,
          receipt: receipt || null,
        },
        null,
        2,
      ) + '\n',
    )
    return
  }

  process.stdout.write(
    'spec-env live:\n' +
      `  primary:   ${branch || '(detached)'}  (${state})\n` +
      `  in-flight: ${inFlight}\n` +
      `  receipt:   ${summarizeReceipt(receipt)}\n`,
  )
}

/**
 * The `ctx` `liveStateFor` wants, probed from this repo.
 *
 * ONE BUILDER, so every caller passes the same shaped answer — the review
 * render and `live status --json` both come through here, which is what makes
 * "the page and the command agree" a property of the code rather than a habit.
 *
 * `onBase`/`primaryBranch` are the caller's, because it has usually already
 * asked `assertPrimaryOnMain` and asking twice can straddle a branch switch.
 *
 * An unreadable receipt is caught and dropped: it costs the holder's NAME and
 * never the state, which the branch answers (`liveStateFor`).
 */
function liveContext(dir, config, spec, { onBase, primaryBranch }) {
  let receipt = null
  try {
    receipt = readReceipt(dir, config)
  } catch {
    receipt = null
  }
  const front = (config.dev || []).map((d) => d.frontPort).filter((p) => typeof p === 'number')[0]
  return {
    isolated: true,
    onBase,
    primaryBranch,
    receipt,
    worktreeExists: Boolean(spec && spec.worktreePath && fs.existsSync(spec.worktreePath)),
    // Null where the project configured no canonical port — there is no URL to
    // name, and inventing one would send the reader to a closed port.
    url: front ? `http://${(config.proxy && config.proxy.host) || 'localhost'}:${front}` : null,
  }
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
    runReviewers: false,
    notes: null,
    resolve: null,
    outcome: null,
    claim: null,
    offered: false,
    drop: null,
    buttons: null,
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
    else if (args[i] === '--rotate-token') flags.rotateToken = true
    else if (args[i] === '--off') flags.off = true
    else if (args[i] === '--status') flags.status = true
    else if (args[i] === '--port') flags.port = args[++i]
    else if (args[i] === '--host') flags.host = args[++i]
    else if (args[i] === '--publish-copy') flags.publishCopy = true
    else if (args[i] === '--buttons') flags.buttons = args[++i]
    else if (args[i] === '--out') flags.out = args[++i]
    else if (args[i] === '--review') flags.review = args[++i]
    else if (args[i] === '--run-reviewers') flags.runReviewers = true
    else if (args[i] === '--notes') flags.notes = args[++i]
    else if (args[i] === '--verdict') flags.verdict = args[++i]
    // `--set` keeps an EMPTY STRING rather than coercing it away: empty is the
    // bare `/spec-remote-review`, and it means toggle. `??` so a missing value
    // at the end of argv is still the empty form rather than `undefined`, which
    // would read as the flag never having been passed.
    else if (args[i] === '--set') flags.set = args[++i] ?? ''
    else if (args[i] === '--resolve') flags.resolve = args[++i]
    else if (args[i] === '--outcome') flags.outcome = args[++i]
    else if (args[i] === '--claim') flags.claim = args[++i]
    else if (args[i] === '--claim-since') flags.claimSince = args[++i]
    else if (args[i] === '--since') flags.since = args[++i]
    else if (args[i] === '--timeout') flags.timeout = args[++i]
    else if (args[i] === '--drop') flags.drop = args[++i]
    else if (args[i] === '--json') flags.json = true
    else if (args[i] === '--check') flags.check = true
    else if (args[i] === '--for-command') flags.forCommand = args[++i]
    else if (args[i] === '--offered') flags.offered = true
    else if (args[i] === '--phase') flags.phase = args[++i]
    else if (args[i] === '--record-primary') flags.recordPrimary = true
    else if (args[i] === '--docs') flags.docs = true
    else if (args[i] === '--session') flags.session = args[++i]
    else if (args[i] === '--assert-primary-clean') flags.assertPrimaryClean = true
    else positional.push(args[i])
  }
  dir = path.resolve(dir)
  // Where the caller actually is, kept before the re-anchor below. `stage` and
  // `review --docs` want it: every other subcommand asks about the repo, while
  // those two ask about the tree in front of you, and the two differ inside a
  // worktree.
  const invokedFrom = dir
  // Anchor on the primary checkout so every subcommand resolves {repo}, worktree
  // paths, and the registry identically whether run from main or a worktree.
  dir = resolvePrimaryCheckout(dir, gitReader(dir))

  const { config, present, unknown, badReviewers } = loadEnvConfig(dir)
  if (!present) {
    process.stdout.write(
      'spec-env: isolation not enabled (no specs/.core/env.config.json).\n' +
        'Opt in by copying specs/.core/env.config.json.example → env.config.json.\n',
    )
    return
  }

  // A key the loader does not read is dropped — it always was, and still is.
  // What changed is that it is no longer dropped in SILENCE: a mis-typed
  // `review.required` leaves the gate on and a mis-typed
  // `teardown.deleteRemoteBranch` reverts to prompt, and the only signal either
  // gave was that nothing happened.
  //
  // Every spec-env subcommand passes through here, which is why it sits at this
  // one point rather than in a reporting verb someone might never run. It is
  // ADVISORY: it writes lines and changes no exit status, because a forward-compat
  // key and a typo are indistinguishable from here and only one of them is a
  // mistake (.claude/rules/negative-checks.md rule 4).
  //
  // STDERR, deliberately: `--json` subcommands write their payload to stdout, and
  // an advisory line on stdout would make it unparseable.
  for (const key of unknown || []) {
    process.stderr.write(`spec-env: ${ENV_CONFIG_LABEL} — unknown key "${key}" is ignored.\n`)
  }

  // The same advisory, for the one place the check above structurally cannot
  // reach: `review.reviewers` is an array, and `collectUnknownKeys` deliberately
  // does not walk into one. Dropping an entry silently is worse than dropping a
  // key silently — the page then shows no line for that reviewer at all, which
  // reads as "not configured" rather than "configured wrong".
  for (const bad of badReviewers || []) {
    process.stderr.write(
      `spec-env: ${ENV_CONFIG_LABEL} — review.reviewers[${bad.index}] ${bad.reason}; it is ignored.\n`,
    )
  }

  // A `use` NAMING AN ADAPTER THIS BUILD DOES NOT HAVE, said here rather than
  // waiting for the run to report it. The config module deliberately does not
  // know the registry — shape is its business and the adapter list is the
  // runner's — so the check lives at the one place that can see both.
  //
  // It is advisory like the two above: an older engine reading a config written
  // for a newer one is a forward-compat gap, not a mistake, and the run reports
  // it again as that reviewer's own outcome either way.
  for (const r of config.review.reviewers || []) {
    if (r.use && !Object.prototype.hasOwnProperty.call(BUNDLED_ADAPTERS, r.use)) {
      process.stderr.write(
        `spec-env: ${ENV_CONFIG_LABEL} — review.reviewers "${r.use}" is not a bundled adapter ` +
          `(have: ${Object.keys(BUNDLED_ADAPTERS).join(', ') || 'none'}); it will not run.\n`,
      )
    }
  }

  switch (sub) {
    case 'up':
      specEnvUp(dir, config, positional[0], flags)
      break
    case 'nospec':
      specEnvNospec(dir, config, positional[0], flags)
      break
    case 'main':
      specEnvMain(dir, config, positional, flags, present, invokedFrom)
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
      // The gate verbs sit here for the same reason `serve` does: they answer
      // about the page this command renders, keyed to the same path, and a
      // sibling verb would have to re-derive every bit of that.
      if (positional[0] === 'arm') {
        specEnvReviewArm(dir, config, positional[1], flags)
        break
      }
      if (positional[0] === 'waiting') {
        specEnvReviewWaiting(dir, config, flags)
        break
      }
      if (positional[0] === 'wait') {
        await specEnvReviewWait(dir, config, positional[1], flags)
        break
      }
      if (positional[0] === 'gate') {
        specEnvReviewGate(dir, config, positional[1], flags, invokedFrom)
        break
      }
      if (positional[0] === 'allow') {
        specEnvReviewAllow(dir, config, positional[1], flags)
        break
      }
      if (positional[0] === 'skip') {
        // The one positional is the REASON, not a spec: the two are
        // indistinguishable as free text, and the spec is the one thing this
        // engine can already resolve from where you are standing.
        specEnvReviewSkip(dir, config, positional[1], flags)
        break
      }
      await specEnvReview(dir, config, positional[0], flags, invokedFrom)
      break
    case 'live':
      await specEnvLive(dir, config, positional, flags)
      break
    default:
      process.stdout.write(
        `Usage: skitterspec spec-env <${SPEC_ENV_VERBS.join('|')}> [spec] [--keep-volumes] [--force] [--also <tag>] [--older-than <days>] [--branch] [--out <file>] [--review <json>] [--run-reviewers] [--notes <json>] [--verdict <word>] [--resolve <json>] [--outcome <text>] [--claim <code>] [--drop <code>] [--buttons <set>] [--json] [--record-primary] [--assert-primary-clean]\n` +
        '  review serve [--port <n>] [--host <addr>] [--stop] [--status]  serve every diff locally\n' +
        '  review serve --rotate-token    mint a new URL token; every handed-out link dies\n' +
        '  review allow <network|remote> [--off]  permit a review tier (writes env.config.json)\n' +
          '  review arm [spec] [--phase <n>]        a phase ended — its diff now owes a verdict\n' +
          '  review gate [spec] [--check] [--json]  is one owed? --check exits non-zero if so\n' +
          '       [--for-command <cmdline>]         ...but only when that command is a git commit\n' +
          '  review skip "<reason>"                 move on without one, on the record\n' +
          '  review gate [spec] --offered           record that the bypass was offered (spends it)\n' +
          '  review wait [spec] --since <iso>       block until a verdict arrives ([--timeout <s>])\n' +
          '  review waiting [--json]                every pass waiting, across every spec\n' +
          '  review [spec] --claim-since <iso>      claim the one pass that arrived since <iso>\n' +
          '  review [spec] --verdict <word>         send just a verdict, with nothing marked\n' +
          '  review [spec] --buttons midrun         the page offers Continue, not a commit\n' +
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
  SPEC_ENV_VERBS,
  run,
  parse,
  HELP,
  unknownCommand,
  rankLanAddresses,
  offerableLanAddresses,
  reviewTierStack,
  serveProcFor,
  serverScriptOk,
  daemonScript,
  reviewServedUrls,
  restartHost,
}
