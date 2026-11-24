'use strict'

/**
 * Everything skitterspec installs that Claude Code loads into EVERY session
 * stays within 30,000 characters, in every distribution.
 *
 * Claude Code warns once a project's instruction files pass 150k characters in
 * total, and the host project owns most of that: its own CLAUDE.md, its own
 * rules. Before feat-rules-budget the managed rules alone were ~126k, mostly
 * rationale and amendment history, and a host could not trim them without
 * tripping the manifest's hash guard. Growth happened one reasonable paragraph
 * at a time, so this is a budget rather than a review question: new detail
 * goes in a skill's supporting file, a `paths:`-scoped rule, or
 * docs/rationale/, never into an always-loaded rule.
 *
 * Measured on a fresh install from each BUILT distribution (`pnpm build`), so
 * the provider's own commit-trailers.md is counted where it ships.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BUDGET = 30000
const PKGS = path.join(__dirname, '..', '..')
// Parked distributions (scripts/parked.json) are not built, so not measured.
const { active } = require('../../../scripts/parked.js')
const DISTS = active(['skitterspec', 'skitterspec-github', 'skitterspec-linear', 'skitterspec-jira', 'skitterspec-azure-boards'])

for (const dist of DISTS) {
  test(`${dist}: always-loaded instructions stay within ${BUDGET} chars`, async () => {
    const src = path.join(PKGS, dist, 'src', 'init.js')
    assert.ok(fs.existsSync(src), `${dist} is built (pnpm build)`)
    const lib = require(src)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-budget-'))
    const orig = process.stdout.write
    process.stdout.write = () => true
    try {
      await lib.init({ dir, force: false, claudeMd: true, mode: 'init' })
    } finally {
      process.stdout.write = orig
    }
    const { rows, total } = lib.alwaysLoaded(dir)
    fs.rmSync(dir, { recursive: true, force: true })
    // A positive precondition: an empty measure would pass trivially.
    assert.ok(rows.some((r) => r.path.endsWith('spec-planning.md')), 'the core rule was measured')
    assert.ok(
      total <= BUDGET,
      `${total} chars always loaded, over the ${BUDGET} budget:\n` +
        rows.map((r) => `  ${String(r.chars).padStart(6)}  ${r.path}`).join('\n') +
        '\nMove detail into a skill supporting file, a paths:-scoped rule, or docs/rationale/.',
    )
  })
}
