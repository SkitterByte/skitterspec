#!/usr/bin/env node
'use strict'

/**
 * The Linear-provider distribution's bin — a superset of the base CLI.
 *
 * The provider's own commands are routed from ONE table (`src/commands.js`),
 * which also generates their `--help` section; every other command (`init`,
 * `update`, `spec-env`, …) delegates to the base CLI unchanged.
 *
 * `--help` is the exception that has to be handled here rather than delegated:
 * the base prints its own HELP const, which cannot know what a provider adds, so
 * delegating made this distribution report that `spec-sync` did not exist.
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

const { run, HELP } = require('@skitterbyte/skitterspec-common/src/cli.js')
const {
  PROVIDER_COMMANDS,
  providerHelpSection,
} = require('@skitterbyte/skitterspec-provider-linear/src/commands.js')

async function main(argv) {
  const [cmd, ...rest] = argv

  // Base help + what this distribution adds. Matched on the COMMAND SLOT only,
  // never the whole argv: `spec-sanitise --help` must reach that command's own
  // help, not be swallowed by the top-level one.
  if (!cmd || cmd === '--help' || cmd === '-h') {
    process.stdout.write(`${HELP}\n${providerHelpSection()}`)
    return
  }

  const provider = PROVIDER_COMMANDS[cmd]
  if (provider) {
    // Propagate the exit code. Dropping it made `spec-sync status
    // --workspace-states` (a bad state name) and `stamp` (a refused write) both
    // look successful to any caller checking $?, which is exactly what the
    // /spec-push skill does before it applies a plan.
    process.exitCode = await provider.run(rest)
    return
  }

  await run(argv)
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`skitterspec-linear: ${err.message}`)
  process.exit(1)
})
