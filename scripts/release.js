#!/usr/bin/env node
'use strict'

/**
 * Per-package release tool for the skitterspec monorepo.
 *
 * The monorepo publishes two independent distributions on their own cadence:
 *   @skitterbyte/skitterspec         (packages/skitterspec)
 *   @skitterbyte/skitterspec-linear  (packages/skitterspec-linear)
 *
 * Usage:
 *   node scripts/release.js <package> <patch|minor|major|x.y.z> [--yes] [--publish]
 *
 * Escalating levels — a bare run changes nothing:
 *   (no flag)   plan     print the ordered plan; touch nothing (dry-run).
 *   --yes       local    bump version, commit, and tag <package>@<version>.
 *   --publish   publish  local steps + `npm publish` (prepack builds the dist).
 *
 * It NEVER runs `git push` — it prints the push commands for the operator, per
 * "I prep, you publish". Tag scheme is `<package>@<version>` (e.g.
 * skitterspec@2.0.1); the constant @skitterbyte/ scope is omitted. Zero deps.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')

// The publishable distributions: short name → workspace dir + npm name.
const PACKAGES = {
  skitterspec: { dir: 'packages/skitterspec', npm: '@skitterbyte/skitterspec' },
  'skitterspec-linear': {
    dir: 'packages/skitterspec-linear',
    npm: '@skitterbyte/skitterspec-linear',
  },
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/

// --- pure helpers -----------------------------------------------------------

function resolvePackage(name, root = ROOT) {
  const entry = PACKAGES[name]
  if (!entry) {
    throw new Error(
      `unknown package "${name}" — valid: ${Object.keys(PACKAGES).join(', ')}`,
    )
  }
  const dir = path.join(root, entry.dir)
  return {
    name,
    npm: entry.npm,
    dir,
    dirRel: entry.dir,
    pkgJsonPath: path.join(dir, 'package.json'),
  }
}

function readVersion(pkgJsonPath) {
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  if (!pkg.version || !SEMVER_RE.test(pkg.version)) {
    throw new Error(`package.json has no valid version: ${pkgJsonPath}`)
  }
  return pkg.version
}

function parseSemver(v) {
  const m = SEMVER_RE.exec(v)
  if (!m) throw new Error(`not a valid x.y.z version: "${v}"`)
  const [major, minor, patch] = v.split('.').map(Number)
  return { major, minor, patch }
}

// -1 / 0 / 1 for a < b / a == b / a > b
function cmpSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  for (const k of ['major', 'minor', 'patch']) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1
  }
  return 0
}

// Resolve a bump keyword or explicit version to the next version. Rejects an
// invalid target and a downgrade; allows a target EQUAL to current (first
// release of a version already in package.json). Dedup is the tag guard's job.
function computeNextVersion(current, bump) {
  const cur = parseSemver(current)
  switch (bump) {
    case 'patch':
      return `${cur.major}.${cur.minor}.${cur.patch + 1}`
    case 'minor':
      return `${cur.major}.${cur.minor + 1}.0`
    case 'major':
      return `${cur.major + 1}.0.0`
    default:
      if (!SEMVER_RE.test(bump)) {
        throw new Error(`invalid bump/version "${bump}" — use patch|minor|major or x.y.z`)
      }
      if (cmpSemver(bump, current) < 0) {
        throw new Error(`target ${bump} is older than current ${current} — refusing downgrade`)
      }
      return bump
  }
}

function tagName(name, version) {
  return `${name}@${version}`
}

// Build the structured release plan — the single source of truth for both the
// printed output and the test assertions. Steps carry a `phase`: 'local' steps
// always run when executing; 'publish' steps run only at the publish level.
// Each step carries an `argv` (the executable form) alongside `cmd` (the pretty
// display string): argv is what `execute` spawns, so an argument with spaces —
// e.g. the commit message — stays a single token instead of being re-split.
function buildPlan({ name, npm, dirRel, currentVersion, nextVersion, level = 'plan' }) {
  const tag = tagName(name, nextVersion)
  const needsBump = nextVersion !== currentVersion
  const steps = []

  if (needsBump) {
    steps.push({
      phase: 'local',
      cmd: `npm version ${nextVersion} --no-git-tag-version -w ${npm}`,
      argv: ['npm', 'version', nextVersion, '--no-git-tag-version', '-w', npm],
      desc: `set ${name} version → ${nextVersion}`,
    })
    steps.push({
      phase: 'local',
      cmd: `git add ${dirRel}/package.json package-lock.json`,
      argv: ['git', 'add', `${dirRel}/package.json`, 'package-lock.json'],
      desc: 'stage the version bump',
    })
    steps.push({
      phase: 'local',
      cmd: `git commit -m "chore(release): ${tag}"`,
      argv: ['git', 'commit', '-m', `chore(release): ${tag}`],
      desc: 'commit the bump',
    })
  }

  steps.push({ phase: 'local', cmd: `git tag ${tag}`, argv: ['git', 'tag', tag], desc: `tag ${tag}` })
  steps.push({
    phase: 'publish',
    cmd: `npm publish -w ${npm} --access public`,
    argv: ['npm', 'publish', '-w', npm, '--access', 'public'],
    desc: 'build (prepack) + publish to npm',
  })

  // Never executed — printed for the operator to run when ready.
  const followUp = [`git push`, `git push origin ${tag}`]

  return { name, npm, currentVersion, nextVersion, tag, needsBump, level, steps, followUp }
}

// --- guards (pure; fed real git output by the CLI) --------------------------

function assertCleanTree(porcelain) {
  if (porcelain.trim()) {
    throw new Error('working tree is dirty — commit or stash before releasing')
  }
}

function assertTagAvailable(tag, existingTags) {
  if (existingTags.includes(tag)) {
    throw new Error(`tag ${tag} already exists — release already cut`)
  }
}

// --- formatting -------------------------------------------------------------

function formatPlan(plan) {
  const lines = []
  lines.push(`release: ${plan.name}  ${plan.currentVersion} → ${plan.nextVersion}`)
  lines.push(`  tag:   ${plan.tag}`)
  if (!plan.needsBump) {
    lines.push(`  note:  version already ${plan.nextVersion} — tagging existing commit, no bump`)
  }
  lines.push('')
  lines.push('  steps:')
  for (const step of plan.steps) {
    const mark = step.phase === 'publish' ? '[publish]' : '[local]  '
    lines.push(`    ${mark} ${step.cmd}`)
  }
  lines.push('')
  lines.push('  then push yourself (never run by this tool):')
  for (const cmd of plan.followUp) lines.push(`    ${cmd}`)
  return lines.join('\n')
}

// --- side effects -----------------------------------------------------------

function sh(command, args, root) {
  const res = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'inherit' })
  if (res.status !== 0) {
    throw new Error(`command failed (${res.status}): ${command} ${args.join(' ')}`)
  }
}

function gitPorcelain(root) {
  return spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout || ''
}

function listTags(root) {
  const out = spawnSync('git', ['tag', '--list'], { cwd: root, encoding: 'utf8' }).stdout || ''
  return out.split('\n').map((t) => t.trim()).filter(Boolean)
}

// Run the plan's steps up to `level`, after the guards pass. 'local' runs local
// steps; 'publish' also runs the publish step. Never pushes.
function execute(plan, { root = ROOT, level }) {
  assertCleanTree(gitPorcelain(root))
  assertTagAvailable(plan.tag, listTags(root))

  for (const step of plan.steps) {
    if (step.phase === 'publish' && level !== 'publish') continue
    // Execute the pre-tokenized argv, never the display string — an argument
    // with spaces (the commit message) must stay a single token.
    const [command, ...args] = step.argv
    sh(command, args, root)
  }
}

// --- CLI --------------------------------------------------------------------

const HELP = `release — cut a per-package release for the skitterspec monorepo

Usage:
  node scripts/release.js <package> <patch|minor|major|x.y.z> [--yes] [--publish]

Packages: ${Object.keys(PACKAGES).join(', ')}

Levels (a bare run is a dry-run and changes nothing):
  (no flag)   print the plan only
  --yes       bump + commit + tag locally
  --publish   local steps + npm publish (prepack builds); implies --yes

Never runs 'git push' — prints the push commands for you.`

function parseArgs(argv) {
  const args = argv.slice(2)
  const flags = new Set(args.filter((a) => a.startsWith('--')))
  const positional = args.filter((a) => !a.startsWith('--'))
  return {
    help: flags.has('--help') || flags.has('-h'),
    publish: flags.has('--publish'),
    yes: flags.has('--yes') || flags.has('--execute'),
    pkg: positional[0],
    bump: positional[1],
  }
}

function main(argv) {
  const opts = parseArgs(argv)
  if (opts.help || !opts.pkg || !opts.bump) {
    console.log(HELP)
    process.exit(opts.help ? 0 : 1)
  }

  const level = opts.publish ? 'publish' : opts.yes ? 'local' : 'plan'

  const resolved = resolvePackage(opts.pkg)
  const currentVersion = readVersion(resolved.pkgJsonPath)
  const nextVersion = computeNextVersion(currentVersion, opts.bump)
  const plan = buildPlan({ ...resolved, currentVersion, nextVersion, level })

  console.log(formatPlan(plan))
  console.log('')

  if (level === 'plan') {
    console.log('dry-run — nothing changed. Re-run with --yes (local) or --publish (npm).')
    return
  }

  execute(plan, { root: ROOT, level })
  console.log('')
  console.log(`done (${level}). Now push when ready:`)
  for (const cmd of plan.followUp) console.log(`  ${cmd}`)
}

module.exports = {
  PACKAGES,
  resolvePackage,
  readVersion,
  parseSemver,
  cmpSemver,
  computeNextVersion,
  tagName,
  buildPlan,
  assertCleanTree,
  assertTagAvailable,
  formatPlan,
  parseArgs,
}

// Run the CLI only when invoked directly (keeps the helpers importable).
if (require.main === module) {
  try {
    main(process.argv)
  } catch (err) {
    console.error(`release: ${err.message}`)
    process.exit(1)
  }
}
