'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { init } = require('./init.js')
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
const { resolveSpec, resolveBaseBranch, repoInfo, expandTokens, splitPrefix } = require('./env/resolve.js')
const { ensureWorktreeDirTrusted } = require('./env/trust.js')
const { planUp } = require('./env/provision.js')
const { planDown } = require('./env/teardown.js')
const { planIntegrate } = require('./env/integrate.js')
const { planDev } = require('./env/dev.js')
const { startProcess, stopProcess, waitHealthy } = require('./env/supervise.js')
const { renderRoutes, portsInUse, waitListening } = require('./env/proxy.js')

const pkg = require('../package.json')

const HELP = `skitterspec — spec-driven-development for Claude Code

Usage:
  skitterspec init [dir]      Install the spec lifecycle skills, rule, and specs/
                              folders into a project
  skitterspec update [dir]    Re-copy skills + rule (overwrites), leaves specs/
                              and specs/.core/ config alone
  skitterspec spec-env <cmd>  Per-spec isolation engine (opt-in; needs
                              specs/.core/env.config.json). Subcommands:
                                up <spec>         plan a worktree + Docker stack + opener
                                down <spec>       tear down (guards; --keep-volumes, --force)
                                dev up <spec>     start host dev servers on the spec's ports
                                dev down <spec>   stop the spec's host dev servers
                                connect <spec>    expose a spec on the canonical ports (main = off)
                                integrate <spec>  plan rebase + fast-forward onto the base branch
                                status            list provisioned specs + port blocks
                                resolve <spec>    print resolved slug/type/branch/paths
  skitterspec --help          Show this help
  skitterspec --version       Print version

Options (init / update):
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
  if (!fs.existsSync(worktreePath)) return { dirty: false, unpushed: false, merged: true }
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

  return { dirty, unpushed, merged }
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

// Integrate: land a spec's worktree branch onto the base branch (rebase + ff).
// Queries git for the facts, prints the plan / block / no-op. The /spec-complete
// skill executes the printed commands (and aborts a conflicting rebase).
function specEnvIntegrate(dir, config, specArg) {
  if (!specArg) {
    process.stdout.write('Usage: skitterspec spec-env integrate <spec>\n')
    return
  }

  // /spec-complete runs this from inside the worktree, but the spec's coordinates
  // (worktreePath via {repo}, the base branch) must resolve against the PRIMARY
  // checkout. Resolve it first (parent of the shared git dir) and anchor
  // everything to it, so integrate works whether invoked from main or a worktree.
  const commonDir = gitReader(dir)(['rev-parse', '--git-common-dir'])
  const mainRepoPath = commonDir ? path.dirname(path.resolve(dir, commonDir)) : dir

  // A spec authored entirely on its branch may not exist in the primary
  // checkout's specs/** (it was never committed to base) — but its worktree
  // does, and the worktree path is derivable from config without the folder.
  // Offer it as a fallback search location so integrate can still find the spec.
  const { slug } = splitPrefix(path.basename(specArg))
  const { repo, repoSlug } = repoInfo(mainRepoPath)
  const wtTokens = { repo, repoSlug, slug }
  const worktreeGuess = path.resolve(
    mainRepoPath,
    expandTokens(config.worktree.root, wtTokens),
    expandTokens(config.worktree.folderPattern, wtTokens),
  )
  const spec = resolveSpec(specArg, mainRepoPath, config, { searchDirs: [worktreeGuess] })

  if (!fs.existsSync(spec.worktreePath)) {
    process.stdout.write(
      `spec-env integrate: ${spec.folder} has no worktree — nothing to integrate.\n`,
    )
    return
  }

  const base = resolveBaseBranch(config, gitReader(mainRepoPath))
  const wtGit = gitReader(spec.worktreePath)
  const status = wtGit(['status', '--porcelain'])
  const dirty = status !== null && status.length > 0
  const ahead = wtGit(['rev-list', '--count', `${base}..HEAD`])
  const aheadOfBase = ahead !== null && Number(ahead) > 0

  const plan = planIntegrate(spec, config, { worktreeState: { dirty }, base, aheadOfBase, mainRepoPath })

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
async function specEnv(rest) {
  const [sub, ...args] = rest
  let dir = process.cwd()
  const positional = []
  const flags = { keepVolumes: false, force: false }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = path.resolve(args[++i])
    else if (args[i] === '--keep-volumes') flags.keepVolumes = true
    else if (args[i] === '--force') flags.force = true
    else positional.push(args[i])
  }
  dir = path.resolve(dir)

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
    case 'dev':
      await specEnvDev(dir, config, positional)
      break
    case 'connect':
      await specEnvConnect(dir, config, positional[0])
      break
    case 'integrate':
      specEnvIntegrate(dir, config, positional[0])
      break
    case 'status':
      specEnvStatus(dir, config)
      break
    case 'resolve':
      specEnvResolve(dir, config, positional[0])
      break
    default:
      process.stdout.write(
        'Usage: skitterspec spec-env <up|down|dev|connect|integrate|status|resolve> [spec] [--keep-volumes] [--force]\n',
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
      // Isolation defaults OFF; a flag or an interactive "yes" opts in.
      let isolation = opts.isolation === true

      const interactive = Boolean(process.stdin.isTTY) && !opts.yes
      if (interactive) {
        const { promptSetup } = require('./prompts.js')
        const result = await promptSetup({ isolationSeed: isolation })
        isolation = result.isolation
      }

      await init({ dir, force: opts.force, claudeMd: opts.claudeMd, mode: 'init', isolation })
      break
    }
    case 'update':
      await init({ dir, force: true, claudeMd: opts.claudeMd, mode: 'update' })
      await cleanupReleaseTooling(dir, opts)
      break
    default:
      throw new Error(`unknown command: ${cmd} (try --help)`)
  }
}

module.exports = { run, parse }
