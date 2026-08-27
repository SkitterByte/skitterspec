'use strict'

/**
 * `MIGRATION.md` must cover every major a user can be upgrading FROM.
 *
 * This guard exists because 10.0.0 shipped without one. That release made
 * `--workspace-states` mandatory on `spec-sync push` — a hard refusal for anyone
 * scripting it in CI — and the guide's newest entry was still v8 → v9. The
 * release notes carried the change; the file people actually open when a command
 * starts refusing did not.
 *
 * Coverage is the assertion, not word count. A range heading
 * (`v3 → v16 (no breaking changes)`) covers every major inside it, because that
 * is the honest shape when a package was bumped by habit rather than by breakage.
 * What must never happen again is a major with NO entry at all — silence reads
 * identically whether nothing changed or nobody wrote it down.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { PACKAGES } = require('./release.js')

const ROOT = path.join(__dirname, '..')
const GUIDE = path.join(ROOT, 'MIGRATION.md')

// `## `@skitterbyte/skitterspec-linear` v9 → v10 (…)` — the npm name and the
// major range it documents. Accepts `→` or `->`.
const HEADING_RE = /^##\s+`(@skitterbyte\/[a-z-]+)`\s+v(\d+)\s*(?:→|->)\s*v(\d+)/gm

function headings() {
  const text = fs.readFileSync(GUIDE, 'utf8')
  const out = []
  let m
  while ((m = HEADING_RE.exec(text)) !== null) {
    out.push({ npm: m[1], from: Number(m[2]), to: Number(m[3]), heading: m[0].replace(/^##\s+/, '') })
  }
  return out
}

const currentMajor = (dir) =>
  Number(JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8')).version.split('.')[0])

test('every published major has a migration entry', () => {
  const found = headings()
  assert.ok(found.length, 'the guide has parseable version headings at all')

  const gaps = []
  for (const { dir, npm } of Object.values(PACKAGES)) {
    const covered = new Set()
    for (const h of found.filter((h) => h.npm === npm)) {
      // `v3 → v16` documents arriving at 4, 5, … 16.
      for (let v = h.from + 1; v <= h.to; v++) covered.add(v)
    }
    // v1 is the first release — there is nothing to migrate FROM.
    for (let v = 2; v <= currentMajor(dir); v++) {
      if (!covered.has(v)) gaps.push(`${npm} v${v}`)
    }
  }

  assert.deepEqual(
    gaps,
    [],
    `majors with no MIGRATION.md entry:\n  ${gaps.join('\n  ')}\n` +
      'Add a section — "(no breaking changes)" is a valid entry, silence is not.',
  )
})

test('every version heading names a real package and a forward range', () => {
  const names = new Set(Object.values(PACKAGES).map((p) => p.npm))
  for (const h of headings()) {
    assert.ok(names.has(h.npm), `heading names an unpublished package: ${h.heading}`)
    assert.ok(h.from < h.to, `heading range runs backwards: ${h.heading}`)
  }
})

test('entries are ordered newest-first within each package', () => {
  // The reader upgrading from the most recent version is the common case, and
  // they should not have to scroll past a decade of history to find their entry.
  const seen = new Map()
  for (const h of headings()) {
    const previous = seen.get(h.npm)
    if (previous !== undefined) {
      assert.ok(h.to < previous, `${h.npm}: v${h.from} → v${h.to} appears after an older entry`)
    }
    seen.set(h.npm, h.to)
  }
})
