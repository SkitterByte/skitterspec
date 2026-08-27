#!/usr/bin/env node
'use strict'

/**
 * The Linear-provider distribution's bin — a superset of the base CLI.
 *
 * `spec-sync …` is handled here (the provider engine seam); every other command
 * (`init`, `update`, `spec-env`, `--help`, …) delegates to the base CLI unchanged.
 */

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
