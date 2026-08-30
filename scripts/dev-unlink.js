#!/usr/bin/env node
'use strict'

/**
 * Put a consuming project back on the published package.
 *
 * `dev-link` writes an **absolute, machine-local** path into the consumer's
 * package.json (`"link:/Users/you/code/skitterspec/packages/…"`). That is fine
 * on your machine and broken everywhere else, so it must not be committed — and
 * when the link points at a spec *worktree* it dangles the moment
 * `/spec-complete` removes it. Undoing needs to be a command, not something you
 * remember to reverse by hand.
 *
 *   node scripts/dev-unlink.js <consumer-dir>
 *
 * Re-adds the distribution from the registry at its latest published version.
 * If you were pinned to something older, set that version yourself afterwards —
 * the link overwrote the range and nothing recorded what it was.
 *
 * Zero dependencies, like every script here.
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const DISTS = ['skitterspec', 'skitterspec-linear']
const SCOPE = '@skitterbyte'

function fail(message) {
  console.error(`dev-unlink: ${message}`)
  process.exit(1)
}

// Which distribution is linked to THIS repo — the only one we should undo. A
// consumer already on the published package is left alone rather than
// reinstalled, so running this twice is harmless.
function linkedDist(consumer) {
  for (const dist of DISTS) {
    const entry = path.join(consumer, 'node_modules', SCOPE, dist)
    if (!fs.existsSync(entry)) continue
    let real
    try {
      real = fs.realpathSync(entry)
    } catch {
      continue
    }
    if (real === path.join(fs.realpathSync(ROOT), 'packages', dist)) return dist
  }
  return null
}

function main(argv) {
  const [consumerArg] = argv
  if (!consumerArg) fail('usage: node scripts/dev-unlink.js <consumer-dir>')

  const consumer = path.resolve(consumerArg)
  if (!fs.existsSync(path.join(consumer, 'package.json'))) {
    fail(`no package.json in ${consumer} — that is not a project to unlink`)
  }

  const dist = linkedDist(consumer)
  if (!dist) {
    console.log(`dev-unlink: ${consumer} is not linked to this repo — nothing to undo.`)
    return
  }

  // Remove BEFORE adding. `pnpm add <name>` alone sees the dependency already
  // satisfied by the link and no-ops, leaving the `link:` spec in package.json
  // while reporting success — which is worse than doing nothing, because it
  // tells you the link is gone when it is not.
  execFileSync('pnpm', ['remove', `${SCOPE}/${dist}`], { stdio: 'inherit', cwd: consumer })
  execFileSync('pnpm', ['add', `${SCOPE}/${dist}`], { stdio: 'inherit', cwd: consumer })
  console.log(
    `\ndev-unlink: ${consumer} is back on the published ${SCOPE}/${dist}.\n` +
      '  if you were pinned to an older version, set it now — the link replaced that range.',
  )
}

main(process.argv.slice(2))
