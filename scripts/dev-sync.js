#!/usr/bin/env node
'use strict'

/**
 * Push a local change into a project that has this repo linked: rebuild the
 * distribution here, then run that project's `skitterspec update`.
 *
 * Both halves are needed because only half the product is code. A `link:`
 * dependency makes the CLI live — the consumer runs this working tree's `src/`
 * directly. Skills are NOT live: `init` copies them into the consumer's
 * `.claude/skills/`, so an edited SKILL.md reaches the consumer only when
 * `update` re-copies it. Rebuilding without updating is the failure this script
 * exists to prevent, because it looks exactly like a change that had no effect.
 *
 *   node scripts/dev-sync.js <consumer-dir>
 *
 * `update` is a resync: it refreshes managed files the consumer has not touched
 * and REPORTS (never clobbers) ones it has. Its own output is passed through
 * unchanged — a declined customization is something the caller has to see.
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
  console.error(`dev-sync: ${message}`)
  process.exit(1)
}

// Which distribution this consumer has linked BACK TO THIS REPO. Resolving the
// real path matters: a consumer on the published package would otherwise be
// rebuilt-and-updated here to no effect whatsoever — the most confusing possible
// outcome, since every command would succeed.
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
  if (!consumerArg) fail('usage: node scripts/dev-sync.js <consumer-dir>')

  const consumer = path.resolve(consumerArg)
  if (!fs.existsSync(path.join(consumer, 'package.json'))) {
    fail(`no package.json in ${consumer} — that is not a project to sync into`)
  }

  const dist = linkedDist(consumer)
  if (!dist) {
    fail(
      `${consumer} does not link back to this repo.\n` +
        `  it may be on the published package — link it first:\n` +
        `    npm run dev:link ${consumerArg}`,
    )
  }

  if (!fs.existsSync(path.join(consumer, 'specs', '.core'))) {
    fail(
      `${consumer} has no specs/.core — skitterspec is not set up there yet.\n` +
        `  run "skitterspec init" in that project first; update only refreshes an existing install.`,
    )
  }

  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-dist.js'), dist], {
    stdio: 'inherit',
    cwd: ROOT,
  })

  // The consumer's OWN linked bin, so this exercises the same path it uses.
  const bin = path.join(consumer, 'node_modules', '.bin', 'skitterspec')
  if (!fs.existsSync(bin)) {
    fail(`no skitterspec bin in ${consumer} — re-link it: npm run dev:link ${consumerArg}`)
  }
  execFileSync(bin, ['update'], { stdio: 'inherit', cwd: consumer })
}

main(process.argv.slice(2))
