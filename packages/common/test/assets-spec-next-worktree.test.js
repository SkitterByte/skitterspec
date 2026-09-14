'use strict'

// `/spec-next --worktree <path>` — building a spec from a session that is not
// standing in it.
//
// The skill's whole safety story is a refusal: it will not guess which spec to
// build, because building the wrong one writes commits nobody asked for. This
// flag has to coexist with that, and the way it does is by being EXPLICIT — a
// path someone typed is not a guess. These tests hold both halves in place: the
// new path is documented and validated, and the old refusal is untouched.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')
const NEXT = skillText('spec-next')

test('the explicit worktree path is documented, and answers first', () => {
  assert.match(NEXT, /`--worktree <path>` answers before anything else/)
  assert.match(NEXT, /cwd is not\s*\n?consulted/i)
  assert.match(NEXT, /Otherwise resolve \*\*in this order\*\*/)
})

test('it says why this is not a loosening of the refusal', () => {
  // Without the reasoning, the next person to read the flag next to the refusal
  // concludes one of them is a bug and removes it.
  assert.match(NEXT, /not a loosening/i)
  assert.match(NEXT, /guessing/i)
  assert.match(NEXT, /bare\s*\n?`\/spec-next` still refuses/i)
})

// THE REFUSAL ITSELF. The flag sits above these; it must not have touched them.
test('rules 1-3 and the in-context refusal are intact', () => {
  assert.match(NEXT, /The live spec of this checkout/)
  assert.match(NEXT, /The worktree you are standing in/)
  assert.match(NEXT, /The current branch, in `checkout` mode/)
  assert.match(NEXT, /no spec in flight — run \/spec-start <name> to start one/)
  assert.match(NEXT, /Never fall back to the spec "in context"/)
})

test('a path that is not a provisioned worktree is refused, not built in', () => {
  assert.match(NEXT, /cd "<path>" && skitterspec spec-env resolve/)
  assert.match(NEXT, /must never become a place\s+to write code/i)
})

// This test previously asserted `spec-env resolve --dir <path>`, and so pinned a
// command that cannot validate anything: `--dir` sets the REPO ROOT, and on a
// repo with two or more worktrees the resolver refuses with "no spec given, and
// N specs have worktrees". The step read as validated for as long as the test
// agreed with it, which is the failure mode a prose test invites — so this one
// asserts the flag is named as NOT the answer, rather than only asserting the
// right command is present somewhere in the file.
test('the flag that cannot validate a path is named as not the answer', () => {
  assert.match(NEXT, /\*\*Not `--dir <path>`\.\*\*/)
  assert.match(NEXT, /sets the \*\*repo root\*\*/)
  assert.match(NEXT, /no spec given, and N specs have worktrees/)
})

// The engine reports "isolation not enabled" and exits 0, so a skill checking
// only the status code would accept any directory on the machine as a worktree.
test('the validation says to read the output, not the exit status', () => {
  assert.match(NEXT, /\*\*Read the output, not the exit status\*\*/)
  assert.match(NEXT, /exits 0 even when it\s+cannot resolve/i)
})

test('the remote-build discipline is spelled out, not implied', () => {
  assert.match(NEXT, /absolute path under it/i)
  assert.match(NEXT, /cd "<worktreePath>" &&/)
  assert.match(NEXT, /typecheck and tests/i)
})

test('the baseline is recorded before anything is written', () => {
  const record = NEXT.indexOf('--record-primary')
  const build = NEXT.indexOf('Then build it, following the project rules')
  assert.ok(record !== -1 && build !== -1, 'both steps are present')
  assert.ok(record < build, 'a baseline taken after the writes would record the leak as normal')
})

test('the leak check runs after progress is recorded and before the report', () => {
  const progress = NEXT.indexOf('## 4. Record progress')
  const check = NEXT.indexOf('## 4b. Prove nothing leaked into the primary checkout')
  const report = NEXT.indexOf('## 6. Report')
  assert.ok(check !== -1, 'the step exists')
  assert.ok(progress < check, 'recording progress writes files too, so it is inside the window')
  assert.ok(check < report, 'nothing is reported done before it is known to be in the right tree')
})

// The guard sees paths appear; it cannot see who wrote them. A skill that reads
// its non-zero exit as "your build did this" turns a report into an instruction
// to delete someone else's work.
test('the leak step forbids guessing and deleting', () => {
  const step = NEXT.slice(NEXT.indexOf('## 4b.'), NEXT.indexOf('## 5.'))
  assert.match(step, /Do not guess which,\s*\n?and do not delete anything/i)
  assert.match(step, /not proof of who put it/i)
})

