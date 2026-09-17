'use strict'

/**
 * `/no-spec` — the lane for work that genuinely has none.
 *
 * WHAT IT IS FOR, and the two failures it closes. Mechanical work — a version
 * bump, a lockfile refresh, a rename — does not warrant a spec, and writing a
 * one-phase document for it produces a spec nobody reads. Doing it on the base
 * branch instead costs two things: the tree is left dirty, so every in-flight
 * spec has to replay over it and a release cannot be cut; and no page is ever
 * rendered, so it is the one kind of change that lands unreviewed.
 *
 * It is also what makes the guard in the next phase a push rather than a wall.
 * A refusal with nowhere to send anyone gets switched off wholesale, which is
 * the failure `review-gate.cjs`'s own header records — so this skill has to
 * exist, and be model-invocable, before that guard ships.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')

const NOSPEC = skillText('no-spec')
const PLANNING = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-planning.md'), 'utf8')

// --- it ships, and it ships invocable ---------------------------------------

test('it is model-invocable, unlike /allow-main will be', () => {
  // The asymmetry is the design: Claude may move work OFF the base branch on
  // its own, and may never lift the guard ON it.
  assert.doesNotMatch(NOSPEC, /disable-model-invocation/)
})

test('its description says what it is for without the word "spec" doing the work', () => {
  assert.match(NOSPEC, /^---\nname: no-spec\n/)
  assert.match(NOSPEC, /description: .*no spec/)
  assert.match(NOSPEC, /Never on the base branch/)
})

// --- why it is not spec --quick ---------------------------------------------

test('it states the rejected alternative by name', () => {
  assert.match(NOSPEC, /`spec --quick` would have been/)
  assert.match(NOSPEC, /a spec nobody reads/)
})

test('it says what doing this on the base branch costs, in both halves', () => {
  assert.match(NOSPEC, /the tree is left\s*\n?dirty/)
  assert.match(NOSPEC, /a release cannot be\s*\n?cut/)
  assert.match(NOSPEC, /no page is ever rendered, so the work gets no review at all/)
})

test('it writes no spec and mints no ticket, said explicitly', () => {
  assert.match(NOSPEC, /It writes no spec, moves nothing through the lifecycle, and mints no ticket/)
  assert.match(NOSPEC, /no `Refs:` trailer/)
  assert.match(NOSPEC, /the work wanted `\/spec`/)
})

// --- the name and the record -------------------------------------------------

test('it asks for a name rather than inventing one', () => {
  assert.match(NOSPEC, /\*\*Ask if none was given\.\*\* Do not invent one/)
  assert.match(NOSPEC, /a branch\s*\n?nobody recognises a week later/)
})

test('it provisions through the engine, and says why the record matters', () => {
  assert.match(NOSPEC, /skitterspec spec-env nospec <name>/)
  assert.match(NOSPEC, /\*\*The record is not bookkeeping\.\*\*/)
  assert.match(NOSPEC, /the only thing that makes a name with\s*\n?nothing under `specs\/\*\*` resolvable/)
})

