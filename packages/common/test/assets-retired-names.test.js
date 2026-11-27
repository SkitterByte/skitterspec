'use strict'

// feat-pr-mode-verbs: four names were dropped with no alias — `/spec-to-main`,
// `/spec-live main` (and `connect main`), `/allow-main` and
// `guards.mainIsLandingZone`. A name that lingers in a shipped skill, rule,
// command, README or site page sends a reader (or the model) to something that
// no longer exists, so assert none survives where people read.
//
// WHAT WOULD FOOL THIS: history is allowed to name them — the migration
// guides, the generated RELEASES/CHANGELOG files, completed specs and the
// frozen docs/rationale copies — so those are deliberately out of the scan.
// Anything that legitimately must name an old form (this file, the rename map
// in config.js, the tests pinning the warning) lives outside the scanned roots.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..', '..')
// feat-drop-spec-connect retired `/spec-connect` (and `spec-env connect off`):
// `/spec-live` is the one way to try a spec on the usual ports.
const RETIRED = [
  /\/spec-to-main\b/,
  /spec-live main\b/,
  /\bconnect main\b/,
  /allow-main\b/,
  /mainIsLandingZone/,
  /\/spec-connect\b/,
  /spec-env connect off\b/,
]

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(md|html|json|example)$/.test(e.name)) out.push(p)
  }
  return out
}

const SCANNED = [
  ...walk(path.join(ROOT, 'packages', 'common', 'assets')),
  ...['github', 'linear', 'jira', 'azure-boards'].flatMap((p) => walk(path.join(ROOT, 'packages', p, 'assets'))),
  ...fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.html')).map((f) => path.join(ROOT, 'docs', f)),
  ...['skitterspec', 'common', 'skitterspec-linear'].map((p) => path.join(ROOT, 'packages', p, 'README.md')),
]

test('no shipped file or site page names a retired command or key', () => {
  const hits = []
  for (const file of SCANNED) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const re of RETIRED) if (re.test(text)) hits.push(`${path.relative(ROOT, file)}: ${re}`)
  }
  assert.deepStrictEqual(hits, [])
})

// Stays silent on the rename's own replacements, and the scan reached files.
test('the scan reads real files and the new names are present', () => {
  assert.ok(SCANNED.length > 50, `scanned ${SCANNED.length} files`)
  const all = SCANNED.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n')
  for (const name of ['/spec-land', '/spec-pr', '/spec-live off', '/allow-base', 'baseIsLandingZone', 'spec-env dev up']) {
    assert.ok(all.includes(name), `${name} is documented somewhere`)
  }
})
