'use strict'

// The base `skitterspec` bin, in a project with a ticketing provider set up.
//
// Providers stopped answering to `skitterspec` (#278), so the bare name always
// runs this distribution — and a provider's registrations (the `land.specDocs`
// default, its env defaults, its idea store) used to happen only in its own
// bin. Here the base finds the provider the project configured, loads that
// provider's `src/register.js` from where it is installed, and hands it the
// base's own engine modules to register on.

const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { dirname, join } = require('node:path')

// Each provider: its config file, and where its register module lives — in the
// published superset (vendored under src/vendor/) and in the workspace source
// package, tried in that order.
const PROVIDERS = [
  { name: 'linear', configFile: join('specs', '.core', 'linear.config.json') },
  { name: 'jira', configFile: join('specs', '.core', 'jira.config.json') },
  { name: 'github', configFile: join('specs', '.core', 'github.config.json') },
  { name: 'azure-boards', configFile: join('specs', '.core', 'azure-boards.config.json') },
].map((p) => ({
  ...p,
  candidates: [
    [`@skitterbyte/skitterspec-${p.name}`, join('src', 'vendor', p.name, 'register.js')],
    [`@skitterbyte/skitterspec-provider-${p.name}`, join('src', 'register.js')],
  ],
}))

// The nearest directory at or above `from` holding `specs/.core`. A worktree
// tracks its own, so a spec's worktree answers for itself.
function projectDir(from) {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'specs', '.core'))) return dir
    if (dirname(dir) === dir) return null
  }
}

// Where `name` is installed, looked for beside the base (a global install puts
// the provider next to it) and then from the project (a local install).
function resolvePackage(name, paths) {
  try {
    return dirname(require.resolve(`${name}/package.json`, { paths }))
  } catch {
    return null
  }
}

/**
 * Register the provider configured in the project at or above `cwd` on the
 * base engine's `envConfig` and `idea` modules.
 *
 * Returns `{ provider, registered }`: `registered` is `'full'` (its register
 * module ran), `'config'` (not installed — only its config file is registered,
 * so `land.specDocs` still defaults to "branch"), or `null` (nothing done).
 *
 * WHAT WOULD FOOL THIS: two provider config files in one project is a project
 * this cannot read, so nothing is registered and it warns — the base's own
 * behaviour, never a guess between them. A provider installed somewhere Node's
 * resolution cannot see from the base or the project reads as not installed,
 * and the config file alone is still the positive signal for the lane.
 */
function registerConfiguredProvider({ cwd, envConfig, idea, resolve = resolvePackage, warn = () => {} }) {
  const dir = projectDir(cwd)
  if (!dir) return { provider: null, registered: null }
  const configured = PROVIDERS.filter((p) => existsSync(join(dir, p.configFile)))
  if (configured.length === 0) return { provider: null, registered: null }
  if (configured.length > 1) {
    warn(
      `skitterspec: more than one ticketing provider is configured here (${configured.map((p) => p.configFile).join(', ')}) — registering none`,
    )
    return { provider: null, registered: null }
  }
  const p = configured[0]
  const paths = [__dirname, dir]
  for (const [pkg, rel] of p.candidates) {
    const root = resolve(pkg, paths)
    if (root && existsSync(join(root, rel))) {
      require(join(root, rel)).register({ envConfig, idea })
      return { provider: p.name, registered: 'full' }
    }
  }
  envConfig.setProviderConfigFile(p.configFile)
  warn(
    `skitterspec: ${p.configFile} is here but @skitterbyte/skitterspec-${p.name} is not installed beside this one — ` +
      'spec docs ride the branch, but install it for its ideas and env defaults',
  )
  return { provider: p.name, registered: 'config' }
}

// The configured provider's own bin, installed beside the base or in the
// project, or null when it is not installed. `candidates` narrows where to
// look: an install takes only the published superset, since the workspace
// source package's assets are uncomposed and its bin refuses to install them.
function providerBin(p, dir, resolve, candidates = p.candidates) {
  const bin = join('bin', `skitterspec-${p.name}.js`)
  for (const [pkg] of candidates) {
    const root = resolve(pkg, [__dirname, dir])
    if (root && existsSync(join(root, bin))) return join(root, bin)
  }
  return null
}

