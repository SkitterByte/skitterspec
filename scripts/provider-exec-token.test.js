'use strict'

// Provider assets reach the CLI through the `{{exec}}` token, which install
// renders for the runner actually present. A hard-coded `pnpm exec` works only
// where pnpm and a local install both are — not on an npm project, and not
// from a global install.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const PKGS = path.join(__dirname, '..', 'packages')
const SOURCES = ['common', 'azure-boards', 'github', 'jira', 'linear']

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

test('no source asset hard-codes a runner for the CLI', () => {
  const hits = []
  for (const pkg of SOURCES) {
    for (const f of [...walk(path.join(PKGS, pkg, 'assets')), ...walk(path.join(PKGS, pkg, 'seams'))]) {
      fs.readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/(pnpm exec|npx) skitterspec/.test(line)) hits.push(`${path.relative(PKGS, f)}:${i + 1}`)
        })
    }
  }
  assert.deepStrictEqual(hits, [], 'use `{{exec}} skitterspec…` instead')
})
