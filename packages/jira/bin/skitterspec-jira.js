#!/usr/bin/env node
'use strict'

/**
 * The Jira superset's entry point: the base CLI plus this provider's commands.
 * Phase 4 adds the provider routing (`src/commands.js`); until then every
 * command delegates to the base, which is the whole surface that exists.
 */

const { run } = require('@skitterbyte/skitterspec-common/src/cli.js')

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code || 0
  },
  (error) => {
    console.error(error && error.message ? error.message : error)
    process.exitCode = 1
  },
)
