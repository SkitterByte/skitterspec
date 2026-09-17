'use strict'

/**
 * `/allow-main` — the guard's exit, and the one command whose user-only marking
 * is a security property rather than a convenience.
 *
 * `/spec-connect`, `/spec-live` and `/spec-remote-review` are marked
 * `disable-model-invocation` because there is no judgment to apply. This one is
 * marked that way because **Claude must not be able to lift a guard aimed at
 * Claude** — the same line `/spec-reviewed` draws, and one that
 * `spec-planning.md` already records prose alone failed to hold once.
 *
 * So the marking is asserted, and so is the asymmetry it sits in: `/no-spec` is
 * model-invocable, because moving work OFF the base branch is exactly what
 * Claude should do unprompted.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const COMMAND = path.join(ASSETS, 'commands', 'allow-main.md')
const TEXT = fs.readFileSync(COMMAND, 'utf8')
const NOSPEC = fs.readFileSync(path.join(ASSETS, 'skills', 'no-spec', 'SKILL.md'), 'utf8')
const PLANNING = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-planning.md'), 'utf8')
const HOOK = fs.readFileSync(path.join(ASSETS, 'hooks', 'main-guard.cjs'), 'utf8')

// --- the marking, and the asymmetry it sits in ------------------------------

test('it is user-only, and /no-spec deliberately is not', () => {
  assert.match(TEXT, /^disable-model-invocation: true$/m)
  assert.doesNotMatch(NOSPEC, /disable-model-invocation/)
})

test('it says why the marking is load-bearing here', () => {
  assert.match(TEXT, /Only you can run this, and that is the whole guard/)
  assert.match(TEXT, /a guard the model can lift is decoration/i)
  assert.match(TEXT, /same line `\/spec-reviewed` draws/)
})

test('it pre-executes one engine verb and relays it, like the other commands', () => {
  assert.match(TEXT, /^!`\{\{exec\}\} skitterspec spec-env main allow \$ARGUMENTS`$/m)
  assert.match(TEXT, /Relay the engine output above verbatim\. Add nothing and run nothing else\./)
  assert.match(TEXT, /^allowed-tools: Bash\(\{\{exec\}\} skitterspec spec-env main allow:\*\)$/m)
})

// --- what it tells the reader ------------------------------------------------

test('it asks for a reason, and says what the reason is for', () => {
  assert.match(TEXT, /\*\*Give it a reason\.\*\*/)
  assert.match(TEXT, /bare\nrecords `none given`/)
  // The same argument the Gating header rests on: a reason can be argued with,
  // silence cannot.
  assert.match(TEXT, /the part a reviewer can argue with/)
})

test('it does not let a bare "allowed" read as temporary', () => {
  assert.match(TEXT, /It lapses with the session where it can/)
  assert.match(TEXT, /degrades to a repo-wide allow that outlives the session/)
  assert.match(TEXT, /do not read a bare\n"allowed" as temporary/)
})

test('it says this writes nothing anyone else pulls, unlike /spec-remote-review', () => {
  // The consequence a reader would not guess from the name — and the contrast
  // matters, because the neighbouring command does the opposite.
  assert.match(TEXT, /machine-local and gitignored/)
  assert.match(TEXT, /Unlike `\/spec-remote-review`/)
  assert.match(TEXT, /guards\.mainIsLandingZone/)
  assert.match(TEXT, /a different, committed\ndecision/)
})

// --- the hook ---------------------------------------------------------------

test('the hook decides nothing itself', () => {
  assert.match(HOOK, /THIS SCRIPT DECIDES NOTHING/)
  assert.match(HOOK, /spec-env main check/)
  assert.match(HOOK, /--session/)
})

test('the hook fails open on every path, and says so at the top', () => {
  assert.match(HOOK, /IT FAILS OPEN, EVERYWHERE/)
  assert.match(HOOK, /if \(result\.error \|\| result\.status === null\) allow\(\)/)
  assert.match(HOOK, /if \(result\.status !== 1\) allow\(\)/)
})

test('the hook names the blind spot it does not cover', () => {
  // `.claude/rules/negative-checks.md` rule 2: what would fool this, written
  // beside the check while the author still knows why it is safe.
  assert.match(HOOK, /WHAT WOULD FOOL THIS/)
  assert.match(HOOK, /heredoc, `sed -i`, an editor outside the session/)
  assert.match(HOOK, /left unguarded on\s*\n?\/\/ purpose/)
})

test('the hook guards the first write, and says why not the commit', () => {
  assert.match(HOOK, /IT REFUSES THE FIRST WRITE, NOT THE COMMIT/)
  assert.match(HOOK, /cannot `switch -c` out from\s*\n?\s*\* under the other worktrees/)
})

// --- the rule ---------------------------------------------------------------

test('spec-planning.md carries the guard, its signal and its exits', () => {
  assert.match(PLANNING, /\*\*`\/allow-main` is the fourth command\.\*\*/)
  assert.match(PLANNING, /main-guard\.cjs/)
  assert.match(PLANNING, /positive signal/)
  assert.match(PLANNING, /every cannot-tell allows the write in silence/)
  assert.match(PLANNING, /skitterspec spec-env main\n<check\|allow\|status>/)
  assert.match(PLANNING, /guards\.mainIsLandingZone/)
})

test('spec-planning.md says the allowlist is empty by construction', () => {
  assert.match(PLANNING, /There is \*\*no allowlist\*\*/)
  assert.match(PLANNING, /empty by construction rather than by\nomission/)
  // The apparent exception, named and dismissed.
  assert.match(PLANNING, /`\/spec-init` looks\nlike the exception and is not one/)
})

test('spec-planning.md states the two exits and that they are not equal', () => {
  assert.match(PLANNING, /\*\*Two exits, and they are not equal\.\*\*/)
  assert.match(PLANNING, /Claude takes those on its own/)
  assert.match(PLANNING, /only a person can type it/)
})
