'use strict'

/**
 * The `## Manual steps` section parser (feat-manual-steps-on-ticket, phase 1).
 *
 * The section is the only signal: a phase that writes its manual steps inline,
 * the way every spec did before the section existed, must yield nothing — that
 * is the stays-silent case (`.claude/rules/negative-checks.md` rule 3).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { parseManualSteps, manualStepsRange } = require('../src/manual-steps.js')
const { normalizeLocal, readSnapshot } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

const parse = (text) => parseManualSteps(text.split('\n'))

test('a step carries its fenced block, with the list indent taken off', () => {
  const steps = parse(
    [
      '# Phase 3 — Rollout 🔄',
      '',
      '## Tasks',
      '',
      '- [x] Ship the override',
      '',
      '## Manual steps',
      '',
      '- [ ] On Prod, grant the override permission:',
      '',
      '  ```sql',
      "  INSERT INTO permissions (code)",
      "    VALUES ('order-line-override');",
      '  ```',
      '',
      '- [ ] Confirm the override button appears for an admin',
      '',
    ].join('\n'),
  )
  assert.deepStrictEqual(steps, [
    {
      text: 'On Prod, grant the override permission:',
      mark: ' ',
      done: false,
      code: [{ lang: 'sql', body: "INSERT INTO permissions (code)\n  VALUES ('order-line-override');" }],
    },
    { text: 'Confirm the override button appears for an admin', mark: ' ', done: false, code: [] },
  ])
})

test('a step without code, and wrapped step text, read as one logical line', () => {
  const steps = parse(['## Manual steps', '', '- [ ] Open Settings and check the', '      new toggle is on'].join('\n'))
  assert.deepStrictEqual(steps, [{ text: 'Open Settings and check the new toggle is on', mark: ' ', done: false, code: [] }])
})

test('only x is done; a project mark is kept and open', () => {
  const steps = parse(['## Manual steps', '', '- [x] Run it on Demo', '- [X] Run it on Test', '- [~] Run it on Prod', '- [>] Tell support'].join('\n'))
  assert.deepStrictEqual(
    steps.map((s) => [s.mark, s.done]),
    [['x', true], ['x', true], ['~', false], ['>', false]],
  )
})

test('two fences under one step stay two blocks, and other fence styles parse', () => {
  const steps = parse(
    ['## Manual steps', '', '- [ ] Check, then fix:', '  ```kql', '  Events | take 10', '  ```', '  ~~~sh', '  ./fix.sh --yes', '  ~~~'].join('\n'),
  )
  assert.deepStrictEqual(steps[0].code, [
    { lang: 'kql', body: 'Events | take 10' },
    { lang: 'sh', body: './fix.sh --yes' },
  ])
})

test('a nested checkbox belongs to the step above it', () => {
  const steps = parse(['## Manual steps', '', '- [ ] Deploy to Demo', '  - [ ] watch the logs', '- [ ] Deploy to Prod'].join('\n'))
  assert.deepStrictEqual(steps.map((s) => s.text), ['Deploy to Demo', 'Deploy to Prod'])
})

test('the section ends at the next ## heading; a ### inside it stays in', () => {
  const lines = ['## Manual steps', '', '### Prod', '', '- [ ] Run it', '', '## Notes', '', '- [ ] not a step'].join('\n')
  assert.deepStrictEqual(parse(lines).map((s) => s.text), ['Run it'])
  assert.deepStrictEqual(manualStepsRange(lines.split('\n')), { start: 0, end: 6 })
})

test('a section shown inside a fence is an example, not the section', () => {
  const steps = parse(['## Notes', '', '```markdown', '## Manual steps', '', '- [ ] an example step', '```'].join('\n'))
  assert.deepStrictEqual(steps, [])
})

test('the heading matches case-insensitively', () => {
  assert.strictEqual(parse('## manual Steps\n\n- [ ] Run it').length, 1)
})

// --- stays silent -----------------------------------------------------------

test('STAYS SILENT: a legacy phase with inline manual steps yields no steps', () => {
  const steps = parse(
    [
      '# Phase 3 — Rollout 🔄',
      '',
      '## Tasks',
      '',
      '- [x] Ship the override',
      '- [ ] Manual step, by hand:',
      '  1. [x] On Prod, run: `SELECT * FROM permissions`',
      '',
      '```sql',
      'SELECT 1;',
      '```',
    ].join('\n'),
  )
  assert.deepStrictEqual(steps, [])
})

test('STAYS SILENT: an empty section, or one with only prose, yields no steps', () => {
  assert.deepStrictEqual(parse('## Manual steps\n'), [])
  assert.deepStrictEqual(parse('## Manual steps\n\nNone for this phase.\n\n- a plain bullet'), [])
})

// --- through readPhaseFiles -------------------------------------------------

function specDir(phaseBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-manual-steps-'))
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    ['# Spec', '', '## Phases', '', '| # | Phase | Status | File |', '|---|-------|--------|------|', '| 1 | Engine | 🔄 | [01-engine.md](01-engine.md) |', ''].join('\n'),
    'utf-8',
  )
  fs.writeFileSync(path.join(dir, '01-engine.md'), phaseBody, 'utf-8')
  return dir
}

test('readSnapshot carries manualSteps on each phase, and the projection does not', () => {
  const body = ['# Phase 1 — Engine 🔄', '', '## Tasks', '', '- [x] Build it', '', '## Manual steps', '', '- [ ] Run it', '  ```sh', '  ./run.sh', '  ```', ''].join('\n')
  const dir = specDir(body)
  const { phases } = readSnapshot(dir, neutralConfig())
  assert.deepStrictEqual(phases[0].manualSteps, [{ text: 'Run it', mark: ' ', done: false, code: [{ lang: 'sh', body: './run.sh' }] }])
  const projected = normalizeLocal(dir, neutralConfig())
  assert.ok(!JSON.stringify(projected).includes('manualSteps'))
})

test('steps still count as tasks, so progress is unchanged by the section', () => {
  const body = ['# Phase 1 — Engine 🔄', '', '## Tasks', '', '- [x] Build it', '', '## Manual steps', '', '- [ ] Run it', ''].join('\n')
  const { phases } = readSnapshot(specDir(body), neutralConfig())
  assert.strictEqual(phases[0].blocks.filter((b) => b.checkbox).length, 2)
})
