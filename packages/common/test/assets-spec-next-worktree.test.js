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
  assert.match(NEXT, /spec-env resolve --dir <path>/)
  assert.match(NEXT, /must never become a place to write code/i)
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
  const check = NEXT.indexOf('## 4b. On the `--worktree` path, prove nothing leaked')
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

test('the step is inert when standing in the worktree', () => {
  const step = NEXT.slice(NEXT.indexOf('## 4b.'), NEXT.indexOf('## 5.'))
  assert.match(step, /Only when this run was given `--worktree`/)
})

test('the description no longer promises what the flag undoes', () => {
  // It used to say the skill "never builds a spec it is not standing in", which
  // is exactly what --worktree does. A description that contradicts the body is
  // worse than a vague one: it is what the router reads.
  const front = NEXT.slice(0, NEXT.indexOf('---', 4))
  assert.doesNotMatch(front, /never builds a spec it is not standing in/)
  assert.match(front, /only when handed its worktree path/)
})
