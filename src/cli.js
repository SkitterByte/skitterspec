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
const { resolveSpec, resolveBaseBranch } = require('./env/resolve.js')
const { ensureWorktreeDirTrusted } = require('./env/trust.js')
const { planUp } = require('./env/provision.js')
const { planDown } = require('./env/teardown.js')
const { planIntegrate } = require('./env/integrate.js')
const { findSpecFolder } = require('./env/resolve.js')
const { loadLinearConfig } = require('./sync/config.js')
const { normalizeLocal, normalizeRemote, readSnapshot } = require('./sync/normalize.js')
const { classify } = require('./sync/compare.js')
const { readBase } = require('./sync/base.js')
const { pull } = require('./sync/pull.js')
const { push } = require('./sync/push.js')

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
                                integrate <spec>  plan rebase + fast-forward onto the base branch
                                status            list provisioned specs + port blocks
                                resolve <spec>    print resolved slug/type/branch/paths
  skitterspec spec-sync <cmd> Linear hybrid-sync engine (opt-in; needs
                              specs/.core/linear.config.json). Subcommands:
                                normalize <spec>  print the normalized field set (JSON)
                                status <spec>     per-field divergence vs base (read-only)
                                pull <spec>       Linear->local (--force, --remote file)
                                push <spec>       local->Linear (--force, --remote file)
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

  const spec = resolveSpec(specArg, mainRepoPath, config)

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
        'Usage: skitterspec spec-env <up|down|integrate|status|resolve> [spec] [--keep-volumes] [--force]\n',
      )
  }
}

// --- spec-sync: Linear hybrid-sync engine seam (Phase 1: normalize + status) -

// Resolve a spec argument to its snapshot dir. Accepts a spec name/folder found
// under specs/** (preferred) or a literal path to a snapshot directory.
function resolveSnapshotDir(specArg, dir) {
  const found = findSpecFolder(specArg, dir)
  if (found) return found.path
  const literal = path.resolve(dir, specArg)
  if (fs.existsSync(literal) && fs.statSync(literal).isDirectory()) return literal
  return null
}

// The identifier keying the base sidecar: the spec's linear_identifier if set,
// else its folder name (so the engine is usable before a spec is linked).
function specIdentifier(snapshotDir, config) {
  try {
    const { frontmatter } = readSnapshot(snapshotDir, config)
    if (frontmatter.linear_identifier) return String(frontmatter.linear_identifier)
  } catch {
    /* fall through to folder name */
  }
  return path.basename(snapshotDir)
}

// `spec-sync normalize <spec>` — print the normalized local field set as JSON.
function specSyncNormalize(dir, config, specArg) {
  if (!specArg) {
    process.stdout.write('Usage: skitterspec spec-sync normalize <spec>\n')
    return
  }
  const snapshotDir = resolveSnapshotDir(specArg, dir)
  if (!snapshotDir) {
    process.stdout.write(`spec-sync: spec not found: ${specArg}\n`)
    return
  }
  const local = normalizeLocal(snapshotDir, config)
  process.stdout.write(JSON.stringify(local, null, 2) + '\n')
}

// `spec-sync status <spec> [--remote file]` — read-only per-field divergence
// (git status analog). With `--remote` (a Linear Project projection, supplied by
// the /spec-status skill via MCP) it reports true three-way divergence; without
// it, it compares local vs the committed base only (what changed locally since
// the last sync).
function specSyncStatus(dir, config, specArg, flags = {}) {
  if (!specArg) {
    process.stdout.write('Usage: skitterspec spec-sync status <spec> [--remote file]\n')
    return
  }
  const snapshotDir = resolveSnapshotDir(specArg, dir)
  if (!snapshotDir) {
    process.stdout.write(`spec-sync: spec not found: ${specArg}\n`)
    return
  }
  const identifier = specIdentifier(snapshotDir, config)
  const local = normalizeLocal(snapshotDir, config)
  const base = readBase(dir, identifier, config)

  let remote = base // no remote → compare local vs base
  let haveRemote = false
  if (flags.remote && fs.existsSync(flags.remote)) {
    remote = normalizeRemote(JSON.parse(fs.readFileSync(flags.remote, 'utf-8')), config)
    haveRemote = true
  }
  const fields = classify(local, remote, base, config)

  const out = []
  out.push(`spec-sync status: ${identifier}${base ? '' : ' (no base yet — never synced)'}`)
  if (!haveRemote) out.push('  (no --remote given — compared local vs base only)')
  const changed = fields.filter((f) => f.status !== 'unchanged')
  if (!changed.length) {
    out.push(haveRemote ? '  in sync — local, Linear, and base agree' : '  nothing to sync — local matches base')
  } else {
    for (const f of changed) {
      const dir_ = f.pushable && f.pullable ? 'push+pull' : f.pushable ? 'push' : f.pullable ? 'pull' : '—'
      out.push(`  ${f.status.padEnd(12)} ${f.field.padEnd(18)} (${f.ownership}, ${dir_})`)
    }
  }
  process.stdout.write(out.join('\n') + '\n')
}

