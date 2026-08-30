#!/usr/bin/env node
'use strict'

/**
 * Link a distribution into a consuming project, for testing a change without
 * publishing it.
 *
 * The whole point is the ORDER. A distribution's `bin/`, `src/` and `assets/` are
 * composed by `build-dist.js` and gitignored, and pnpm does not run `prepare` for
 * a `link:` dependency — so linking an unbuilt package produces no bin shim at
 * all, and the consumer's only symptom is "command not found". Building first is
 * not a convenience here; it is the difference between a link that works and one
 * that silently yields nothing.
 *
 *   node scripts/dev-link.js <consumer-dir> [skitterspec|skitterspec-linear]
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
  console.error(`dev-link: ${message}`)
  process.exit(1)
}

function main(argv) {
  const [consumerArg, distArg = 'skitterspec-linear'] = argv
  if (!consumerArg) fail('usage: node scripts/dev-link.js <consumer-dir> [' + DISTS.join('|') + ']')
  if (!DISTS.includes(distArg)) fail(`unknown distribution "${distArg}" (want: ${DISTS.join(', ')})`)

  const consumer = path.resolve(consumerArg)
  if (!fs.existsSync(path.join(consumer, 'package.json'))) {
    fail(`no package.json in ${consumer} — that is not a project to link into`)
  }

  // Build FIRST. See the note above: the order is the feature.
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-dist.js'), distArg], {
    stdio: 'inherit',
    cwd: ROOT,
  })

  const pkgDir = path.join(ROOT, 'packages', distArg)
  const spec = `${SCOPE}/${distArg}@link:${pkgDir}`
  execFileSync('pnpm', ['add', spec], { stdio: 'inherit', cwd: consumer })

  console.log(
    `\ndev-link: ${SCOPE}/${distArg} linked into ${consumer}\n` +
      '  next: run "skitterspec init" there (first time) or "skitterspec update" (to refresh\n' +
      '  the copied skills) — a link updates the CLI, but skills are copies.',
  )
}

main(process.argv.slice(2))
