'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { init } = require('./init.js')
const { loadConfig } = require('./config.js')
const { loadEnvConfig } = require('./env/config.js')
const {
  readRegistry,
  writeRegistry,
  allocateSlot,
  freeSlot,
  portOffset,
} = require('./env/registry.js')
const { resolveSpec } = require('./env/resolve.js')
const { planUp } = require('./env/provision.js')
const { planDown } = require('./env/teardown.js')

const pkg = require('../package.json')

const HELP = `skitterspec — spec-driven-development for Claude Code

Usage:
  skitterspec init [dir]      Install skills, rule, specs/ folders, and (optionally)
                              changelog/release-note tooling into a project
  skitterspec update [dir]    Re-copy skills + rule + scripts (overwrites), leaves
                              specs/ and skitterspec.config.json alone
  skitterspec spec-env <cmd>  Per-spec isolation engine (opt-in; needs
                              specs/.core/env.config.json). Subcommands:
                                up <spec>         plan a worktree + Docker stack + opener
                                down <spec>       tear down (guards; --keep-volumes, --force)
                                status            list provisioned specs + port blocks
                                resolve <spec>    print resolved slug/type/branch/paths
  skitterspec --help          Show this help
  skitterspec --version       Print version

Options (init / update):
  --force                  Overwrite skill/rule/script files that already exist
  --dir <path>             Target project dir (default: positional arg or cwd)
  --no-claude-md           Skip creating/patching CLAUDE.md
  --yes, -y                Accept defaults; skip the interactive setup prompts

Release-tooling options (init) — drive setup non-interactively:
  --changelog / --no-changelog        Enable/disable CHANGELOG generation
  --releases  / --no-releases         Enable/disable user-facing release notes
  --changelog-file=NAME               Changelog filename (default CHANGELOG.md)
  --releases-file=NAME                Release-notes filename (default RELEASES.md)
  --product-name=NAME                 Product name shown in the release-notes header
  --version-hook / --no-version-hook  Wire (or skip) the npm "version" hook
  --isolation / --no-isolation        Enable/skip per-spec isolation (a git
                                      worktree per spec; writes env.config.json)

Examples:
  npx @skitterbyte/skitterspec init
  npx @skitterbyte/skitterspec init ./my-app --yes
  npx @skitterbyte/skitterspec init --no-releases --changelog-file=HISTORY.md
  npx @skitterbyte/skitterspec update --force
`

function parse(argv) {
  const opts = {
    force: false,
    claudeMd: true,
    dir: null,
    yes: false,
    changelog: undefined,
    releases: undefined,
    changelogFile: undefined,
    releasesFile: undefined,
    productName: undefined,
    versionHook: undefined,
    isolation: undefined,
  }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') opts.force = true
    else if (a === '--no-claude-md') opts.claudeMd = false
    else if (a === '--yes' || a === '-y') opts.yes = true
    else if (a === '--isolation') opts.isolation = true
    else if (a === '--no-isolation') opts.isolation = false
    else if (a === '--changelog') opts.changelog = true
    else if (a === '--no-changelog') opts.changelog = false
    else if (a === '--releases') opts.releases = true
    else if (a === '--no-releases') opts.releases = false
    else if (a === '--version-hook') opts.versionHook = true
    else if (a === '--no-version-hook') opts.versionHook = false
    else if (a.startsWith('--changelog-file=')) opts.changelogFile = a.slice('--changelog-file='.length)
    else if (a.startsWith('--releases-file=')) opts.releasesFile = a.slice('--releases-file='.length)
    else if (a.startsWith('--product-name=')) opts.productName = a.slice('--product-name='.length)
    else if (a === '--dir') opts.dir = argv[++i]
    else if (a.startsWith('--')) throw new Error(`unknown option: ${a}`)
    else positional.push(a)
  }
  return { opts, positional }
}

// Resolve the release config: flags win, else the existing/default config.
// `existing` is a loaded skitterspec.config.json (loadConfig merges defaults).
function resolveRelease(existing, opts) {
  const pick = (flag, fallback) => (flag === undefined ? fallback : flag)
  return {
    changelog: {
      enabled: pick(opts.changelog, existing.changelog.enabled),
      file: opts.changelogFile || existing.changelog.file,
    },
    releases: {
      enabled: pick(opts.releases, existing.releases.enabled),
      file: opts.releasesFile || existing.releases.file,
      productName: opts.productName || existing.releases.productName,
      scopeAreas: existing.releases.scopeAreas,
    },
    versionHook: pick(opts.versionHook, existing.versionHook),
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

// Query a worktree's git state (side-effecting — kept in the CLI, not the pure
// planner). A missing worktree → nothing to lose (dirty:false, unpushed:false).
function worktreeGitState(worktreePath) {
  if (!fs.existsSync(worktreePath)) return { dirty: false, unpushed: false }
  const git = (argv) =>
    execFileSync('git', ['-C', worktreePath, ...argv], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()

  let dirty = false
  try {
    dirty = git(['status', '--porcelain']).length > 0
  } catch {
    dirty = false
  }

  let unpushed = false
  try {
    // commits on HEAD's upstream branch not yet pushed
    unpushed = Number(git(['rev-list', '--count', '@{u}..HEAD'])) > 0
  } catch {
    // no upstream configured → any commit on HEAD not on a remote counts
    try {
      unpushed = git(['log', '--oneline', 'HEAD', '--not', '--remotes']).length > 0
    } catch {
      unpushed = false
    }
  }
  return { dirty, unpushed }
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
// when the spec was never provisioned / already torn down.
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

  const worktreeState = worktreeGitState(spec.worktreePath)
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

// Dispatch `skitterspec spec-env <sub> [args] [--dir path]`. No-ops with a clear
// message when the feature isn't enabled (no specs/.core/env.config.json).
function specEnv(rest) {
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
    case 'status':
      specEnvStatus(dir, config)
      break
    case 'resolve':
      specEnvResolve(dir, config, positional[0])
      break
    default:
      process.stdout.write(
        'Usage: skitterspec spec-env <up|down|status|resolve> [spec] [--keep-volumes] [--force]\n',
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
    specEnv(rest)
    return
  }

  const { opts, positional } = parse(rest)
  const dir = path.resolve(opts.dir || positional[0] || process.cwd())

  switch (cmd) {
    case 'init': {
      const existing = loadConfig(dir)
      let release = resolveRelease(existing, opts)
      // Isolation defaults OFF; a flag or an interactive "yes" opts in.
      let isolation = opts.isolation === true

      const interactive = Boolean(process.stdin.isTTY) && !opts.yes
      if (interactive) {
        const { promptSetup } = require('./prompts.js')
        const pkgExists = fs.existsSync(path.join(dir, 'package.json'))
        const result = await promptSetup({ seed: release, pkgExists, isolationSeed: isolation })
        release = result.release
        isolation = result.isolation
      }

      await init({ dir, force: opts.force, claudeMd: opts.claudeMd, mode: 'init', release, isolation })
      break
    }
    case 'update':
      await init({ dir, force: true, claudeMd: opts.claudeMd, mode: 'update' })
      break
    default:
      throw new Error(`unknown command: ${cmd} (try --help)`)
  }
}

module.exports = { run, parse, resolveRelease }
