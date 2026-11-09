'use strict'

// The review server and the proxy start as `node <script> <file>` through
// `sh -c` (env/supervise.js). Unquoted, sh ate a Windows path's backslashes and
// the daemon died at once — `review serve --status` then said "not running" —
// and a path with a space split in two on every platform (chore-windows-ci).

const { test } = require('node:test')
const assert = require('node:assert')
const { execFileSync } = require('node:child_process')

const { serveProcFor } = require('../src/cli.js')

const CONFIG = { registry: '.spec-env/registry.json' }

const argvOf = (command) =>
  JSON.parse(execFileSync('sh', ['-c', `node -e 'console.log(JSON.stringify(process.argv.slice(1)))' ${command.replace(/^node \S+|^node "[^"]*"/, '')}`]).toString())

test('the review server command survives sh with a space in the path', () => {
  const proc = serveProcFor(CONFIG, '/tmp/LSC App/FF.CSC.Solution/.spec-env/review-serve.json', { root: '/tmp/LSC App/FF.CSC.Solution' })
  assert.deepStrictEqual(argvOf(proc.command), ['/tmp/LSC App/FF.CSC.Solution/.spec-env/review-serve.json'])
})

test('the review server command keeps a Windows path\'s backslashes through sh', () => {
  const file = 'C:\\Users\\runneradmin\\x\\.spec-env\\review-serve.json'
  const proc = serveProcFor(CONFIG, file, { root: 'C:\\Users\\runneradmin\\x' })
  assert.deepStrictEqual(argvOf(proc.command), [file])
})

test('STAYS SILENT: an ordinary path prints exactly as before', () => {
  const proc = serveProcFor(CONFIG, '/repo/.spec-env/review-serve.json', { root: '/repo' })
  assert.match(proc.command, /^node \S+ \/repo\/\.spec-env\/review-serve\.json$/)
})
