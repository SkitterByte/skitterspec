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

// --- targeting, and the relocation guard (phase 2) --------------------------
//
// The claim is harmless from anywhere — the sidecar lives in the primary
// checkout. What is not harmless is what follows: a `commit` verdict commits and
// `changes` edits files, and done from the wrong tree both land on the wrong
// branch while looking entirely normal at the time.

test('a tracker id is a provider seam, never a guess', () => {
  assert.match(SKILL, /spec-sync linked --json/, 'it asks the provider')
  assert.match(SKILL, /\{ spec, bucket, identifier \}/, 'and matches on identifier')
  // A `SKS-227`-shaped string is not evidence that a tracker exists.
  assert.match(SKILL, /\*\*With no provider installed an id resolves to nothing\*\*/)
  assert.match(SKILL, /is not evidence that a\s*\n?\s*tracker exists/i)
})

test('a different worktree is asked about and moved to, not acted on remotely', () => {
  assert.match(SKILL, /## 1a\. Targeting another spec\? Get into its worktree first/)
  assert.match(SKILL, /\*\*Same tree — say nothing and carry on\.\*\*/, 'the ordinary case is silent')
  assert.match(SKILL, /\*\*ask, then move\*\*/)
  // A plain `cd`, for the reason /spec-start gives: an approval prompt is
  // unusable on a phone.
  assert.match(SKILL, /plain `cd "<worktreePath>"`/)
  assert.match(SKILL, /unusable on a phone/)
})

// A "no" must not leave a spent code and an unacted pass. That split is the
// exact thing the guard exists to prevent, so declining has to happen BEFORE
// the claim, not after it.
test('declining the move claims nothing', () => {
  assert.match(SKILL, /\*\*On a no, stop without claiming\.\*\*/)
  assert.match(SKILL, /claiming first would spend\s*\n?\s*the code for nothing/i)
  const guard = SKILL.indexOf('## 1a.')
  const claim = SKILL.indexOf('--claim <code>')
  assert.ok(guard !== -1 && claim !== -1 && guard < claim, 'the guard precedes the claim')
})

test('the move is confirmed rather than assumed', () => {
  // `.claude/rules/negative-checks.md` rule 1 — ask for a positive signal. A cd
  // that silently did not take leaves the next command acting on this tree.
  assert.match(SKILL, /confirm the move landed\*\* rather than assuming it/i)
  assert.match(SKILL, /negative-checks\.md` rule 1/, 'it cites the rule it is applying')
  assert.match(SKILL, /do not claim a pass you are about to act on from a tree you could not\s*\n?\s*confirm/i)
})

test('a target with no worktree refuses, and the refusal is reported', () => {
  assert.match(SKILL, /\*\*A target with no worktree is a refusal\.\*\*/)
  assert.match(SKILL, /nowhere for a commit to\s*\n?\s*land/i)
  // ⏸ covers every "nothing changed" ending, so a reader can tell them from ❌.
  assert.match(SKILL, /they declined the move to another spec's worktree, or the target has no\s*\n?\s*worktree at all/)
})

test('the rejected alternative is recorded, not silently dropped', () => {
  // "Only from the base branch" was the other candidate and is worse: it bans a
  // legitimate case while still leaving the work to be done elsewhere.
  assert.match(SKILL, /\*\*Why not simply refuse unless you are on the base branch\?\*\*/)
  assert.match(SKILL, /the relocation is\s*\n?\s*needed either way/i)
})

test('a run that moves the session says where it moved to', () => {
  assert.match(SKILL, /`Worktree` appears only when this run \*\*moved the session\*\*/)
  assert.match(SKILL, /A run that stayed put omits it/)
})
