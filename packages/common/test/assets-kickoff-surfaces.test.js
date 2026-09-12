'use strict'

// Every shipped surface has to tell the same story about how a start ends.
//
// The failure this prevents is specific and has happened before: the SKILL was
// changed and the rules file, the README and the docs site kept describing the
// previous shape — so the skill offered a choice while the documentation said it
// stopped. `33c6479` had to sweep six surfaces for exactly this reason. These
// are cheap assertions on prose, and they are the only thing that notices.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..', '..')
const ASSETS = path.join(__dirname, '..', 'assets')
const read = (p) => fs.readFileSync(p, 'utf8')

const PLANNING = read(path.join(ASSETS, 'rules', 'spec-planning.md'))
const README = read(path.join(__dirname, '..', 'README.md'))
const MIGRATION = read(path.join(ROOT, 'MIGRATION.md'))
const DOCS = read(path.join(ROOT, 'docs', 'index.html'))

test('the rules file describes a start that asks, not one that only hands off', () => {
  assert.match(PLANNING, /build phase 1 now, or hand\s*\n?off\?/i)
  assert.match(PLANNING, /--worktree <path>/)
  assert.match(PLANNING, /Your session never moves either way/i)
})

test('the rules file keeps the hand-off as a real answer', () => {
  // Documenting only the new path is how the other one quietly stops working.
  assert.match(PLANNING, /say no and you get the\s*\n?path/i)
  assert.match(PLANNING, /from a session in the worktree/)
})

test('the README describes the same two endings', () => {
  assert.match(README, /It then offers phase 1/)
  assert.match(README, /`\/spec-next --worktree <path>`/)
  assert.match(README, /say no and you run/i)
})

test('the docs site row for /spec-start says it offers rather than does', () => {
  assert.match(DOCS, /promote it, mirror the change, then offer to build phase 1/)
})

test('the docs site documents the two new resolve flags', () => {
  assert.match(DOCS, /--record-primary/)
  assert.match(DOCS, /--assert-primary-clean/)
})

// The version headings are the first thing an upgrader reads, and this one used
// to promise the opposite of what the release now does.
test('the migration headings no longer say a start stops', () => {
  assert.doesNotMatch(MIGRATION, /starting a spec builds a branch, and stops/)
  assert.match(MIGRATION, /v18 → v19 \(starting a spec offers phase 1\)/)
  assert.match(MIGRATION, /v12 → v13 \(starting a spec offers phase 1\)/)
})

test('the migration entry states the refusal is not loosened', () => {
  assert.match(MIGRATION, /not a loosened refusal/i)
  assert.match(MIGRATION, /bare `\/spec-next` still refuses/)
})

test('the migration entry says the check reports rather than accuses', () => {
  assert.match(MIGRATION, /reports rather than accuses/i)
  assert.match(MIGRATION, /deletes nothing/i)
})

// The provider distribution gained a behaviour the base one did not, so "nothing
// here is Linear-specific" stopped being true the moment /spec-start pushed.
//
// Scoped to the v12 -> v13 entry deliberately: older entries say that sentence
// and are still correct, so a whole-file doesNotMatch would fail on history it
// has no business editing.
test('the Linear v13 entry no longer claims nothing is Linear-specific', () => {
  const start = MIGRATION.indexOf('v12 → v13 (starting a spec offers phase 1)')
  assert.ok(start !== -1, 'the v13 entry exists')
  const entry = MIGRATION.slice(start, MIGRATION.indexOf('\n## ', start))
  assert.doesNotMatch(entry, /nothing here\s*\n?is Linear-specific/)
  assert.match(entry, /One thing here is Linear-specific/)
  assert.match(entry, /one more Linear call per `\/spec-start`/)
})

// COMPOSITION. The base distribution must stay tracker-free: the source carries
// a marker, and only the provider build fills it.
//
// Composed IN MEMORY from the source, not read out of `packages/skitterspec*/`.
// Those directories are gitignored build output, so reading them makes the test
// depend on whether anyone has run a build in this checkout — it passes on a
// developer's machine and fails on a fresh clone or in CI, which is the worst
// way for a test to be wrong. `composeText` is the same function the build uses.
test('the composed distributions carry the right halves of the start seam', () => {
  const { composeText, loadFragments, mergeFragments } = require(path.join(ROOT, 'scripts', 'compose.js'))
  const source = read(path.join(ASSETS, 'skills', 'spec-start', 'SKILL.md'))
  const commonSeams = loadFragments(path.join(ASSETS, 'seams'))
  const linearSeams = mergeFragments(
    commonSeams,
    loadFragments(path.join(ROOT, 'packages', 'linear', 'assets', 'seams')),
  )

  const base = composeText(source, commonSeams)
  const linear = composeText(source, linearSeams)

  assert.match(source, /<!-- seam:spec-tracker-start -->/, 'the source carries the marker')
  assert.doesNotMatch(base, /<!-- seam:spec-tracker-start -->/, 'no marker survives a build')
  assert.doesNotMatch(linear, /<!-- seam:spec-tracker-start -->/, 'no marker survives a build')
  assert.doesNotMatch(base, /linear/i, 'the base distribution names no tracker')
  assert.match(linear, /Refresh the mirror now, without asking/, 'the provider build is filled')

  // Both builds carry the offer — it is provider-neutral.
  for (const [name, text] of [['base', base], ['linear', linear]]) {
    assert.match(text, /build phase 1 now\?/i, `${name} carries the offer`)
    assert.match(text, /`--worktree <path>` is still there/, `${name} keeps the flag as the exception`)
  }
})
