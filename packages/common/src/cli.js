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
const { planUp } = require('./env/provision.js')
const { planDown } = require('./env/teardown.js')
const { planPrune, liveSlugsForSpecs, reconcileRegistry } = require('./env/prune.js')
const { planIntegrate } = require('./env/integrate.js')
const { planHotfixLand } = require('./env/hotfix.js')
const { planDev } = require('./env/dev.js')
const { startProcess, stopProcess, waitHealthy } = require('./env/supervise.js')
const { renderRoutes, portsInUse, waitListening } = require('./env/proxy.js')

const pkg = require('../package.json')

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
                                up <spec>         plan a worktree + Docker stack + opener
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

// Print provisioned specs, their slots, and port blocks from the registry.
function specEnvStatus(dir, config) {
  const registry = readRegistry(dir, config)
  const names = Object.keys(registry.slots)
  if (!names.length) {
    process.stdout.write('spec-env: no provisioned specs.\n')
    return
  }
  process.stdout.write('Provisioned specs:\n')
  names
    .sort((a, b) => registry.slots[a] - registry.slots[b])
    .forEach((name) => {
      const slot = registry.slots[name]
      const off = portOffset(slot, config)
      const hi = off + config.docker.portsPerSpec - 1
      process.stdout.write(`  ${name}  slot ${slot}  ports ${off}-${hi}\n`)
    })
}