test('the cd is confirmed, never assumed', () => {
  assert.match(NOSPEC, /negative-checks\.md` rule 1/)
  assert.match(NOSPEC, /`skitterspec spec-env resolve` with\s*\n?no argument must name this branch/)
  assert.match(NOSPEC, /everything looks normal at the time/)
})

// --- the page ---------------------------------------------------------------

test('it renders with its own button set and arms the gate', () => {
  assert.match(NOSPEC, /skitterspec spec-env review <name> --buttons nospec --run-reviewers/)
  assert.match(NOSPEC, /skitterspec spec-env review arm <name>/)
})

test('it says why it arms where /spec does not', () => {
  // The asymmetry is the rule in spec-reports.md rather than a choice made here.
  assert.match(NOSPEC, /\*\*This skill arms, and `\/spec` does not\.\*\*/)
  assert.match(NOSPEC, /\*finished work\* owes an answer/)
  assert.match(NOSPEC, /A written spec\s*\n?owes no phase/)
})

test('the written review is offered, never run', () => {
  assert.match(NOSPEC, /\*\*Then offer `\/spec-diff`\. Do not run it\.\*\*/)
})

test('the wait is the engine command, with no timeout', () => {
  assert.match(NOSPEC, /\*\*The wait is a command\. Do not write one\.\*\*/)
  assert.match(NOSPEC, /skitterspec spec-env review wait <name> --since/)
  assert.match(NOSPEC, /Pass no timeout/)
  assert.match(NOSPEC, /--claim-since/)
})

test('the stack is relayed whole, never a bare page path', () => {
  assert.match(NOSPEC, /`local:`, `network:` and `remote:` lines, all\s*\n?three/)
  assert.match(NOSPEC, /never the bare `page:` path/)
})

// --- the routing ------------------------------------------------------------

test('commit-land commits, lands and tears down — in that order', () => {
  assert.match(NOSPEC, /skitterspec spec-env integrate <name>/)
  assert.match(NOSPEC, /skitterspec spec-env down <name>/)
  assert.match(NOSPEC, /\*\*forgets the specless record\*\*/)
})

test('commit leaves the branch standing, and says what lands it later', () => {
  assert.match(NOSPEC, /\*\*`commit`\*\* — the same commit, and \*\*stop there\*\*/)
  assert.match(NOSPEC, /`\/spec-to-main` lands it later/)
})

test('a conflicting rebase tears nothing down and reports ❌', () => {
  assert.match(NOSPEC, /git rebase --abort/)
  assert.match(NOSPEC, /tear nothing down/)
  assert.match(NOSPEC, /which is what separates `❌` from `⏸`/)
})

test('only commit-land may remove the worktree, said as a rule of its own', () => {
  // The cost of being wrong is somebody else's branch removed from disk, so it
  // is not left to be inferred from the four routes above.
  assert.match(NOSPEC, /\*\*Never tear the worktree down on anything but `commit-land`\.\*\*/)
})

// --- the report --------------------------------------------------------------

test('it declares no Tracker and no Spec, and says why', () => {
  assert.match(NOSPEC, /\*\*No `Tracker` and no `Spec`, ever\.\*\*/)
  assert.match(NOSPEC, /an absence with nothing behind it|report an absence with nothing behind it/)
})

test('its fields are in the vocabulary order, and it ends on Next', () => {
  const at = NOSPEC.indexOf('**Fields:**')
  assert.notStrictEqual(at, -1)
  const run = NOSPEC.slice(at, NOSPEC.indexOf('\n\n', at))
  for (const f of ['Branch', 'Built', 'Tests', 'Notes', 'Landed', 'Worktree', 'Review', 'Follow-ups', 'Next']) {
    assert.ok(run.includes('`' + f + '`'), `declares ${f}`)
  }
})

test('a waiting run drops the Review row for the banner', () => {
  assert.match(NOSPEC, /\*\*omits the `Review` row\*\*/)
  assert.match(NOSPEC, /## ⏸ Review ready/)
  assert.match(NOSPEC, /I'm holding here until you send a verdict/)
  assert.match(NOSPEC, /`Commit & Land` finishes it · `Commit` keeps the branch/)
})

test('the follow-up offer needs no caveat about where the spec is written', () => {
  // /spec provisions the follow-up's own worktree, so the old "write it from the
  // primary checkout" caveat is gone everywhere, including here.
  assert.match(NOSPEC, /`\/spec` provisions its own worktree, so there is\s*\n?no caveat about where to write it/)
})

// --- registered where a reader looks ----------------------------------------

test('spec-planning.md carries the row and the reasoning', () => {
  assert.match(PLANNING, /\| `\/no-spec` \|.*no spec.*\|/)
  assert.match(PLANNING, /\*\*`\/no-spec` is the one row that writes no spec\*\*/)
  assert.match(PLANNING, /skitterspec spec-env nospec <name>/)
  assert.match(PLANNING, /It is model-invocable, which\s*\nmatters/)
})

// ---------------------------------------------------------------------------
// STAYS SILENT — a project with no isolation has nowhere to move work to, and
// the skill must say so rather than quietly doing the work in place. That is
// the one outcome it exists to prevent, so it cannot be its fallback.
// ---------------------------------------------------------------------------

test('STAYS SILENT: with no isolation it refuses rather than working in place', () => {
  assert.match(NOSPEC, /\*\*Where isolation is not configured\*\*/)
  assert.match(NOSPEC, /Say so in one line and stop/)
  assert.match(NOSPEC, /Do not silently do the work in place — that is the outcome it exists to\s*\nprevent/)
})
