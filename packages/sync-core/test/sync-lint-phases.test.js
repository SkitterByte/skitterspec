'use strict'

/**
 * `lintPhases` — the guard against a SILENTLY wrong phase state.
 *
 * A spec states each phase's status three times: the phase file's h1 emoji, its
 * `> **Status:**` line, and the `00-overview.md` phase-index row. Only the h1 is
 * read (`phaseStateBucket`), and an absent emoji is indistinguishable from
 * `⬜` — so a finished phase whose status was written the other two ways
 * projects as `backlog`, pushes cleanly, and is then RECORDED as the intended
 * value. Nothing looks wrong at any point.
 *
 * That is not hypothetical: it shipped, and three specs migrated into the
 * phase-file layout mirrored four complete phases as backlog.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { lintPhases, normalizeLocal } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

const config = neutralConfig()

// Build a spec folder. `index` rows are `[name, emoji]`; each phase is
// `{ file, heading, statusLine }` — heading written verbatim so a test can omit
// the emoji entirely.
function specDir({ index = [], phases = [], overview = true, phaseIndex = true, bare = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-lint-'))
  if (overview) {
    const rows = index.map(([name, emoji], i) => `| ${i + 1} | ${name} | ${emoji} | [0${i + 1}-x.md](0${i + 1}-x.md) |`)
    const body = ['# Spec', '']
    if (phaseIndex) body.push('## Phases', '', '| # | Phase | Status | File |', '|---|-------|--------|------|', ...rows)
    else body.push('## Problem', '', 'No phase index at all.')
    fs.writeFileSync(path.join(dir, '00-overview.md'), body.concat('').join('\n'), 'utf-8')
  }
  if (bare) fs.writeFileSync(path.join(dir, bare), '# Legacy spec\n\n## Tasks\n\n- [x] Ship it\n', 'utf-8')
  for (const p of phases) {
    const body = [`# ${p.heading}`, '']
    if (p.statusLine) body.push(`> Spec: [00-overview.md](00-overview.md) · **Status:** ${p.statusLine}`, '')
    body.push('**Goal:** do the thing.', '')
    fs.writeFileSync(path.join(dir, p.file), body.join('\n'), 'utf-8')
  }
  return dir
}

const codes = (warnings) => warnings.map((w) => `${w.file}:${w.code}`)

test('the field failure: correct index row and Status line, bare heading', () => {
  // Exactly what shipped — the author wrote the status in the two places that
  // are NOT read, and the projection silently disagreed with both.
  const dir = specDir({
    index: [['Engine', '✅']],
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine', statusLine: '✅ done' }],
  })
  const warnings = lintPhases(dir, config)
  assert.deepStrictEqual(codes(warnings), ['01-x.md:missing-status-emoji'])
  assert.match(warnings[0].message, /not-started/, 'says what it will project as')

  // And prove the warning is about something real: it DOES project as backlog.
  assert.strictEqual(normalizeLocal(dir, config).subIssues[0].state, 'backlog')
})

test('a heading disagreeing with the overview index row warns', () => {
  const dir = specDir({
    index: [['Engine', '🔄']],
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine ✅', statusLine: 'Done' }],
  })
  const warnings = lintPhases(dir, config)
  assert.deepStrictEqual(codes(warnings), ['01-x.md:status-disagreement'])
  assert.match(warnings[0].message, /heading says done but the overview phase-index row says in-progress/)
})

test('a heading disagreeing with its own Status line warns', () => {
  const dir = specDir({
    index: [['Engine', '✅']],
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine ✅', statusLine: 'In progress' }],
  })
  const warnings = lintPhases(dir, config)
  assert.deepStrictEqual(codes(warnings), ['01-x.md:status-disagreement'])
  assert.match(warnings[0].message, /Status line says in-progress/)
})

test('an unparseable Status line is skipped, not warned', () => {
  // The line is free prose. Warning on a phrasing we simply don't recognise
  // would train the warning away, which costs more than the check gains.
  const dir = specDir({
    index: [['Engine', '✅']],
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine ✅', statusLine: 'mostly there, pending review' }],
  })
  assert.deepStrictEqual(lintPhases(dir, config), [])
})

test('"pending review" is not read as not-started', () => {
  // Regression: an early word list included `pending`, so this exact phrasing
  // produced a confident warning that the heading was wrong when it wasn't.
  const dir = specDir({
    index: [['Engine', '🔄']],
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine 🔄', statusLine: 'pending review' }],
  })
  assert.deepStrictEqual(lintPhases(dir, config), [])
})

test('all three signals agreeing produces no warnings', () => {
  const dir = specDir({
    index: [['Engine', '✅'], ['Projection', '⬜']],
    phases: [
      { file: '01-x.md', heading: 'Phase 1 — Engine ✅', statusLine: 'Done' },
      { file: '02-x.md', heading: 'Phase 2 — Projection ⬜', statusLine: 'Not started' },
    ],
  })
  assert.deepStrictEqual(lintPhases(dir, config), [])
})

test('a bare heading suppresses the disagreement checks, not just one of them', () => {
  // With no emoji there is no value to disagree WITH — reporting three warnings
  // for one mistake would bury the one that matters.
  const dir = specDir({
    index: [['Engine', '🔄']],
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine', statusLine: 'Done' }],
  })
  assert.deepStrictEqual(codes(lintPhases(dir, config)), ['01-x.md:missing-status-emoji'])
})

test('a missing overview drops that check without crashing', () => {
  // Legacy specs may have no 00-overview.md at all. One fewer cross-check is
  // correct; a throw from a lint would take the whole push down with it.
  const dir = specDir({
    overview: false,
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine', statusLine: 'Done' }],
  })
  assert.deepStrictEqual(codes(lintPhases(dir, config)), ['01-x.md:missing-status-emoji'])
})

test('a spec with no phase files lints clean', () => {
  assert.deepStrictEqual(lintPhases(specDir({ index: [] }), config), [])
})

test('a renamed phase still matches its index row by position', () => {
  // Title lookup fails after a rename; falling back to position keeps the check
  // alive rather than silently passing.
  const dir = specDir({
    index: [['Old name', '⬜']],
    phases: [{ file: '01-x.md', heading: 'Phase 1 — New name ✅', statusLine: 'Done' }],
  })
  assert.deepStrictEqual(codes(lintPhases(dir, config)), ['01-x.md:status-disagreement'])
})

// --- stays silent on healthy-but-unusual input -------------------------------
//
// Every case below is a spec with nothing wrong with it. `lintPhases` warns on
// every read, so a false positive is paid repeatedly and trains the warning
// away — which costs more than the whole check earns.
// See `.claude/rules/negative-checks.md`.

test('a legacy bare <name>.md spec lints clean', () => {
  // No `NN-*.md` files, so there is no heading emoji to be missing. The check
  // must not read "found no phase files" as "found phases with no status".
  const dir = specDir({ overview: false, bare: 'feat-legacy.md' })
  assert.deepStrictEqual(lintPhases(dir, config), [])
})

test('an overview with no phase index drops that cross-check silently', () => {
  // The overview exists but has no `## Phases` table — a spec mid-migration, or
  // one that never grew an index. Two signals still agree; the third was never
  // written, and absence is not disagreement.
  const dir = specDir({
    phaseIndex: false,
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine ✅', statusLine: 'Done' }],
  })
  assert.deepStrictEqual(lintPhases(dir, config), [])
})

test('an index row stating its status in words is not read as not-started', () => {
  // The false positive this audit found: a Status cell holding `Done` parses to
  // the `not-started` DEFAULT, and the warning then quoted the overview as
  // saying something nobody wrote — on a spec whose h1 (the load-bearing signal)
  // is correct. A row only counts as evidence where it used the emoji.
  const dir = specDir({
    index: [['Engine', 'Done']],
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine ✅', statusLine: 'Done' }],
  })
  assert.deepStrictEqual(lintPhases(dir, config), [])
})

test('an emoji row still disagrees loudly — the fix did not mute the check', () => {
  const dir = specDir({
    index: [['Engine', '⬜']],
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine ✅', statusLine: 'Done' }],
  })
  assert.deepStrictEqual(codes(lintPhases(dir, config)), ['01-x.md:status-disagreement'])
})

test('a missing overview with all its own signals agreeing stays silent', () => {
  // The existing missing-overview test pairs it with a bare heading, so the
  // warning it asserts comes from the heading, not the overview. This is the
  // half that proves the dropped cross-check itself accuses no one.
  const dir = specDir({
    overview: false,
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine ✅', statusLine: 'Done' }],
  })
  assert.deepStrictEqual(lintPhases(dir, config), [])
})

test('lintPhases writes nothing', () => {
  const dir = specDir({
    index: [['Engine', '✅']],
    phases: [{ file: '01-x.md', heading: 'Phase 1 — Engine', statusLine: '✅ done' }],
  })
  const before = fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf-8')])
  lintPhases(dir, config)
  const after = fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf-8')])
  assert.deepStrictEqual(after, before)
})
