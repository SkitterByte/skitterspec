'use strict'

// A phase cancelled in place — `# Phase 4 — … ➖` — projects as `cancelled`
// (config.states.cancelled), with the ➖ stripped from its title like the other
// three, and no "no ⬜/🔄/✅ in the heading" warning (bug-cancelled-phase-state).

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, lintPhases, parsePhaseIndex } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

function specIn(bucket) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-cancelled-heading-'))
  const dir = path.join(root, 'specs', bucket, 'feat-x')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    [
      '# X',
      '',
      '## Phases',
      '',
      '| # | Phase | Status | File |',
      '|---|-------|--------|------|',
      '| 1 | Built | ✅ | [01-built.md](01-built.md) |',
      '| 2 | Dropped | ➖ | [02-dropped.md](02-dropped.md) |',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(path.join(dir, '01-built.md'), '# Phase 1 — Built ✅\n\n**Goal:** shipped.\n')
  fs.writeFileSync(path.join(dir, '02-dropped.md'), '# Phase 2 — Dropped ➖\n\n> **Status:** Cancelled\n\n**Goal:** never.\n')
  return dir
}

test('a ➖ phase projects as cancelled with its title stripped', () => {
  for (const bucket of ['in-progress', 'complete']) {
    const subs = normalizeLocal(specIn(bucket), neutralConfig()).subIssues
    assert.deepStrictEqual(
      subs.map((s) => [s.ref, s.name, s.state]),
      [
        ['01-built', 'Built', 'complete'],
        ['02-dropped', 'Dropped', 'cancelled'],
      ],
      bucket,
    )
  }
})

test('a ➖ phase draws no lint warning when heading, status line and index agree', () => {
  assert.deepStrictEqual(lintPhases(specIn('in-progress'), neutralConfig()), [])
})

test('the phase index reads ➖ as cancelled', () => {
  const rows = parsePhaseIndex('| 1 | a | ➖ | [01-a.md](01-a.md) |')
  assert.deepStrictEqual(rows, [{ name: 'a', status: 'cancelled', stated: true }])
})
