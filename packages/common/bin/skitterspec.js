#!/usr/bin/env node
'use strict'

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
    'skitterspec: no build output — this package\'s bin/src/assets are composed, not committed.\n' +
      '  run "npm run build" in the skitterspec repo, then try again.',
  )
  process.exit(1)
}

const { run } = require('../src/cli.js')

// The check above asks whether src/ exists, which is inert in a workspace source
// package — src/ is committed there. That is exactly where the other half of the
// problem lives: a source package HAS a runnable bin and src, but its assets/ is
// PRE-composition (seam markers still literal). Installing from it writes those
// markers into the user's skills. So ask a second, positive question before any
// install command runs.
const argv = process.argv.slice(2)
if (argv[0] === 'init' || argv[0] === 'update') {
  try {
    require('../src/init.js').assertComposedAssets()
  } catch (err) {
    console.error(`skitterspec: ${err.message}`)
    process.exit(1)
  }
}

run(argv).catch((err) => {
  console.error(`skitterspec: ${err.message}`)
  process.exit(1)
})
