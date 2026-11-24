#!/usr/bin/env node
'use strict'

// `pnpm test` — bare `node --test`, minus the parked source packages
// (scripts/parked.json, spec chore-park-linear-jira).
//
// `node --test` cannot exclude, so this lists the files itself with the SAME
// rules its default discovery uses, drops the parked ones, and hands the rest to
// `node --test` with any arguments passed through (CI's annotation reporters).
//
// WHAT WOULD FOOL THIS: a change to Node's default patterns. Then this list
// drifts from bare `node --test` silently — a file found by one and not the
// other. scripts/run-tests.test.js pins the two together on a fixture tree by
// running real `node --test` there, so a drift fails the build rather than
// quietly dropping tests.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { isParkedSource, PARKED } = require('./parked.js')

const ROOT = path.join(__dirname, '..')
const EXT = /\.(c|m)?js$/

/** Node's default test-file rule for a repo-relative, `/`-separated path. */
function isTestFile(rel) {
  const segs = rel.split('/')
  const base = segs[segs.length - 1]
  if (!EXT.test(base)) return false
  const stem = base.replace(EXT, '')
  if (/[.\-_]test$/.test(stem) || stem.startsWith('test-') || stem === 'test') return true
  return segs.slice(0, -1).includes('test')
}

/** Every file bare `node --test` would run under `root`, sorted, `/`-separated. */
function discover(root = ROOT) {
  const out = []
  const walk = (dir, rel) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      // Node's glob skips dot-paths; it excludes node_modules explicitly.
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue
      const r = rel ? `${rel}/${ent.name}` : ent.name
      if (ent.isDirectory()) walk(path.join(dir, ent.name), r)
      else if (ent.isFile() && isTestFile(r)) out.push(r)
    }
  }
  walk(root, '')
  return out.sort()
}

/** `discover`, minus anything inside a parked source package. */
function testFiles(root = ROOT, parked = PARKED) {
  return discover(root).filter((rel) => !isParkedSource(rel, parked))
}

module.exports = { isTestFile, discover, testFiles }

if (require.main === module) {
  const files = testFiles()
  const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  process.exit(result.status === null ? 1 : result.status)
}
