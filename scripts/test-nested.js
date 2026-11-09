#!/usr/bin/env node
'use strict'

// `pnpm test:nested` — run every test built on `test/helpers/repo.js` again,
// with the skitterspec project nested in a subfolder of its git root
// (spec feat-subfolder-project).
//
// The helper reads SKITTERSPEC_TEST_PREFIX and builds its fixture repos with the
// project under that folder, beside a non-project sibling. A test file opts in by
// building its repos with the helper, so this list grows as files migrate onto
// it — there is no second list to keep in step.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
// The adopter's layout: a solution folder with a dot in its name.
const DEFAULT_PREFIX = 'FF.CSC.Solution'
// Its own package's `./helpers/repo`, or common's from a sibling package.
const USES_HELPER = /require\(['"][./]*(?:common\/test\/)?helpers\/repo(\.js)?['"]\)/

/** Every `*.test.js` under `packages/<pkg>/test/` that builds repos with the helper. */
function nestedTestFiles(root = ROOT) {
  const files = []
  const pkgs = path.join(root, 'packages')
  for (const pkg of fs.readdirSync(pkgs)) {
    const dir = path.join(pkgs, pkg, 'test')
    let names
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue // a package with no test folder is not a finding
    }
    for (const name of names) {
      if (!name.endsWith('.test.js')) continue
      const file = path.join(dir, name)
      if (USES_HELPER.test(fs.readFileSync(file, 'utf8'))) files.push(file)
    }
  }
  return files.sort()
}

if (require.main === module) {
  const files = nestedTestFiles()
  if (!files.length) {
    process.stderr.write('test:nested: no test file uses test/helpers/repo.js — nothing to run.\n')
    process.exit(1)
  }
  const prefix = process.env.SKITTERSPEC_TEST_PREFIX || DEFAULT_PREFIX
  process.stdout.write(`test:nested: ${files.length} file(s), project nested under ${prefix}/\n`)
  const result = spawnSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
    env: { ...process.env, SKITTERSPEC_TEST_PREFIX: prefix },
  })
  process.exit(result.status === null ? 1 : result.status)
}

module.exports = { nestedTestFiles, DEFAULT_PREFIX }
