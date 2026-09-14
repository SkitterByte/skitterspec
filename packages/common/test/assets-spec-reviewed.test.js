'use strict'

/**
 * Guards for `/spec-reviewed` — and one of them is not about prose at all.
 *
 * This skill is the enforcement of `/spec-diff` step 0's rule that a waiting
 * review pass is never claimed unasked. A pass can be POSTed by anything that
 * reaches the page; what it cannot reach is the conversation. The rule held only
 * as prose before, and prose did not hold it — an agent found a waiting
 * approval, read its code off disk and claimed it.
 *
 * `disable-model-invocation` is what makes it hold now, which is why the first
 * test here is worth more than the rest put together.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..', '..')
const SKILL = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'skills', 'spec-reviewed', 'SKILL.md'),
  'utf8',
)

// THE ONE THAT MATTERS. If this skill becomes model-invocable, the model can
// decide on its own to go and pick up a waiting pass — which is the entire
// failure `feat-claim-by-confirmation` was written about, restored.
test('the skill is user-only, and says why that is the security mechanism', () => {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(SKILL)
  assert.ok(fm, 'parseable frontmatter')
  assert.match(fm[1], /^disable-model-invocation:\s*true$/m, 'the model cannot invoke it')
  // Marked without the reason, a later edit reads it as tidiness and removes it.
  assert.match(SKILL, /not ergonomics here/i)
  assert.match(SKILL, /\*\*the model cannot invoke this skill\*\*/)
  assert.match(SKILL, /A later edit that makes this skill\s*\n?\s*model-invocable/i)
})

test('it reads the code off the render, never out of the store', () => {
  assert.match(SKILL, /\*\*Never open `\.spec-env\/reviews\/<spec>\.pending\.json`\.\*\*/)
  // The reason, not just the prohibition: the file is readable, which is why
  // the rule is written down rather than assumed.
  assert.match(SKILL, /that\s*\n?\s*is precisely why the rule is written down/i)
  assert.match(SKILL, /spec-env review <spec>/, 'it names the command that answers instead')
})

test('it offers by naming the code, and refuses to guess between two', () => {
  assert.match(SKILL, /\*\*Name the code\.\*\*/)
  assert.match(SKILL, /only part the operator can check against their\s*\n?\s*screen/i)
  assert.match(SKILL, /\*\*Two or more waiting is a refusal to guess\.\*\*/)
  assert.match(SKILL, /Never take the newest, the oldest, or the only `approve`/)
})

// It must POINT at the routing rather than restate it. Two copies of a routing
// rule is how the two come to disagree — and this skill and `/spec-diff` act on
// the same verdicts for the same reasons.
test('it points at /spec-diff for the routing rather than copying it', () => {
  assert.match(SKILL, /exactly as `\/spec-diff` §2 does/)
  assert.match(SKILL, /do not restate it here/i)
  assert.match(SKILL, /two copies of a\s*\n?\s*routing rule/i)
  // A copy would name the verdicts and what each does; this must not.
  assert.doesNotMatch(SKILL, /`changes` is the go-ahead/i, 'the routing is not duplicated')
})

test('nothing waiting is an ordinary answer, not a problem', () => {
  assert.match(SKILL, /\*\*Nothing waiting is an ordinary answer\.\*\*/)
  assert.match(SKILL, /Do not hunt through\s*\n?\s*other specs/i)
  // A `file://` page never posts, so the pass may be on their clipboard.
  assert.match(SKILL, /clipboard/i)
})

test('it ships where the docs say it does', () => {
  // A skill nobody is told about is a skill nobody types, and this one can only
  // ever be typed.
  const planning = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'rules', 'spec-planning.md'),
    'utf8',
  )
  assert.match(planning, /\| `\/spec-reviewed` \|/, 'the skill table lists it')
  assert.match(planning, /`\/spec-reviewed` is a \*\*skill\*\* and \*\*user-only\*\*/)
  const init = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'skills', 'spec-init', 'SKILL.md'),
    'utf8',
  )
  assert.match(init, /`spec-reviewed`/, 'spec-init names it among what it ships')
})

// STAYS SILENT (`negative-checks.md` rule 3). Adding a skill must not change
// what the others say — the guards above are about this file, and a green run
// of the whole corpus is what proves the rest were left alone.
test('stays silent: the skill installs by discovery, with no list to register in', () => {
  const init = fs.readFileSync(path.join(__dirname, '..', 'src', 'init.js'), 'utf8')
  // Skills are read from the bundled tree, so shipping one is a folder rather
  // than an edit — and a hardcoded roster here would be a second place to drift.
  assert.match(init, /readdirSync/, 'skills are discovered')
  assert.doesNotMatch(init, /'spec-reviewed'/, 'and not enumerated in code')
  assert.ok(
    fs.existsSync(path.join(ROOT, 'packages', 'common', 'assets', 'skills', 'spec-reviewed', 'SKILL.md')),
    'the folder is the installation',
  )
})
