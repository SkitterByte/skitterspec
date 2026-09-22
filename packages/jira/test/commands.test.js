'use strict'

// One table drives routing AND --help: anything routed is documented in the
// same edit, so the two cannot drift (the same pairing the Linear provider
// asserts).

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { PROVIDER_COMMANDS, providerHelpSection, DIST } = require('../src/commands.js')

test('every routed command appears in the help section', () => {
  const help = providerHelpSection()
  assert.match(help, new RegExp(DIST.replace(/[/@]/g, '\\$&')))
  for (const name of Object.keys(PROVIDER_COMMANDS)) {
    assert.match(help, new RegExp(`spec-sync`), `${name} documented`)
    assert.strictEqual(typeof PROVIDER_COMMANDS[name].run, 'function')
  }
})

test('the bin routes provider commands and delegates the rest', () => {
  const bin = fs.readFileSync(path.join(__dirname, '..', 'bin', 'skitterspec-jira.js'), 'utf-8')
  assert.match(bin, /PROVIDER_COMMANDS\[cmd\]/)
  assert.match(bin, /process\.exitCode = await provider\.run\(rest\)/, 'exit codes propagate')
  assert.match(bin, /assertComposedAssets/, 'init/update refuse pre-composition assets')
  assert.match(bin, /await run\(argv\)/, 'everything else delegates to the base CLI')
})
