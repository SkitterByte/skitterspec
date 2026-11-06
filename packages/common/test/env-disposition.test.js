'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { collectDisposition } = require('../src/env/disposition.js')

const OVERVIEW = `# Spec

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Data model | ✅ | [01-data-model.md](01-data-model.md) |
| 2 | API | 🔄 | [02-api.md](02-api.md) |
| 3 | Docs | ⬜ | [03-docs.md](03-docs.md) |

## Changelog

- 2026-01-09 — Follow-up surfaced: connect's port picker assumes a free port.
- 2026-01-10 — Spec created.
`

test('enumerates unticked tasks with file and line, skipping ticked ones', () => {
  const d = collectDisposition({
    overview: OVERVIEW,
    phases: [
      { file: '02-api.md', content: '## Tasks\n\n- [x] Add handler\n- [ ] Add validation\n  - [ ] nested too\n' },
    ],
  })
  assert.deepStrictEqual(d.tasks, [
    { file: '02-api.md', line: 4, text: 'Add validation' },
    { file: '02-api.md', line: 5, text: 'nested too' },
  ])
  assert.strictEqual(d.clean, false)
})

test('enumerates phase-index rows that are not ✅, and surfaced follow-ups', () => {
  const d = collectDisposition({ overview: OVERVIEW, phases: [] })
  assert.deepStrictEqual(d.phases, [
    { n: 2, title: 'API', status: '🔄', file: '02-api.md' },
    { n: 3, title: 'Docs', status: '⬜', file: '03-docs.md' },
  ])
  assert.strictEqual(d.followUps.length, 1)
  assert.match(d.followUps[0].text, /port picker/)
})

test('stays silent on a finished spec: everything ticked and ✅ is clean', () => {
  const d = collectDisposition({
    overview: OVERVIEW.replace(/🔄|⬜/g, '✅').replace(/^- .*Follow-up surfaced.*\n/m, ''),
    phases: [{ file: '01-data-model.md', content: '- [x] Done thing\n' }],
  })
  assert.deepStrictEqual(d, { tasks: [], phases: [], followUps: [], clean: true })
})

test('empty input is clean, never a throw', () => {
  assert.strictEqual(collectDisposition({}).clean, true)
  assert.strictEqual(collectDisposition(null).clean, true)
})