/**
 * Run `init`, `update`, `enable` or `uninstall` for a project with a provider
 * configured through that provider's own bin. The install set is a
 * distribution's own `assets/`, and the base's lacks the provider's skills,
 * seams and docs — so the base installing it would prune and rewrite them
 * (bug-base-update-clobbers-provider). `update --all` is not forwarded: it
 * runs each project's own distribution itself.
 *
 * `target` is the folder the verb acts on (`--dir`, else its positional,
 * else cwd). Returns the exit status, or `null` when the base installs as it
 * always has: another verb, or no provider configured.
 *
 * WHAT WOULD FOOL THIS: a provider installed where Node's resolution cannot
 * see it from the base or the project reads as not installed — and the verb is
 * refused, naming the package, rather than falling back to the base set. Two
 * provider configs is a project this cannot read, refused the same way.
 */
const INSTALL_VERBS = ['init', 'update', 'enable', 'uninstall']

function forwardInstallCommand({ cwd, argv, target = cwd, resolve = resolvePackage, warn = () => {}, spawn = spawnSync }) {
  const [cmd, ...rest] = argv
  if (!INSTALL_VERBS.includes(cmd)) return null
  if (cmd === 'update' && rest.includes('--all')) return null
  if (rest.includes('--help') || rest.includes('-h')) return null
  const dir = projectDir(target)
  if (!dir) return null
  const configured = PROVIDERS.filter((p) => existsSync(join(dir, p.configFile)))
  if (configured.length === 0) return null
  if (configured.length > 1) {
    warn(
      `skitterspec: more than one ticketing provider is configured here (${configured.map((p) => p.configFile).join(', ')}) — ` +
        `${cmd} refused: keep one, then run it again`,
    )
    return 1
  }
  const p = configured[0]
  const bin = providerBin(p, dir, resolve, p.candidates.slice(0, 1))
  if (bin) {
    const r = spawn(process.execPath, [bin, ...argv], { cwd, stdio: 'inherit' })
    return r.status ?? 1
  }
  warn(
    `skitterspec: ${cmd} refused — ${p.configFile} is here but @skitterbyte/skitterspec-${p.name} is not installed beside this one, ` +
      `and the base set would overwrite its skills. Install it alongside @skitterbyte/skitterspec, at the latest of each.`,
  )
  return 1
}

/**
 * Run a verb the base does not ship (`commands`, e.g. `spec-sync`) on the
 * provider configured in the project at or above `cwd`, through that
 * provider's own bin, so `skitterspec spec-sync …` answers exactly as
 * `skitterspec-<provider> spec-sync …` does — the skills call the bare name.
 *
 * Returns the exit status to use, or `null` when there is nothing to forward
 * and the base should carry on as it would have: a verb it ships, no project,
 * no provider configured, or two of them (registerConfiguredProvider warns).
 *
 * WHAT WOULD FOOL THIS: a provider installed where Node's resolution cannot
 * see it from the base or the project reads as not installed, and the verb is
 * refused naming the package — never run on a guessed provider.
 */
function forwardProviderCommand({
  cwd,
  argv,
  commands,
  resolve = resolvePackage,
  warn = () => {},
  spawn = spawnSync,
}) {
  const [cmd] = argv
  if (!commands.includes(cmd)) return null
  const dir = projectDir(cwd)
  if (!dir) return null
  const configured = PROVIDERS.filter((p) => existsSync(join(dir, p.configFile)))
  if (configured.length !== 1) return null
  const p = configured[0]
  const bin = providerBin(p, dir, resolve)
  if (bin) {
    const r = spawn(process.execPath, [bin, ...argv], { cwd, stdio: 'inherit' })
    return r.status ?? 1
  }
  warn(
    `skitterspec: ${cmd} needs @skitterbyte/skitterspec-${p.name} installed beside this one — ` +
      `${p.configFile} is here but it is not. Install it alongside @skitterbyte/skitterspec, at the latest of each.`,
  )
  return 1
}

module.exports = { registerConfiguredProvider, forwardProviderCommand, forwardInstallCommand, INSTALL_VERBS, PROVIDERS }
