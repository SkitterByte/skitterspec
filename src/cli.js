'use strict'

const fs = require('fs')
const path = require('path')
const { init } = require('./init.js')
const { loadConfig } = require('./config.js')

const pkg = require('../package.json')

const HELP = `skitterspec — spec-driven-development for Claude Code

Usage:
  skitterspec init [dir]      Install skills, rule, specs/ folders, and (optionally)
                              changelog/release-note tooling into a project
  skitterspec update [dir]    Re-copy skills + rule + scripts (overwrites), leaves
                              specs/ and skitterspec.config.json alone
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
  }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') opts.force = true
    else if (a === '--no-claude-md') opts.claudeMd = false
    else if (a === '--yes' || a === '-y') opts.yes = true
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
  const { opts, positional } = parse(rest)
  const dir = path.resolve(opts.dir || positional[0] || process.cwd())

  switch (cmd) {
    case 'init': {
      const existing = loadConfig(dir)
      let release = resolveRelease(existing, opts)

      const interactive = Boolean(process.stdin.isTTY) && !opts.yes
      if (interactive) {
        const { promptSetup } = require('./prompts.js')
        const pkgExists = fs.existsSync(path.join(dir, 'package.json'))
        release = await promptSetup({ seed: release, pkgExists })
      }

      await init({ dir, force: opts.force, claudeMd: opts.claudeMd, mode: 'init', release })
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
