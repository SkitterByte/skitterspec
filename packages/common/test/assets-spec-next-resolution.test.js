'use strict'

// `/spec-next` resolving the spec to build when the session is not standing in
// it — and refusing when the repo genuinely cannot answer.
//
// The skill's first three rungs all read SESSION state: which branch is live in
// this checkout, which directory this shell is in, which branch is out. Session
// state is lost by a `/clear`, by a new terminal tab, and by coming back
// tomorrow — while the thing it is a proxy for, a provisioned worktree, is on
// disk and survives all three. Reading the absence of session state as "no spec
// in flight" is the absence-as-evidence mistake `negative-checks.md` rule 1 is
// about: the lookup was narrower than the claim it fed.
//
// So there is a fourth rung, and it is the engine's own resolution — the one
// `spec-planning.md` documents as universal ("omit the spec name anywhere and it
// uses the worktree you are standing in, else the sole provisioned spec"). These
// tests hold that rung in place WITHOUT loosening the refusal: one worktree is
// an answer, several is still a refusal, and a spec merely discussed in chat is
// still never one.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')
const NEXT = skillText('spec-next')
const START = skillText('spec-start')
const PLANNING = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-planning.md'), 'utf8')

test('a fourth rung asks the engine, with no spec named', () => {
  assert.match(NEXT, /4\. \*\*The only spec provisioned in this repo\*\*/)
  assert.match(NEXT, /skitterspec spec-env resolve/)
  assert.match(NEXT, /only when it names exactly one spec/i)
})

test('it says why the session-local rungs are not enough on their own', () => {
  // Without the reasoning this rung reads as redundant with rule 2 and gets
  // deleted by the next person tidying the list.
  assert.match(NEXT, /durable/i)
  assert.match(NEXT, /`\/clear`/)
  assert.match(NEXT, /new terminal tab/i)
  assert.match(NEXT, /on disk/i)
})

test('the rung is the same resolution the rest of the workflow already uses', () => {
  assert.match(NEXT, /sole provisioned spec/i)
  // The rule file claims this resolution has no exceptions left. /spec-next was
  // one, silently, which is the bug.
  assert.match(PLANNING, /else the sole provisioned spec/)
})

test('several worktrees stay a refusal, not a pick', () => {
  assert.match(NEXT, /several worktrees/i)
  assert.match(NEXT, /relay/i)
  // Wrap-tolerant: the prose hard-wraps at 80, and where it breaks is not the
  // contract.
  assert.match(NEXT, /resolves\s+nothing/i)
})

test('what would fool the rung is named beside it', () => {
  // negative-checks.md rule 2. A worktree left by a declined teardown still
  // counts as provisioned — that over-reports into ambiguity (a refusal), never
  // into building the wrong spec.
  assert.match(NEXT, /declined teardown|left behind/i)
  assert.match(NEXT, /never a wrong spec|never the wrong spec/i)
})

test('the resolved spec is announced before any code is written', () => {
  const say = NEXT.search(/\*\*Say which spec you resolved/i)
  const build = NEXT.indexOf('## 3. Implement the phase')
  assert.ok(say !== -1, 'the rung announces what it picked')
  assert.ok(build !== -1 && say < build, 'announced before the build, not in the final report')
})

// THE REFUSAL ITSELF. The new rung sits above it; it must not have touched it.
test('rules 1-3, the refusal and the in-context ban are intact', () => {
  assert.match(NEXT, /The live spec of this checkout/)
  assert.match(NEXT, /The worktree you are standing in/)
  assert.match(NEXT, /The current branch, in `checkout` mode/)
  assert.match(NEXT, /no spec in flight — run \/spec-start <name> to start one/)
  assert.match(NEXT, /Never fall back to the spec "in context"/)
})

test('a worktree on disk is distinguished from a spec merely discussed', () => {
  // The distinction that makes rung 4 safe and the in-context fallback unsafe:
  // one is a record that someone ran /spec-start, the other is conversation.
  assert.match(NEXT, /ran `?\/spec-start`?/i)
})

test('ordering: standing in a worktree still wins over the repo-wide answer', () => {
  const rule2 = NEXT.indexOf('**The worktree you are standing in**')
  const rule4 = NEXT.indexOf('**The only spec provisioned in this repo**')
  const refusal = NEXT.indexOf('no spec in flight — run /spec-start <name> to start one')
  assert.ok(rule2 !== -1 && rule4 !== -1 && refusal !== -1, 'all three are present')
  assert.ok(rule2 < rule4, 'a session standing somewhere specific is never overruled by the repo')
  assert.ok(rule4 < refusal, 'the refusal is what is left after every rung has been tried')
})

test('/spec-start no longer promises something only this session can keep', () => {
  // Its step 6 "no" ending tells the operator to type /spec-next whenever they
  // like. That was true only until the context was cleared; rung 4 is what makes
  // it true, and spec-start should say so rather than rest on the cd.
  assert.match(START, /convenience|not the only/i)
  assert.match(START, /rule 4|fourth rung/i)
  // And the claim it must NOT have quietly dropped.
  assert.match(START, /nothing\s*\n?about rules 1 to 3 is loosened/i)
})
