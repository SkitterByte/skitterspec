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

async function main(argv) {
  const [cmd, ...rest] = argv
  if (cmd === 'spec-sync') {
    await specSync(rest)
    return
  }
  await run(argv)
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`skitterspec-linear: ${err.message}`)
  process.exit(1)
})
