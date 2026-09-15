#!/usr/bin/env node
'use strict'

/**
 * Approve (or reject) a staged release for one of this monorepo's packages.
 *
 * `.github/workflows/release.yml` stages a build with `npm stage publish` but
 * cannot make it live: the trusted publisher is stage-only, so a maintainer has
 * to approve it with 2FA. That gate is the point — this only shortens the
 * typing around it.
 *
 *   npm run approve skitterspec                 approve packages/skitterspec's
 *                                               current package.json version
 *   npm run approve skitterspec 19.0.0          approve a specific version
 *   npm run approve skitterspec <uuid>          approve a stage-id directly
 *   npm run approve skitterspec -- --reject     reject instead of approving
 *
 * `npm stage approve|reject|view|download` all take a STAGE-ID (a UUID), never a
 * package spec — only `npm stage list` accepts a spec, and only it supports
 * `--json`. So a version has to be resolved to an id through the listing first,
 * which is most of the work here.
 *
 * Adapted from the single-package helper in the sibling `skittership` repo; the
 * difference is that a package must be named, because this repo publishes two
 * distributions on independent versions.
 */

const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { PACKAGES } = require('./release.js')

// `npm stage` landed in 11.15.0. Older npm fails with an opaque "unknown
// command", which reads as a broken script rather than a stale toolchain.
const MIN_NPM = [11, 15, 0]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// --- pure helpers -----------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2)
  const action = args.includes('--reject') ? 'reject' : 'approve'
  const positional = args.filter((a) => !a.startsWith('-'))
  return { action, pkg: positional[0], target: positional[1] }
}

function npmVersion() {
  return execFileSync('npm', ['--version'], { encoding: 'utf8' })
    .trim()
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
}

function tooOld(actual, min) {
  for (let i = 0; i < min.length; i += 1) {
    const diff = (actual[i] || 0) - min[i]
    if (diff !== 0) return diff < 0
  }
  return false
}

/**
 * Normalise `npm stage list --json` into `{id, version}` rows.
 *
 * npm's docs do not pin down the field names, so rather than depend on one
 * spelling this accepts each obvious one and, failing that, scans the row for a
 * UUID-shaped value.
 *
 * WHAT WOULD MAKE THIS LIE: a payload shape none of these branches recognise
 * would come back as an empty list, which is indistinguishable from "nothing is
 * staged". The caller therefore reports an empty result as *unknown* — "nothing
 * is staged, or the listing could not be read" — and never as a failed release.
 * An absence is only evidence once the lookup is known to have seen the thing
 * (`.claude/rules/negative-checks.md` rule 1).
 */
function normaliseEntries(parsed) {
  let rows = parsed
  if (rows && !Array.isArray(rows)) {
    rows = rows.staged || rows.versions || rows.stages || Object.values(rows)
  }
  if (!Array.isArray(rows)) return []

  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const id =
        [row.id, row.stageId, row.stage_id, row.stageID].find(
          (v) => typeof v === 'string' && UUID.test(v),
        ) || Object.values(row).find((v) => typeof v === 'string' && UUID.test(v))

      let version = row.version
      if (!version) {
        const spec = row.spec || row.package || row._id
        if (typeof spec === 'string' && spec.includes('@')) {
          version = spec.slice(spec.lastIndexOf('@') + 1)
        }
      }
      return { id, version }
    })
    .filter((row) => row.id)
}

/** The stage-id for `version`, or a reason there isn't exactly one. */
function resolveStageId(staged, version) {
  const matches = staged.filter((row) => row.version === version)
  if (matches.length === 1) return { id: matches[0].id }
  if (matches.length === 0) return { problem: 'none', staged }
  return { problem: 'ambiguous', matches }
}

function resolvePackage(short) {
  const entry = PACKAGES[short]
  if (!entry) return null
  return { short, npm: entry.npm, dir: entry.dir }
}

// --- side effects -----------------------------------------------------------

function currentVersion(dir) {
  const raw = readFileSync(path.join(__dirname, '..', dir, 'package.json'), 'utf8')
  return JSON.parse(raw).version
}

function listStaged(npmName) {
  const out = execFileSync('npm', ['stage', 'list', npmName, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return normaliseEntries(JSON.parse(out))
}

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

function main(argv) {
  const { action, pkg, target } = parseArgs(argv)

  const resolved = pkg && resolvePackage(pkg)
  if (!resolved) {
    fail(
      `name the package to approve.\n` +
        `  Usage:    npm run approve <package> [version|stage-id]\n` +
        `  Packages: ${Object.keys(PACKAGES).join(', ')}`,
    )
  }

  const npm = npmVersion()
  if (tooOld(npm, MIN_NPM)) {
    fail(
      `npm ${npm.join('.')} has no \`npm stage\` — staged publishing needs ` +
        `${MIN_NPM.join('.')} or later.\n  Upgrade with: npm install -g npm@latest`,
    )
  }

  // A stage-id passes straight through; anything else is a version.
  let stageId = target && UUID.test(target) ? target : null
  const version = stageId ? null : target || currentVersion(resolved.dir)

  if (!stageId) {
    let staged
    try {
      staged = listStaged(resolved.npm)
    } catch {
      // An E401 here means "not logged in", not "no such release" — approving
      // needs an authenticated, 2FA-capable session.
      fail(
        `could not list staged releases for ${resolved.npm}.\n` +
          `  If that was an auth error, log in first:  npm login\n` +
          `  (approving needs an authenticated, 2FA-capable session)`,
      )
    }

    if (staged.length === 0) {
      fail(
        `nothing staged for ${resolved.npm} — or the listing could not be read.\n` +
          `  CI stages a build on a successful release workflow run; check that it\n` +
          `  completed, then try again. Raw listing:  npm stage list ${resolved.npm}`,
      )
    }

    const found = resolveStageId(staged, version)
    if (found.problem === 'none') {
      console.error(`\n✖ no staged release for ${resolved.npm}@${version}. Staged right now:\n`)
      for (const row of staged) console.error(`    ${row.version || '(unknown)'}  ${row.id}`)
      console.error(`\n  Re-run with the version you want, or pass a stage-id directly.\n`)
      process.exit(1)
    }
    if (found.problem === 'ambiguous') {
      console.error(`\n✖ ${found.matches.length} staged entries for ${resolved.npm}@${version}:\n`)
      for (const row of found.matches) console.error(`    ${row.id}`)
      console.error(`\n  Pass the stage-id you want:  npm run approve ${pkg} <stage-id>\n`)
      process.exit(1)
    }
    stageId = found.id
  }

  const what = version ? `${resolved.npm}@${version}` : `stage ${stageId}`
  console.log(`\n${action === 'approve' ? 'Approving' : 'Rejecting'} ${what}`)
  console.log(`stage-id: ${stageId}`)
  console.log('This prompts for 2FA — it is the release gate, so it cannot be automated.\n')

  try {
    // stdio must be inherited: the 2FA prompt needs the real terminal.
    execFileSync('npm', ['stage', action, stageId], { stdio: 'inherit' })
  } catch {
    fail(`\`npm stage ${action} ${stageId}\` failed — see the error above.`)
  }

  if (action === 'approve') {
    console.log(`\n✅ ${what} approved. Confirm it actually published:`)
    console.log(`    npm view ${resolved.npm} dist-tags`)
    console.log(`    npm view ${what} dist.attestations\n`)
  } else {
    console.log(`\n✅ ${what} rejected and discarded.\n`)
  }
}

if (require.main === module) main(process.argv)

module.exports = { parseArgs, tooOld, normaliseEntries, resolveStageId, resolvePackage, UUID }
