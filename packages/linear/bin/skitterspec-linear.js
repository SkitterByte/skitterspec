#!/usr/bin/env node
'use strict'

/**
 * The Linear-provider distribution's bin — a superset of the base CLI.
 *
 * `spec-sync …` is handled here (the provider engine seam); every other command
 * (`init`, `update`, `spec-env`, `--help`, …) delegates to the base CLI unchanged.
 */

// This package's bin/, src/ and assets/ are COMPOSED by scripts/build-dist.js and
// gitignored, not committed — so a checkout linked before a build (or after a
// `git clean`) has a working binary with nothing behind it. Say that, instead of
// letting `require` raise MODULE_NOT_FOUND on an internal path the caller has no
// way to interpret.
//
// Inline rather than shared: a helper would have to live in src/, which is
// exactly what may be missing. In the workspace packages src/ always exists, so
// this is inert there.
const { existsSync } = require('node:fs')
const { join } = require('node:path')
if (!existsSync(join(__dirname, '..', 'src'))) {
  console.error(
    'skitterspec-linear: no build output — this package\'s bin/src/assets are composed, not committed.\n' +
      '  run "npm run build" in the skitterspec repo, then try again.',
  )
  process.exit(1)
}

const { run } = require('@skitterbyte/skitterspec-common/src/cli.js')
const { specSync } = require('@skitterbyte/skitterspec-provider-linear/src/cli-sync.js')
const { specSanitise } = require('@skitterbyte/skitterspec-provider-linear/src/cli-sanitise.js')

async function main(argv) {
  const [cmd, ...rest] = argv
  if (cmd === 'spec-sync') {
    // Propagate the exit code, like spec-sanitise below. Dropping it made
    // `status --workspace-states` (a bad state name) and `stamp` (a refused
    // write) both look successful to any caller checking $?, which is exactly
    // what the /spec-push skill does before it applies a plan.
    process.exitCode = await specSync(rest)
    return
  }
  if (cmd === 'spec-sanitise') {
    process.exitCode = await specSanitise(rest)
    return
  }
  await run(argv)
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`skitterspec-linear: ${err.message}`)
  process.exit(1)
})
