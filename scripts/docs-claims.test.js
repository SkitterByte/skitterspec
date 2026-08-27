'use strict'

/**
 * The outward-facing surfaces must not contradict the engine.
 *
 * When tasks stopped being individual issues and started being a checklist
 * inside each sub-issue, the claim "tasks are not synced" was corrected in the
 * package assets — and left standing in the npm README and on the GitHub Pages
 * landing page, including a mapping diagram that visually labelled task
 * checkboxes "repo only". Those are the first things a prospective user reads,
 * so a correct engine described by a wrong README is still a wrong product.
 *
 * This guards the specific retired claims by phrase. It is deliberately narrow:
 * saying tasks are not individually *issues* is still true and must stay
 * sayable, so only the "stays in the repo / not synced" framing is forbidden.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

// Everything a reader meets before they install anything.
const SURFACES = [
  'README.md',
  'docs/index.html',
  'packages/skitterspec-linear/README.md',
  'packages/skitterspec/README.md',
  'packages/common/README.md',
  'packages/linear/assets/core/linear.config.md',
  'packages/linear/assets/core/SETUP.md',
]

// Retired claims, as phrases a human would actually write.
const RETIRED = [
  /tasks?\s+(are|is)\s+\*{0,2}not\*{0,2}\s+synced/i,
  /tasks?\s+stay\s+in\s+the\s+(repo|phase file)/i,
  /tasks?\s+live\s+only\s+in\s+the\s+repo/i,
]

test('no shipped surface still claims tasks are not synced', () => {
  const hits = []
  for (const rel of SURFACES) {
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    const lines = fs.readFileSync(abs, 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const re of RETIRED) {
        if (re.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`)
      }
    })
  }
  assert.deepStrictEqual(hits, [], `retired task-sync claim still shipped:\n${hits.join('\n')}`)
})

test('the guard would actually fire on the phrasing it retires', () => {
  // A guard that matches nothing is worse than no guard — it reads as coverage.
  const samples = [
    'Tasks are **not** synced — they stay in the repo phase files.',
    'tasks stay in the repo',
    'Tasks live only in the repo phase files.',
  ]
  for (const s of samples) {
    assert.ok(RETIRED.some((re) => re.test(s)), `should have matched: ${s}`)
  }
})

test('the guard leaves the still-true framing sayable', () => {
  // "not an issue per task" is exactly what we DO want the docs to say.
  const fine = [
    'No issue is created per task and nothing is read back.',
    "A phase's tasks are mirrored into its sub-issue description, never as issues of their own.",
    'Tasks are mirrored, not synced.',
  ]
  for (const s of fine) {
    assert.ok(!RETIRED.some((re) => re.test(s)), `false positive on: ${s}`)
  }
})
