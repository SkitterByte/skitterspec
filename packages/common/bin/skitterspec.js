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

const { run, PROVIDER_COMMANDS } = require('../src/cli.js')

// The check above asks whether src/ exists, which is inert in a workspace source
// package — src/ is committed there. That is exactly where the other half of the
// problem lives: a source package HAS a runnable bin and src, but its assets/ is
// PRE-composition (seam markers still literal). Installing from it writes those
// markers into the user's skills. So ask a second, positive question before any
// install command runs.
// `update --all` installs nothing itself — it runs each project's own bin —
// so it is not asked.
const argv = process.argv.slice(2)
if (argv[0] === 'init' || (argv[0] === 'update' && !argv.includes('--all'))) {
  try {
    require('../src/init.js').assertComposedAssets()
  } catch (err) {
    console.error(`skitterspec: ${err.message}`)
    process.exit(1)
  }
}

// An install verb in a provider project installs that provider's set, so it
// goes to the provider's own bin, or is refused when that is not installed —
// never the base set over the provider's files.
// A flag parse() rejects is left for run() to report as it always has.
if (require('../src/provider.js').INSTALL_VERBS.includes(argv[0])) {
  let target = null
  try {
    const { opts, positional } = require('../src/cli.js').parse(argv.slice(1))
    target = require('node:path').resolve(opts.dir || positional[0] || process.cwd())
  } catch {}
  const installed =
    target &&
    require('../src/provider.js').forwardInstallCommand({
      cwd: process.cwd(),
      argv,
      target,
      warn: (line) => console.error(line),
    })
  if (installed !== null) process.exit(installed)
}

// A verb this base does not ship (spec-sync) goes to the configured provider's
// own bin, which makes its own registrations — so this runs before ours.
const forwarded = require('../src/provider.js').forwardProviderCommand({
  cwd: process.cwd(),
  argv,
  commands: Object.keys(PROVIDER_COMMANDS),
  warn: (line) => console.error(line),
})
if (forwarded !== null) process.exit(forwarded)

// Every skill's engine call runs this bin, providers included (#278), so pick
// up the provider the project configured before anything reads the config.
require('../src/provider.js').registerConfiguredProvider({
  cwd: process.cwd(),
  envConfig: require('../src/env/config.js'),
  idea: require('../src/idea.js'),
  warn: (line) => console.error(line),
})

run(argv).catch((err) => {
  console.error(`skitterspec: ${err.message}`)
  process.exit(1)
})
