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

module.exports = {
  PACKAGES,
  FEEDS,
  parseSemver,
  cmpSemver,
  previousTagFor,
  packagesFor,
  notesInRange,
  notesFor,
}
