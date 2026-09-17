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
 *   node scripts/release.js <package> <patch|minor|major|x.y.z> [--yes]
 *
 * Escalating levels — a bare run changes nothing:
 *   (no flag)   plan     print the ordered plan; touch nothing (dry-run).
 *   --yes       local    bump version, commit, and tag <package>@<version>.
 *   --allow-empty        permit a release in which nothing shippable changed.
 *   --skip-tests         cut the release without running the suite.
 *
 * It NEVER publishes. Pushing the tag is what publishes: `.github/workflows/
 * release.yml` stages that package on npm by OIDC, and a human approves it with
 * 2FA (`npm run approve <package> <version>`). CI is the only publisher, so
 * every release carries provenance and no token lives on a laptop.
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
// The image the Linux run uses. The MAJOR tracks `engines.node` and the CI
// matrix floor; it is deliberately not pinned to the exact patch, because this
// is a second opinion about the PLATFORM, not a reproduction of a runner.
const LINUX_IMAGE = 'node:22'

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
// printed output and the test assertions. Every step is `phase: 'local'` — the
// publish is CI's, triggered by the tag this plan cuts.
// Each step carries an `argv` (the executable form) alongside `cmd` (the pretty
// display string): argv is what `execute` spawns, so an argument with spaces —
// e.g. the commit message — stays a single token instead of being re-split.
function buildPlan({
  name,
  npm,
  dirRel,
  currentVersion,
  nextVersion,
  level = 'plan',
  skipTests = false,
  // The Linux gate's verdict, decided by `linuxGate` and passed in so buildPlan
  // stays pure — a test states the world rather than needing a Docker daemon.
  linux = { state: 'unknown', why: 'not asked' },
  root = ROOT,
}) {
  const tag = tagName(name, nextVersion)
  const needsBump = nextVersion !== currentVersion
  const notesFile = `RELEASES-${name}.md`
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
    // Notes BEFORE the stage, so the generated file is committed with the bump.
    // A release that publishes without its notes committed is the ordering
    // failure this prevents — the version would ship and the record would not.
    steps.push({
      phase: 'local',
      cmd: `node scripts/release-notes.js ${name} ${nextVersion}`,
      argv: ['node', 'scripts/release-notes.js', name, nextVersion],
      desc: `write ${notesFile} from the Release-Note footers`,
    })
  }

  // THE SUITE RUNS AFTER THE VERSION IS WRITTEN, NOT BEFORE IT — deliberately.
  //
  // "Run the tests before you bump" is the intuitive order and it is the one
  // that misses the failure this step exists for. A guard that reads the
  // version being released is GREEN until the bump: `migration-guide.test.js`
  // compares MIGRATION.md against packages/*/package.json, so a major with no
  // migration entry passes every pre-bump run and fails the instant the bump
  // lands. skitterspec@20.0.0 and skitterspec-linear@14.0.0 were both cut that
  // way and had to be fixed on main afterwards.
  //
  // So the version on disk must BE the version being released when the suite
  // runs. Nothing is staged or committed yet at this point, so a red suite
  // leaves exactly two unstaged files behind — execute() names them.
  if (!skipTests) {
    steps.push({
      phase: 'local',
      kind: 'verify',
      cmd: 'pnpm test',
      argv: ['pnpm', 'test'],
      desc: 'run the suite against the version being released',
      restore: needsBump ? [`${dirRel}/package.json`, notesFile] : [],
    })

    // AND THE SAME SUITE ON LINUX, because the run above is on whatever the
    // releaser happens to be sitting at. Two releases were cut off a green
    // macOS run and could not build on Linux; see `linuxGate`.
    //
    // Ordered AFTER the native run deliberately: it is the slower of the two,
    // and a failure common to both platforms should surface in seconds rather
    // than minutes. The Linux run is the second opinion, not the first.
    if (linux.state === 'run') {
      steps.push({
        phase: 'local',
        kind: 'verify',
        cmd: `docker run --rm --init -v "$PWD":/app -w /app ${LINUX_IMAGE} node --test`,
        argv: [
          'docker',
          'run',
          '--rm',
          // `--init` IS LOAD-BEARING, NOT TIDINESS. Without it PID 1 in the
          // container is the test runner, which does not reap orphans — so a
          // killed detached `sh` stays a ZOMBIE, its process-table entry
          // survives, and `process.kill(pid, 0)` goes on succeeding. Two
          // teardown tests that assert a process is gone then fail in the
          // container and pass on a real machine, which is a false accusation
          // pointed at healthy code — the precise inverse of the bug this gate
          // exists to catch, and far more corrosive, because a gate that cries
          // wolf gets passed `--skip-linux` forever.
          //
          // A GitHub runner has a real init, so it never saw this. The
          // container had to be told.
          '--init',
          '-v',
          `${root}:/app`,
          '-w',
          '/app',
          LINUX_IMAGE,
          'node',
          '--test',
        ],
        desc: `run the same suite on Linux (${LINUX_IMAGE})`,
        restore: needsBump ? [`${dirRel}/package.json`, notesFile] : [],
      })
    }
  }

  if (needsBump) {
    steps.push({
      phase: 'local',
      cmd: `git add ${dirRel}/package.json ${notesFile}`,
      argv: ['git', 'add', `${dirRel}/package.json`, notesFile],
      desc: 'stage the version bump + release notes',
    })
    steps.push({
      phase: 'local',
      cmd: `git commit -m "chore(release): ${tag}"`,
      argv: ['git', 'commit', '-m', `chore(release): ${tag}`],
      desc: 'commit the bump',
    })
  }

  // NOTHING IS PUBLISHED HERE, and the tag is now the LAST step in a different
  // sense than it used to be: it is the trigger.
  //
  // This tool once published before tagging, because a tag cut first survives a
  // failed publish and then asserts a release npm does not have —
  // skitterspec@16.3.1 was tagged and committed, never published, and silently
  // superseded by 16.3.2. That reasoning was right while publishing was a single
  // irreversible step.
  //
  // Staging changes it. Pushing the tag stages the package on npm; nothing is
  // consumed there until a human approves with 2FA. So a tag whose staging
  // failed costs a deleted tag and a re-push, not a burnt version — and in
  // exchange, CI is the only publisher, which is what makes provenance a
  // property of every release rather than of the ones that happened to go
  // through it.
  // ANNOTATED, deliberately. `git tag <name>` alone makes a lightweight tag — a
  // bare ref with no tag object — and `git push --follow-tags`, which is how a
  // tag normally travels with its branch, sends annotated tags and nothing else.
  // A lightweight release tag therefore stays local while the push reports
  // success: seven of them accumulated for published versions across five
  // releases before anyone noticed. The annotation also records who cut the
  // release and when, which a tag asserting "this reached npm" should carry.
  const tagMsg = `${name} ${nextVersion}`
  steps.push({
    phase: 'local',
    cmd: `git tag -a ${tag} -m "${tagMsg}"`,
    argv: ['git', 'tag', '-a', tag, '-m', tagMsg],
    desc: `tag ${tag}`,
  })

  // Never executed — printed for the operator to run when ready. Pushing the
  // tag is what starts the release: release.yml stages it on npm, and the
  // approve step finishes it with 2FA.
  const followUp = [
    `git push`,
    `git push origin ${tag}`,
    `npm run approve ${name} ${nextVersion}   # after the run stages it`,
  ]

  return {
    name,
    npm,
    currentVersion,
    nextVersion,
    tag,
    needsBump,
    level,
    skipTests,
    linux,
    steps,
    followUp,
  }
}

