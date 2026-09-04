#!/usr/bin/env node
'use strict'

/**
 * Per-package release notes for this monorepo.
 *
 * `scripts/generate-releases.cjs` (installed by skittership, and left unmodified
 * so a later `skittership update` can still refresh it) renders and upserts a
 * section. What it cannot do here is CHOOSE the commits: its `lib/git-commits.cjs`
 * walks `git describe --tags`, and this repo carries two interleaved tag series
 * plus legacy `v*` tags, so "the previous tag" is ambiguous. This module supplies
 * the selection and reuses that file's pure functions to render.
 *
 * Attribution comes from the build, not from the commit's scope label:
 * `scripts/build-dist.js` vendors `common` into both distributions, and
 * `sync-core` + `linear` into the superset only. So a commit touching
 * `packages/common/**` belongs to BOTH sets of notes.
 *
 * Zero dependencies, like every script here.
 */

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

const PACKAGES = ['skitterspec', 'skitterspec-linear']

// Which distributions a source package ships in. Derived from build-dist.js's
// VENDOR list; keep them in step. Paths under the generated dist dirs attribute
// to nothing — they are build output, gitignored, and never hand-edited.
const FEEDS = [
  { prefix: 'packages/common/', packages: PACKAGES },
  { prefix: 'packages/sync-core/', packages: ['skitterspec-linear'] },
  { prefix: 'packages/linear/', packages: ['skitterspec-linear'] },
]