// The linked Linear project id for a spec (frontmatter linear_project_id), else
// its identifier — enough for the file adapter / a single-project remote file.
function specProjectId(snapshotDir, config) {
  try {
    const { frontmatter } = readSnapshot(snapshotDir, config)
    if (frontmatter.linear_project_id) return String(frontmatter.linear_project_id)
    if (frontmatter.linear_identifier) return String(frontmatter.linear_identifier)
  } catch {
    /* fall through */
  }
  return path.basename(snapshotDir)
}

// A file-backed MCP adapter: reads the remote Project projection from a JSON file
// and (on push) writes the merged result to `outPath` (default: the same file).
// This lets `spec-sync push|pull` run the engine deterministically from the CLI /
// CI. Live MCP-backed sync goes through the /spec-push · /spec-pull skills, which
// supply the real adapter (Phase 3). `stamp` bumps updatedAt on write.
function fileAdapter(remotePath, outPath, stamp) {
  const readRemote = () => JSON.parse(fs.readFileSync(remotePath, 'utf-8'))
  return {
    async readProject() {
      return fs.existsSync(remotePath) ? readRemote() : null
    },
    async updateProject(id, updates) {
      const merged = { ...readRemote(), ...updates, updatedAt: `${stamp}-pushed` }
      if (outPath) fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
      return merged
    },
  }
}

// Print a git-like summary of a pull/push engine result.
function printSyncResult(kind, result) {
  const out = []
  if (result.ok === false && !result.blocked) {
    out.push(`spec-sync ${kind}: error — ${result.error}`)
  } else if (result.blocked) {
    out.push(`spec-sync ${kind}: refused — ${result.message}`)
  } else {
    out.push(`spec-sync ${kind}: ok`)
    if (kind === 'pull') {
      if (result.applied.length) out.push(`  applied:   ${result.applied.join(', ')}`)
      if (result.deferred.length) out.push(`  deferred:  ${result.deferred.join(', ')} (body write-back — manual)`)
      if (!result.applied.length && !result.deferred.length) out.push('  nothing to pull — up to date')
    } else {
      if (result.written && result.written.length) out.push(`  written:   ${result.written.join(', ')}`)
      if (result.skipped && result.skipped.length) out.push(`  skipped:   ${result.skipped.join(', ')} (not pushable)`)
      if (result.note) out.push(`  ${result.note}`)
    }
    if (result.backupPath) out.push(`  backup:    ${result.backupPath}`)
    if (result.basePath) out.push(`  base:      ${result.basePath}`)
  }
  process.stdout.write(out.join('\n') + '\n')
}

// `spec-sync push|pull <spec> [--force] [--remote file] [--out file]`.
async function specSyncPushPull(kind, dir, config, specArg, flags) {
  if (!specArg) {
    process.stdout.write(`Usage: skitterspec spec-sync ${kind} <spec> [--force] [--remote file] [--out file]\n`)
    return
  }
  const snapshotDir = resolveSnapshotDir(specArg, dir)
  if (!snapshotDir) {
    process.stdout.write(`spec-sync: spec not found: ${specArg}\n`)
    return
  }
  if (!flags.remote) {
    process.stdout.write(
      `spec-sync ${kind}: live Linear sync runs through the /spec-${kind} skill, which ` +
        'connects the Linear MCP server.\n' +
        `For a local run, pass --remote <project.json> (a Linear Project projection).\n`,
    )
    return
  }
  const identifier = specIdentifier(snapshotDir, config)
  const projectId = specProjectId(snapshotDir, config)
  const stamp = compactTimestamp()
  const adapter = fileAdapter(flags.remote, flags.out, stamp)
  const run = kind === 'pull' ? pull : push
  const result = await run({
    dir,
    snapshotDir,
    identifier,
    projectId,
    adapter,
    config,
    force: flags.force,
    timestamp: new Date().toISOString(),
  })
  printSyncResult(kind, result)
}

// Dispatch `skitterspec spec-sync <sub> [spec] [flags]`. No-ops with a clear
// message when Linear sync isn't enabled (no specs/.core/linear.config.json).
async function specSync(rest) {
  const [sub, ...args] = rest
  let dir = process.cwd()
  const positional = []
  const flags = { force: false, remote: null, out: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = path.resolve(args[++i])
    else if (args[i] === '--force') flags.force = true
    else if (args[i] === '--remote') flags.remote = path.resolve(args[++i])
    else if (args[i] === '--out') flags.out = path.resolve(args[++i])
    else positional.push(args[i])
  }
  dir = path.resolve(dir)

  const { config, present } = loadLinearConfig(dir)
  if (!present) {
    process.stdout.write(
      'spec-sync: Linear sync not enabled (no specs/.core/linear.config.json).\n' +
        'Opt in by copying specs/.core/linear.config.json.example → linear.config.json.\n',
    )
    return
  }

  switch (sub) {
    case 'normalize':
      specSyncNormalize(dir, config, positional[0])
      break
    case 'status':
      specSyncStatus(dir, config, positional[0], flags)
      break
    case 'pull':
      await specSyncPushPull('pull', dir, config, positional[0], flags)
      break
    case 'push':
      await specSyncPushPull('push', dir, config, positional[0], flags)
      break
    default:
      process.stdout.write(
        'Usage: skitterspec spec-sync <normalize|status|pull|push> <spec> [--force] [--remote file] [--out file]\n',
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

  if (cmd === 'spec-sync') {
    await specSync(rest)
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
