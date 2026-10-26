#!/usr/bin/env node
'use strict'

// The Azure Boards superset's entry point: the base CLI plus this provider's
// commands.
//
// In the PUBLISHED distribution, bin/src/assets are composed at build time and
// never committed — so a missing src/ means someone is running from a raw
// checkout of the dist package, which has nothing to run. Inline rather than
// shared: a helper would have to live in src/, which is exactly what may be
// missing. In the workspace source package src/ always exists, so this is
// inert there.
const { existsSync } = require('node:fs')
const { join } = require('node:path')
if (!existsSync(join(__dirname, '..', 'src'))) {
  console.error(
    'skitterspec-azure-boards: no build output — this package\'s bin/src/assets are composed, not committed.\n' +
      '  run "npm run build" in the skitterspec repo, then try again.',
  )
  process.exit(1)
}

const { run, HELP } = require('@skitterbyte/skitterspec-common/src/cli.js')

// The provider's isolation defaults, registered beneath the project's own
// env.config.json so `spec-env stage` claims this provider's snapshot sidecar
// without a hand edit (see common src/env/config.js, setProviderEnvDefaults).
require('@skitterbyte/skitterspec-common/src/env/config.js').setProviderEnvDefaults(
  require('@skitterbyte/skitterspec-provider-azure-boards/src/config.js').ENV_CONFIG_DEFAULTS,
)
const {
  PROVIDER_COMMANDS,
  providerHelpSection,
} = require('@skitterbyte/skitterspec-provider-azure-boards/src/commands.js')

async function main(argv) {
  const [cmd, ...rest] = argv

  // A source package HAS a runnable bin and src, but its assets/ is
  // PRE-composition (seam markers still literal). Installing from it would
  // write those markers into the user's skills — refuse before any install
  // command runs.
  if (cmd === 'init' || cmd === 'update') {
    require('@skitterbyte/skitterspec-common/src/init.js').assertComposedAssets()
  }

  // Base help + what this distribution adds. Matched on the COMMAND SLOT only,
  // never the whole argv: `spec-sync --help` must reach that command's own
  // help, not be swallowed by the top-level one.
  if (!cmd || cmd === '--help' || cmd === '-h') {
    process.stdout.write(`${HELP}\n${providerHelpSection()}`)
    return
  }

  const provider = PROVIDER_COMMANDS[cmd]
  if (provider) {
    // Propagate the exit code: a refused stamp or a failed state check must
    // not look successful to a caller checking $?.
    process.exitCode = await provider.run(rest)
    return
  }

  await run(argv)
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`skitterspec-azure-boards: ${err.message}`)
  process.exit(1)
})