test('a cannot-tell verdict is carried on from, not treated as a failure', () => {
  const step = NEXT.slice(NEXT.indexOf('## 4b.'), NEXT.indexOf('## 5.'))
  assert.match(step, /cannot tell/i)
  assert.match(step, /carry on/i)
  assert.match(step, /An absence is not evidence/i)
})

// The test name was always the intended condition; the assertion underneath it
// pinned the wrong one. Gating on the FLAG left rung 4 — a bare `/spec-next`
// resolving the sole provisioned spec from the primary checkout — building into
// a second tree with no discipline and no check, because the flag cannot see it.
test('the step is inert when standing in the worktree', () => {
  const step = NEXT.slice(NEXT.indexOf('## 4b.'), NEXT.indexOf('## 5.'))
  assert.match(step, /Only when the resolved worktree is not this session's cwd/)
  assert.match(step, /no second tree to have written into/i)
  assert.doesNotMatch(step, /Only when this run was given/)
})

test('the description no longer promises what the flag undoes', () => {
  // It used to say the skill "never builds a spec it is not standing in", which
  // is exactly what --worktree does. A description that contradicts the body is
  // worse than a vague one: it is what the router reads.
  const front = NEXT.slice(0, NEXT.indexOf('---', 4))
  assert.doesNotMatch(front, /never builds a spec it is not standing in/)
  // Nor may it promise the flag is the only way elsewhere — rung 4 made that
  // false the day it landed, and the description is what the router reads.
  assert.doesNotMatch(front, /only when handed its worktree path/)
  assert.match(front, /builds wherever that spec resolves/)
})

// ---------------------------------------------------------------------------
// The discipline follows the worktree, not the flag.
//
// `--worktree` is one way to build into a tree you are not standing in; §1's
// rung 4 is another, and it arrived later. Conditioning §3 and §4b on the flag
// meant a bare `/spec-next` typed from the primary checkout got neither the
// `cd` discipline nor the leak check — the one route where being wrong writes a
// phase onto the base branch and looks entirely normal at the time.

const SECTION_3 = NEXT.slice(NEXT.indexOf('## 3. Implement the phase'), NEXT.indexOf('## 4. Record progress'))
const SECTION_4B = NEXT.slice(NEXT.indexOf('## 4b.'), NEXT.indexOf('## 5.'))

test('the discipline is conditioned on the two trees, not on the invocation', () => {
  assert.match(SECTION_3, /compare the worktree against where you are standing/i)
  assert.match(SECTION_3, /however the spec was resolved/i)
  assert.match(SECTION_3, /rung 4/)
  // The old gating, in both halves. Either one left behind re-opens the gap.
  assert.doesNotMatch(SECTION_3, /On the `--worktree` path, record the baseline/)
  assert.doesNotMatch(SECTION_4B, /Only when this run was given `--worktree`/)
})

test('the comparison is told how to make itself', () => {
  // "Compare the worktree with cwd" is not actionable on its own: two spellings
  // of one tree must not read as two, or the guard fires on the healthy case.
  assert.match(SECTION_3, /`worktree:` line/)
  assert.match(SECTION_3, /resolving both paths first/i)
  assert.match(SECTION_3, /symlinked or\s*\n?trailing-slash/i)
})

// STAYS SILENT (`negative-checks.md` rule 3). The common tree is one tree: the
// session is standing in the worktree after `/spec-start`, and in `checkout`
// mode there is no second tree at all. Both must cost nothing and claim nothing.
// The engine agrees — `compare()` returns `unknown` when the worktree IS the
// primary checkout (`env-building.test.js`) — and the skill must not contradict it.
test('one tree leaves both the discipline and the check inert', () => {
  assert.match(SECTION_3, /the rest of this step is inert/i)
  assert.match(SECTION_4B, /this step does not\s*\n?apply and there is nothing to check/i)
})

// `negative-checks.md` rule 2 — name what would fool the check, beside it.
test('the check names the tree it cannot see', () => {
  assert.match(SECTION_4B, /WHAT WOULD FOOL THIS CHECK/)
  assert.match(SECTION_4B, /primary checkout/)
  assert.match(SECTION_4B, /another\*? spec's worktree/i)
  // Biased the safe way: the gap costs a missed leak, never a wrong accusation.
  assert.match(SECTION_4B, /never a false accusation/i)
})
