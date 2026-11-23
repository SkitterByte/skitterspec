'use strict'

// Regenerate packages/common/src/spec-planning-history.json: the
// section-stripped hash of every version of `spec-planning.md` this repo ever
// committed. `skitterspec update` uses it to tell a file whose only edits were
// in the old "Project conventions" section from one edited anywhere else
// (packages/common/src/conventions.js).
//
// Every commit, not only tagged releases: a superset can only widen what is
// recognised as unedited, and an untagged version was still installable from a
// linked checkout. Paths cover the pre-monorepo layout too.
//
//   node scripts/conventions-hashes.js

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { strippedHash } = require('../packages/common/src/conventions.js')

const ROOT = path.join(__dirname, '..')
const PATHS = ['packages/common/assets/rules/spec-planning.md', 'assets/rules/spec-planning.md']
const OUT = path.join(ROOT, 'packages', 'common', 'src', 'spec-planning-history.json')

const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })

const hashes = new Set()
for (const p of PATHS) {
  for (const sha of git('log', '--all', '--format=%H', '--', p).split('\n').filter(Boolean)) {
    let text
    try {
      text = git('show', `${sha}:${p}`)
    } catch {
      continue // deleted in this commit
    }
    const h = strippedHash(text)
    if (h) hashes.add(h)
  }
}

fs.writeFileSync(OUT, JSON.stringify({ stripped: [...hashes].sort() }, null, 2) + '\n')
console.log(`conventions-hashes: ${hashes.size} versions → ${path.relative(ROOT, OUT)}`)
