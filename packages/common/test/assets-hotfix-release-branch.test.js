'use strict'

/**
 * The branch-based hotfix reaches the operator through the skills they already
 * run. The engine prints the lines (`cli-spec-env-up-release-branch.test.js`,
 * `env-hotfix-branch-land.test.js`); these pin the prose to
 * feat-hotfix-to-master: `/spec-hotfix` asks for no tag and copies the engine's
 * `record:` line rather than composing a Base version, and `/spec-complete`
 * reports the release branch, the PR wait and the carry.
 *
 * WHAT A LATER EDIT WOULD UNDO is the copying. A skill that wrote the header
 * itself could name a sha the worktree did not fork from — the record and the
 * fork disagreeing is the exact failure the engine printing the line prevents.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const read = (...p) => fs.readFileSync(path.join(ASSETS, ...p), 'utf8')

test('/spec-hotfix: a release branch asks for no tag and copies the record line verbatim', () => {
  const text = read('skills', 'spec-hotfix', 'SKILL.md')
  assert.match(text, /`hotfix\.releaseBranch`[^]*there is \*\*no tag to ask for\*\*/)
  assert.ok(text.includes('`record:  > **Base version:** <branch>@<sha>`'))
  assert.match(text, /copies that `record:`\s+value into the header \*\*verbatim\*\*/)
})

test('/spec-complete: the branch-based land names the release branch, the PR wait and the carry', () => {
  const text = read('skills', 'spec-complete', 'SKILL.md')
  assert.match(text, /\*\*A branch-based hotfix\*\*/)
  assert.match(text, /opens a \*\*ready\*\* PR/)
  assert.match(text, /A PR still\s+waiting on its merge is a `⚠️`/)
  assert.match(text, /`Landed` then names the release branch/)
})

test('env.config.md documents releaseBranch, tag and the rc-flow example', () => {
  const text = read('core', 'env.config.md')
  assert.ok(text.includes('"releaseBranch": ""'))
  assert.ok(text.includes('"tag": true'))
  assert.match(text, /Test\/Demo\/Live {2}env branches that take merges from master — OUT OF SCOPE/)
  assert.match(text, /`releaseWith` refuses/)
})
