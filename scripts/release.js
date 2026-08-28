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
 *   --publish   publish  local steps + `pnpm publish` (prepack builds the dist).
 *   --allow-empty        permit a release in which nothing shippable changed.
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

// What actually goes into each distribution's tarball, as git-visible paths.
//
// NOT `packages/<dist>/{src,assets,bin}` — those are **gitignored**, composed at
// prepack by build-dist.js, so a diff over them is empty for every release and
// would report every release as having shipped nothing. The real inputs are the
// composing SOURCE packages plus the dist's own committed files.
const TARBALL_INPUTS = {
  skitterspec: ['packages/common', 'packages/skitterspec'],
  'skitterspec-linear': [
    'packages/common',
    'packages/linear',
    'packages/sync-core',
    'packages/skitterspec-linear',
  ],
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

// Set a package.json's version in place. Replaces only the version string so the
// file's formatting is preserved (no reserialize) — pnpm has no `-w version`
// verb, so the bump is done here rather than shelling to a package manager.
function writeVersion(pkgJsonPath, version) {
  const raw = fs.readFileSync(pkgJsonPath, 'utf8')
  const next = raw.replace(/("version"\s*:\s*")\d+\.\d+\.\d+(")/, `$1${version}$2`)
  if (next === raw) {
    throw new Error(`could not set version in ${pkgJsonPath}`)
  }
  fs.writeFileSync(pkgJsonPath, next)
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
      kind: 'write-version',
      file: `${dirRel}/package.json`,
      version: nextVersion,
      cmd: `set ${dirRel}/package.json version → ${nextVersion}`,
      desc: `set ${name} version → ${nextVersion}`,
    })
    steps.push({
      phase: 'local',
      cmd: `git add ${dirRel}/package.json`,
      argv: ['git', 'add', `${dirRel}/package.json`],
      desc: 'stage the version bump',
    })
    steps.push({
      phase: 'local',
      cmd: `git commit -m "chore(release): ${tag}"`,
      argv: ['git', 'commit', '-m', `chore(release): ${tag}`],
      desc: 'commit the bump',
    })
  }

  // Publish BEFORE tagging. `sh` throws on a non-zero exit, so a failed publish
  // aborts the run — and if the tag were cut first it would survive that abort,
  // asserting a release npm does not have (skitterspec@16.3.1, tagged and
  // committed, never published, silently superseded by 16.3.2). Tagging last
  // inverts the failure: a publish that succeeds and then fails to tag leaves a
  // real published version to be tagged by hand, which is recoverable and
  // visible. A tag pointing at nothing is neither.
  //
  // The tag stays `phase: 'local'` so `--yes` without `--publish` — the "I prep,
  // you publish" half — still tags exactly as before.
  steps.push({
    phase: 'publish',
    cmd: `pnpm publish --filter ${npm} --access public --no-git-checks`,
    argv: ['pnpm', 'publish', '--filter', npm, '--access', 'public', '--no-git-checks'],
    desc: 'build (prepack) + publish to npm',
  })
  steps.push({ phase: 'local', cmd: `git tag ${tag}`, argv: ['git', 'tag', tag], desc: `tag ${tag}` })

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

/**
 * The highest existing tag for a package, or null when it has never been cut.
 * Pure — `listTags` supplies the list.
 */
function lastTagFor(name, existingTags) {
  const prefix = `${name}@`
  const versions = existingTags
    .filter((t) => t.startsWith(prefix))
    .map((t) => t.slice(prefix.length))
    .filter((v) => SEMVER_RE.test(v))
    .sort(cmpSemver)
  return versions.length ? `${prefix}${versions[versions.length - 1]}` : null
}

// Which of a package's tarball inputs changed since `sinceTag`. Impure (shells
// out to git); the decision it feeds is pure.
function changedInputs(root, name, sinceTag) {
  const paths = TARBALL_INPUTS[name] || []
  if (!sinceTag || !paths.length) return []
  const res = spawnSync('git', ['diff', '--name-only', sinceTag, 'HEAD', '--', ...paths], {
    cwd: root,
    encoding: 'utf8',
  })
  const files = (res.stdout || '').split('\n').filter(Boolean)
  // Every release changes its own package.json version line, so counting it
  // would make even a version-only bump look substantive.
  return files.filter((f) => f !== `packages/${name}/package.json`)
}

/**
 * Refuse a release whose tarball would be identical to the last one.
 *
 * `skitterspec-linear@9.1.0` shipped nothing: across every input the only change
 * was the version string, and a consumer had to unpack both tarballs to find
 * that out. A minor bump is supposed to signal new functionality.
 *
 * Pure; `changedInputs` does the looking. A package with no prior tag is never
 * empty — there is nothing to compare against.
 */
function assertShippableChange(changed, { name, sinceTag, allowEmpty = false } = {}) {
  if (allowEmpty || !sinceTag || changed.length) return
  throw new Error(
    `nothing to ship: no tarball input for ${name} changed since ${sinceTag} — ` +
      `this release would be byte-identical apart from the version. ` +
      `Pass --allow-empty if you mean it (a deliberate version alignment).`,
  )
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
function execute(plan, { root = ROOT, level, allowEmpty = false }) {
  assertCleanTree(gitPorcelain(root))
  const tags = listTags(root)
  assertTagAvailable(plan.tag, tags)
  const sinceTag = lastTagFor(plan.name, tags)
  assertShippableChange(changedInputs(root, plan.name, sinceTag), {
    name: plan.name,
    sinceTag,
    allowEmpty,
  })

  for (const step of plan.steps) {
    if (step.phase === 'publish' && level !== 'publish') continue
    if (step.kind === 'write-version') {
      writeVersion(path.join(root, step.file), step.version)
      continue
    }
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
  --publish   local steps + pnpm publish (prepack builds); implies --yes
  --allow-empty  release even though no tarball input changed since the last
                 tag (a deliberate version-alignment bump)

Never runs 'git push' — prints the push commands for you.`

function parseArgs(argv) {
  const args = argv.slice(2)
  const flags = new Set(args.filter((a) => a.startsWith('--')))
  const positional = args.filter((a) => !a.startsWith('--'))
  return {
    help: flags.has('--help') || flags.has('-h'),
    publish: flags.has('--publish'),
    yes: flags.has('--yes') || flags.has('--execute'),
    allowEmpty: flags.has('--allow-empty'),
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

  execute(plan, { root: ROOT, level, allowEmpty: opts.allowEmpty })
  console.log('')
  console.log(`done (${level}). Now push when ready:`)
  for (const cmd of plan.followUp) console.log(`  ${cmd}`)
}

module.exports = {
  PACKAGES,
  TARBALL_INPUTS,
  lastTagFor,
  changedInputs,
  assertShippableChange,
  resolvePackage,
  readVersion,
  writeVersion,
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