// --- guards (pure; fed real git output by the CLI) --------------------------

/**
 * THE RELEASE'S LINUX GATE — decide whether to run the suite on Linux too.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A CI LOOKUP. skitterspec@22.0.0 and
 * skitterspec-linear@17.0.0 were both cut off a green macOS suite, pushed, and
 * failed in CI on a test that could not pass on Linux. The obvious fix — "check
 * the commit's CI run before tagging" — is structurally impossible here: the
 * commit being tagged is the `chore(release):` commit THIS SCRIPT CREATES, so
 * no CI run for that sha can exist at the moment the tag is cut. CI is the
 * gate AFTER the tag, by construction.
 *
 * So the property is proved locally instead, against the exact tree being
 * tagged: run the same suite on Linux in a container. It is slower than the
 * native run and far cheaper than a release round-trip.
 *
 * THREE ANSWERS, and only one of them stops anything:
 *
 *   - `run`     — Docker is here and nobody opted out. Run it.
 *   - `skipped` — `--skip-linux`, on the record in the invocation and in the
 *                printed plan, exactly as `--allow-empty` and `--skip-tests`.
 *   - `unknown` — no Docker, or a daemon that is not running. That is not
 *                evidence the tree is bad, so it must not block a release
 *                (`.claude/rules/negative-checks.md` rule 4). It says so and
 *                the release proceeds.
 *
 * WHAT WOULD FOOL IT: a container is not a GitHub runner. Same kernel family,
 * different image, different filesystem semantics under a bind mount. It closes
 * the macOS-vs-Linux gap that has now bitten twice; it does not promise CI
 * parity, and nothing here should claim it does.
 *
 * Pure: the caller establishes `dockerAvailable`.
 */
function linuxGate({ dockerAvailable, skip = false } = {}) {
  if (skip) return { state: 'skipped', why: '--skip-linux was passed' }
  if (!dockerAvailable) {
    return { state: 'unknown', why: 'no running Docker — the Linux run was not attempted' }
  }
  return { state: 'run', why: null }
}

