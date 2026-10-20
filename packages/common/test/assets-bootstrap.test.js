'use strict'

/**
 * Every skill that provisions a worktree hands its bootstrap to the engine.
 *
 * WHY IT IS A TEST. The worktree steps — seeding gitignored files, the env
 * file, `setup`, the stack — used to be printed as shell for the agent to run,
 * and the skills said "run what it prints". An agent's copy was never faithful
 * (two seeds merged into a loop, the echo text reworded, two steps in one
 * call), and a consumer's secrets hook refused every rewrite that named a
 * `.env` path. It happened twice before the engine took the steps over. A skill
 * drifting back to "run the printed steps" reopens it, and nothing at run time
 * would say so until the next bootstrap stopped half-way.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')

// The skills that provision a worktree and must therefore bootstrap one.
const PROVISIONING = ['spec', 'spec-start', 'spec-bug', 'spec-hotfix', 'no-spec']

for (const name of PROVISIONING) {
  test(`/${name} runs spec-env bootstrap`, () => {
    assert.match(skillText(name), /skitterspec spec-env bootstrap /)
  })

  test(`/${name} never tells the agent to run printed worktree steps`, () => {
    const text = skillText(name)
    assert.doesNotMatch(text, /then, in the worktree, run:/)
    assert.doesNotMatch(text, /ln -s|git rev-parse --git-common-dir/, 'no seed shell')
  })
}

// STAYS SILENT for a name-matching secrets hook: the exact command each skill
// types gives it nothing to match. A `.env`-shaped token anywhere in one of
// these lines is the failure this verb exists to remove.
test('no bootstrap invocation a skill types names a secret-shaped path', () => {
  const lines = PROVISIONING.flatMap((name) =>
    skillText(name)
      .split('\n')
      .filter((l) => /spec-env bootstrap /.test(l))
      .map((l) => [name, l]),
  )
  assert.ok(lines.length >= PROVISIONING.length, 'found the invocations to check')
  for (const [name, line] of lines) {
    const cmd = line.slice(line.indexOf('spec-env bootstrap'))
    assert.doesNotMatch(cmd.split('`')[0], /\.env\b/, `/${name}: ${line.trim()}`)
  }
})