// Provision: allocate the slot, persist the registry, and print the plan the
// /spec-env skill executes (git worktree add, docker compose up, .env, opener).
function specEnvUp(dir, config, specArg) {
  if (!specArg) {
    process.stdout.write('Usage: skitterspec spec-env up <spec>\n')
    return
  }
  const spec = resolveSpec(specArg, dir, config)

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
  // every provision for teammates who only cloned and ran /spec-go.
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

  const plan = planUp(spec, { slot, attached }, config)

  const out = []
  out.push(`spec-env up: ${spec.folder} ${attached ? '(attached — existing)' : '(provisioned)'}`)
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
  out.push('  run these:')
  for (const cmd of plan.commands) out.push(`    ${cmd}`)
  if (plan.openCommand) out.push(`    ${plan.openCommand}`)
  // Seed files first (setup may depend on them), then the setup commands —
  // both run in the worktree, under one heading.
  const worktreeSteps = [...plan.seedCommands, ...plan.setupCommands]
  if (worktreeSteps.length) {
    out.push('')
    out.push('  in the worktree, run:')
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
    return { dirty: false, unpushed: false, merged: true, reachableFromTag: false }
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

  return { dirty, unpushed, merged, reachableFromTag }
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
// would just re-prompt on the next /spec-go (see spec: isolation-trusts-worktree-dir).
function specEnvDown(dir, config, specArg, flags) {
  if (!specArg) {
    process.stdout.write('Usage: skitterspec spec-env down <spec> [--keep-volumes] [--force]\n')
    return
  }
  const spec = resolveSpec(specArg, dir, config)

  // A worktree-only spec never held a slot but its worktree still needs removing,
  // so "nothing to do" means neither a slot nor a worktree exists.
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
  process.stdout.write(out.join('\n') + '\n')
}

// Integrate: land a spec's worktree branch onto the base branch (rebase + ff).
// Queries git for the facts, prints the plan / block / no-op. The /spec-complete
// skill executes the printed commands (and aborts a conflicting rebase).
function specEnvIntegrate(dir, config, specArg) {
  if (!specArg) {
    process.stdout.write('Usage: skitterspec spec-env integrate <spec>\n')
    return
  }

  // `dir` is already anchored on the primary checkout by the dispatch, so it is
  // both where the spec resolves and the target of the fast-forward — /spec-complete
  // can run this from inside the worktree and still land on main. A spec authored
  // entirely on its branch may not exist in the primary checkout's specs/** —
  // resolveSpecWithWorktree offers its worktree as a fallback search location.
  const spec = resolveSpecWithWorktree(dir, config, specArg)
  const base = resolveBaseBranch(config, gitReader(dir))

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
      // non-live-aware /spec-go) would be abandoned by the re-isolate `switch` below.
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
  if (action !== 'land' || !specArg) {
    process.stdout.write('Usage: skitterspec spec-env hotfix land <spec> [--also <tag>]...\n')
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
  if (!specArg) {
    process.stdout.write('Usage: skitterspec spec-env resolve <spec>\n')
    return
  }
  const r = resolveSpec(specArg, dir, config)
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
  if ((action !== 'up' && action !== 'down') || !specArg) {
    process.stdout.write('Usage: skitterspec spec-env dev <up|down> <spec>\n')
    return
  }
  const spec = resolveSpec(specArg, dir, config)
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

  const spec = resolveSpec(target, dir, config)
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
  const action = positional[0] || 'status'
  switch (action) {
    case 'status':
      specEnvLiveStatus(dir, config)
      break
    case 'take':
      await specEnvLiveTake(dir, config, positional[1])
      break
    case 'release':
      await specEnvLiveRelease(dir, config, positional[1])
      break
    case 'abort':
      await specEnvLiveAbort(dir, config)
      break
    default:
      process.stdout.write('Usage: skitterspec spec-env live <take|release|abort|status> [spec]\n')
  }
}

// Resolve a spec, offering its worktree as a fallback search dir — a spec authored
// on its own branch may not exist in the primary checkout's specs/**.
function resolveSpecWithWorktree(dir, config, specArg) {
  const { slug } = splitPrefix(path.basename(specArg))
  const { repo, repoSlug } = repoInfo(dir)
  const wtTokens = { repo, repoSlug, slug }
  const worktreeGuess = path.resolve(
    dir,
    expandTokens(config.worktree.root, wtTokens),
    expandTokens(config.worktree.folderPattern, wtTokens),
  )
  return resolveSpec(specArg, dir, config, { searchDirs: [worktreeGuess] })
}

// Take the running instance: rebase the spec's branch onto base, free it from its
// worktree, and check it out in the primary checkout so the dev server reloads it.
async function specEnvLiveTake(dir, config, specArg) {
  if (!specArg) {
    process.stdout.write('Usage: skitterspec spec-env live take <spec>\n')
    return
  }

  const spec = resolveSpecWithWorktree(dir, config, specArg)

  // Probe the primary checkout's git state (IO stays here; the planner is pure).
  const primaryGit = gitReader(dir)
  const primary = assertPrimaryOnMain(config, primaryGit)
  const base = resolveBaseBranch(config, primaryGit)
  const status = primaryGit(['status', '--porcelain'])
  const clean = status !== null && status.length === 0
  const worktreeExists = fs.existsSync(spec.worktreePath)
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
    clean,
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
    runGit(spec.worktreePath, ['rebase', '--abort'])
    process.stdout.write(
      `spec-env live take: rebase of ${spec.branch} onto ${base} hit conflicts — ` +
        `resolve them in ${spec.worktreePath}, then retry.\n`,
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

function specEnvLiveStatus(dir, config) {
  const { onBase, branch, baseBranch } = assertPrimaryOnMain(config, gitReader(dir))
  const receipt = readReceipt(dir, config)
  const state = onBase
    ? 'on base — free'
    : `feature in control — not on ${baseBranch}`
  process.stdout.write(
    'spec-env live:\n' +
      `  primary:   ${branch || '(detached)'}  (${state})\n` +
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
        'Usage: skitterspec spec-env <up|down|prune|dev|connect|integrate|hotfix|live|status|resolve> [spec] [--keep-volumes] [--force] [--also <tag>] [--older-than <days>]\n',
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
          resync(dir, { claudeMd: opts.claudeMd, force: opts.force })
          break
        }
        // action === 'create-missing' → fall through to a normal (skip-existing) init.
      }

      // Fresh repo (or create-missing): isolation defaults OFF; a flag or an
      // interactive "yes" opts in. Only prompt for isolation on a fresh repo.
      let isolation = opts.isolation === true
      if (interactive && !isExistingSetup(dir)) {
        const { promptSetup } = require('./prompts.js')
        isolation = (await promptSetup({ isolationSeed: isolation })).isolation
      }
      await init({ dir, force: opts.force, claudeMd: opts.claudeMd, mode: 'init', isolation })
      break
    }
    case 'update':
      // `update` is a resync — refresh managed files, keep customized ones
      // (--force to overwrite). Leaves specs/ and live .core config alone.
      resync(dir, { claudeMd: opts.claudeMd, force: opts.force })
      await cleanupReleaseTooling(dir, opts)
      break
    default:
      throw new Error(`unknown command: ${cmd} (try --help)`)
  }
}

module.exports = { run, parse }