// Is there a Docker daemon to run the Linux suite in? A missing binary, a
// stopped daemon and a permission error are all the same answer — "cannot tell"
// — and all route to the harmless branch above.
function dockerAvailable(root = ROOT) {
  const r = spawnSync('docker', ['info'], { cwd: root, stdio: 'ignore' })
  return r.status === 0
}

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
  if (plan.skipTests) {
    lines.push('  note:  --skip-tests — the suite will NOT run before this release is cut')
  }
  // SAID OUT LOUD IN EVERY STATE, including the one where nothing happens.
  // A gate that is silent when it does not run teaches the reader it always
  // ran — which is the false confidence this whole thing exists to remove.
  else if (plan.linux && plan.linux.state !== 'run') {
    lines.push(`  note:  Linux run skipped — ${plan.linux.why}`)
    lines.push('         the suite below runs on this machine only')
  }
  lines.push('')
  lines.push('  steps:')
  for (const step of plan.steps) {
    lines.push(`    ${step.cmd}`)
  }
  lines.push('')
  lines.push('  then, yourself (never run by this tool):')
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

// What a red suite leaves behind, said precisely. The next run refuses on a
// dirty tree (assertCleanTree), so "fix it and re-run" is not on its own
// actionable — the bump has to be restored first, and the paths are known.
function verifyFailureMessage(step) {
  const head = `${step.cmd} failed — nothing was staged, committed or tagged.`
  if (!step.restore.length) return `${head} Fix the failures, then re-run.`
  return (
    `${head}\n` +
    '  The version bump and release notes are written but unstaged, and the\n' +
    '  next run refuses on a dirty tree. Restore them, fix the failures, then\n' +
    '  re-run:\n' +
    `    git checkout -- ${step.restore.join(' ')}`
  )
}

function gitPorcelain(root) {
  return spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout || ''
}

function listTags(root) {
  const out = spawnSync('git', ['tag', '--list'], { cwd: root, encoding: 'utf8' }).stdout || ''
  return out.split('\n').map((t) => t.trim()).filter(Boolean)
}

// Run the plan's steps after the guards pass. Every step is local now — the
// publish belongs to CI — so there is no level to filter on. Never pushes.
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
    if (step.kind === 'write-version') {
      writeVersion(path.join(root, step.file), step.version)
      continue
    }
    // Execute the pre-tokenized argv, never the display string — an argument
    // with spaces (the commit message) must stay a single token.
    const [command, ...args] = step.argv
    if (step.kind === 'verify') {
      try {
        sh(command, args, root)
      } catch {
        // The suite already printed its own failures (stdio: 'inherit'); what
        // it cannot know is what this tool wrote before running it.
        throw new Error(verifyFailureMessage(step))
      }
      continue
    }
    sh(command, args, root)
  }
}

// --- CLI --------------------------------------------------------------------

const HELP = `release — cut a per-package release for the skitterspec monorepo

Usage:
  node scripts/release.js <package> <patch|minor|major|x.y.z> [--yes]

Packages: ${Object.keys(PACKAGES).join(', ')}

Levels (a bare run is a dry-run and changes nothing):
  (no flag)   print the plan only
  --yes       bump + commit + tag locally
  --allow-empty  release even though no tarball input changed since the last
                 tag (a deliberate version-alignment bump)
  --skip-tests   cut the release without running the suite (the escape hatch
                 for a failure you have established is unrelated)
  --skip-linux   cut the release without the second, Linux run of the suite.
                 The native run still happens. Skipped automatically, with a
                 note, when there is no running Docker.

The suite runs after the version is written and before anything is staged, so
guards that read the version being released — the migration guide's, for one —
are in scope. A red suite leaves two unstaged files and no commit or tag.

It runs TWICE: once natively, then again on Linux in a container. The commit
being tagged is the one this script is about to create, so no CI run for it can
exist yet — CI is the gate after the tag, never before it. Two releases were cut
off a green macOS suite and could not build on Linux; the second run is what
closes that.

Never runs 'git push', and never publishes — pushing the tag is what stages the
release on npm (.github/workflows/release.yml), which you then approve with
'npm run approve <package> <version>'.`

function parseArgs(argv) {
  const args = argv.slice(2)
  const flags = new Set(args.filter((a) => a.startsWith('--')))
  const positional = args.filter((a) => !a.startsWith('--'))
  return {
    help: flags.has('--help') || flags.has('-h'),
    yes: flags.has('--yes') || flags.has('--execute'),
    allowEmpty: flags.has('--allow-empty'),
    skipTests: flags.has('--skip-tests'),
    skipLinux: flags.has('--skip-linux'),
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

  const level = opts.yes ? 'local' : 'plan'

  const resolved = resolvePackage(opts.pkg)
  const currentVersion = readVersion(resolved.pkgJsonPath)
  const nextVersion = computeNextVersion(currentVersion, opts.bump)
  // Asked once, here, so the printed plan and the executed plan cannot
  // disagree about whether Linux was checked.
  const linux = linuxGate({ dockerAvailable: dockerAvailable(), skip: opts.skipLinux })
  const plan = buildPlan({
    ...resolved,
    currentVersion,
    nextVersion,
    level,
    skipTests: opts.skipTests,
    linux,
    root: ROOT,
  })

  console.log(formatPlan(plan))
  console.log('')

  if (level === 'plan') {
    console.log('dry-run — nothing changed. Re-run with --yes to bump, commit and tag.')
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
  linuxGate,
  LINUX_IMAGE,
  formatPlan,
  verifyFailureMessage,
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
