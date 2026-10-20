'use strict'

/**
 * Who runs `afterLand`, and what a failure of it means.
 *
 * The engine only PLANS the after-land section (`env-integrate.test.js`,
 * `env-hotfix.test.js`); a skill runs it. These pin the prose to the decisions
 * in feat-after-land-hook: the three code-landing skills run it, stop at the
 * first failure and report `⚠️` without undoing the land or blocking teardown,
 * and `/spec`'s documents-only land does not run it.
 *
 * WHAT A LATER EDIT WOULD UNDO is the asymmetry — a failure that undoes the
 * land, or teardown that waits on a migration, turns a caveat into a wreck.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')
const SECTION = 'then, in the primary checkout (<path>), run:'

for (const name of ['spec-complete', 'spec-to-main', 'no-spec']) {
  test(`/${name} runs the after-land section, stopping at the first failure`, () => {
    const text = skillText(name)
    assert.ok(text.includes(SECTION), 'names the section the engine prints')
    assert.match(text, /\*\*Stop at the first non-zero\s+exit\*\*/)
    assert.match(text, /\*\*never undoes the land/)
    assert.match(text, /no-op/, 'covers the already-landed case')
  })
}

test('/spec-complete: an after-land failure is ⚠️, lands in Notes, and never blocks teardown', () => {
  const text = skillText('spec-complete')
  assert.match(text, /an after-land\s+command that failed/)
  assert.match(text, /\*\*Fields:\*\* `Tracker` · `Spec` · `Tests` · `Notes`/)
  const teardown = text.slice(text.indexOf('## 7. Tear down'))
  assert.match(teardown, /failed after-land command is \*\*not\*\* a reason to stop/)
})

test('/spec-complete runs it on the hotfix path too', () => {
  const text = skillText('spec-complete')
  const hotfix = text.slice(text.indexOf('### 6-hotfix'), text.indexOf('### 6-feature/bug'))
  assert.match(hotfix, /\*\*Run the after-land commands\*\*/)
})

test('/spec-to-main runs them before the re-test on base, and reports in Notes', () => {
  const text = skillText('spec-to-main')
  const land = text.indexOf('**Then run the after-land commands.**')
  assert.ok(land > 0 && land < text.indexOf('## 5. Re-test on base'))
  assert.match(text, /\*\*Fields:\*\* `Branch` · `Tests` · `Notes`/)
})

test('/spec does not run the after-land section on a documents-only land', () => {
  assert.match(skillText('spec'), /\*\*Do not run its after-land section\.\*\*/)
})