function git(args, cwd = ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

// --- tag series -------------------------------------------------------------

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function cmpSemver(a, b) {
  const [x, y] = [parseSemver(a), parseSemver(b)]
  if (!x || !y) return 0
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/**
 * The highest `<pkg>@<version>` tag strictly below `version`, or null when this
 * is the package's first release.
 *
 * Sorted by SEMVER, never lexically. As strings '8.3.0' sorts above '16.8.0',
 * which is exactly how an npm version list misled us into believing a publish
 * had failed earlier today — the same trap, one layer down.
 */
function previousTagFor(pkg, version, tags) {
  const prefix = `${pkg}@`
  const versions = tags
    .filter((t) => t.startsWith(prefix))
    .map((t) => t.slice(prefix.length))
    .filter((v) => parseSemver(v))
    .filter((v) => cmpSemver(v, version) < 0)
    .sort(cmpSemver)
  const highest = versions[versions.length - 1]
  return highest ? `${prefix}${highest}` : null
}

// --- attribution ------------------------------------------------------------

/** The distributions a set of changed paths ships in. */
function packagesFor(changedPaths) {
  const out = new Set()
  for (const p of changedPaths) {
    for (const feed of FEEDS) {
      if (p.startsWith(feed.prefix)) feed.packages.forEach((n) => out.add(n))
    }
  }
  return out
}

// --- commit selection -------------------------------------------------------

// Record and field separators, expanded by git itself (%x1e / %x1f). A commit
// body may contain anything a newline-splitting parser would trip on, which is
// why the generator's own git-commits.cjs does the same.
const PRETTY = '--pretty=format:%x1e%H%x1f%s%x1f%b%x1f'
const RS = String.fromCharCode(30)
const FS = String.fromCharCode(31)

/**
 * Commits in `from..to` that carry a `Release-Note:` footer, with their changed
 * paths and the distributions those paths attribute to.
 *
 * BLIND SPOT: attribution reads CHANGED PATHS. A commit that is user-facing but
 * touches only `docs/` or `scripts/` attributes to no package and is dropped.
 * That is intended — such a commit should not carry a Release-Note: footer — but
 * it is the first thing to check when an expected note is missing.
 */
function notesInRange(from, to = 'HEAD', cwd = ROOT) {
  const range = from ? `${from}..${to}` : to
  const out = git(['log', range, '--no-merges', '--name-only', PRETTY], cwd)
  const commits = []
  for (const chunk of out.split(RS)) {
    if (!chunk.trim()) continue
    const [hash, subject, body, rest = ''] = chunk.split(FS)
    if (!/^Release-Note!?:/m.test(body || '')) continue
    const files = rest
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    commits.push({ hash, subject, body, files, packages: packagesFor(files) })
  }
  return commits
}

/** The commits that belong in `pkg`'s release notes for `version`. */
function notesFor(pkg, version, opts = {}) {
  const cwd = opts.cwd || ROOT
  const tags =
    opts.tags ||
    git(['tag', '--list'], cwd)
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
  const from = previousTagFor(pkg, version, tags)
  return notesInRange(from, opts.to || 'HEAD', cwd).filter((c) => c.packages.has(pkg))
}

// --- rendering ---------------------------------------------------------------
//
// Everything below delegates to the installed generator. Its bucketing, its
// `Release-Note!:` / `Release-Area:` grammar and its section format are the
// product's, not this repo's — reimplementing any of it would let the two drift
// while both looked right.

const gen = require('./generate-releases.cjs')
const { parseCommit } = require('./lib/git-commits.cjs')

const releasesFileFor = (pkg) => `RELEASES-${pkg}.md`

function loadShipConfig() {
  const raw = fs.readFileSync(path.join(ROOT, 'skittership.config.json'), 'utf8')
  const cfg = JSON.parse(raw)
  return {
    // productName is unused: each file names its own package, which is the
    // product from the reader's side. Kept out rather than rendered as
    // "skitterspec (skitterspec)".
    scopeAreas: cfg.releases?.scopeAreas || {},
    changelogFile: cfg.changelog?.file || 'CHANGELOG.md',
  }
}

/**
 * Render the notes for one package/version and upsert them into its file.
 *
 * Returns { file, written, notes } — `written` is false when the package has no
 * user-facing change in the range, which is a normal outcome for a release that
 * only touched the other distribution.
 */
function renderFor(pkg, version, opts = {}) {
  const cwd = opts.cwd || ROOT
  const cfg = opts.config || loadShipConfig()
  // parseCommit takes ONE NUL-delimited `hash\0subject\0body` string — the shape
  // its own `git log --pretty` emits — not three arguments. Passing three
  // silently returned null for every commit and reported "no user-facing change"
  // on a range with ten notes in it.
  const NUL = String.fromCharCode(0)
  const commits = (opts.commits || notesFor(pkg, version, opts))
    .map((c) => parseCommit([c.hash, c.subject, c.body || ''].join(NUL)))
    .filter(Boolean)
  const notes = commits.map((c) => gen.parseReleaseNote(c, cfg.scopeAreas)).filter(Boolean)

  const file = path.join(cwd, releasesFileFor(pkg))
  if (!notes.length) return { file, written: false, notes }

  const isoDate = opts.isoDate || new Date().toISOString().slice(0, 10)
  const section = gen.renderReleasesSection(version, isoDate, notes)
  const existing = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8')
    : gen.defaultReleasesHeader(pkg, cfg.changelogFile)
  fs.writeFileSync(file, gen.upsertReleasesSection(existing, section, version))
  return { file, written: true, notes }
}

/**
 * Footer-carrying commits in the range that attribute to NO package.
 *
 * Reported, never swallowed. A dropped note and a lost note look identical from
 * the outside, and the three found when this was written were all footers that
 * should not have been added — website and release-tooling changes that ship in
 * neither distribution.
 *
 * Takes the package so the RANGE is that package's own. An earlier version used
 * PACKAGES[0] regardless and, asked about skitterspec-linear 10.7.0, resolved the
 * range from the highest skitterspec tag below 10.7.0 — years of history, and 15
 * orphans reported instead of 3.
 */
function orphansFor(pkg, version, opts = {}) {
  const cwd = opts.cwd || ROOT
  const tags =
    opts.tags ||
    git(['tag', '--list'], cwd)
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
  const from = previousTagFor(pkg, version, tags)
  return notesInRange(from, opts.to || 'HEAD', cwd).filter((c) => c.packages.size === 0)
}

module.exports = {
  PACKAGES,
  releasesFileFor,
  renderFor,
  orphansFor,
  FEEDS,
  parseSemver,
  cmpSemver,
  previousTagFor,
  packagesFor,
  notesInRange,
  notesFor,
}

// --- CLI ---------------------------------------------------------------------

if (require.main === module) {
  const [pkg, version] = process.argv.slice(2)
  if (!PACKAGES.includes(pkg) || !parseSemver(version || '')) {
    process.stderr.write(`Usage: release-notes.js <${PACKAGES.join('|')}> <x.y.z>\n`)
    process.exit(1)
  }
  const { file, written, notes } = renderFor(pkg, version)
  process.stdout.write(
    written
      ? `release-notes: ${notes.length} note(s) -> ${path.relative(ROOT, file)}\n`
      : `release-notes: no user-facing change for ${pkg} in this range — nothing written\n`,
  )
  // Orphans are reported on EVERY run, not just when something looks wrong: a
  // note dropped in silence is indistinguishable from a note lost.
  const orphans = orphansFor(pkg, version)
  if (orphans.length) {
    process.stdout.write(
      `  ${orphans.length} Release-Note footer(s) attribute to no package and were not included:\n`,
    )
    for (const c of orphans) process.stdout.write(`    ${c.subject}\n`)
    process.stdout.write('  (a change shipping in neither distribution should not carry a footer)\n')
  }
}

