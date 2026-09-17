'use strict'

/**
 * `/spec` ends on a page and waits for a verdict.
 *
 * The gap this closes: a spec is the one artefact whose whole purpose is to be
 * read before work begins, and it was the only one in the lifecycle with no
 * reading surface. `/spec` finished, the spec sat uncommitted, and `/spec-start`
 * had to point that out and commit it as a side effect of provisioning.
 *
 * Most of what is asserted here is the DISCIPLINE around the wait rather than
 * the wait itself, because every one of those rules is written down in response
 * to something that actually went wrong: a watcher composed per-run that could
 * never fire, an offer nobody was listening for, two links with the wait behind
 * only one of them, and a gate armed by work that owed nothing.
 *
 * The last two tests are the stays-silent half
 * (`.claude/rules/negative-checks.md` rule 3). This phase changes the ending of
 * every `/spec`, so a project that never adopted isolation — and a run that
 * wrote no spec at all — must be provably untouched.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')

const SPEC = skillText('spec')

// --- it renders, and renders the right thing --------------------------------

test('/spec renders the spec itself, with the authoring buttons', () => {
  assert.match(SPEC, /skitterspec spec-env review <spec> --docs --buttons authoring/)
  // It reads the tree the session is standing in, which is now this spec's own
  // worktree. The line this replaces said `--docs` "never wants a worktree —
  // a backlog spec has none", which is the sentence Phase B inverted.
  assert.match(SPEC, /which\s*\n?after Phase B is \*\*this spec's own worktree\*\*/)
  assert.doesNotMatch(SPEC, /never wants a worktree/, 'the old claim is gone, not merely contradicted')
})

test('the page shows this spec and nobody else, and says why that matters', () => {
  // The safety property, not a detail. Its ORIGINAL justification — several
  // specs sharing one checkout — is gone now that each is authored in its own
  // worktree, so the skill has to carry the replacement rather than the habit:
  // companionPaths and a hand-edited .core land in the same tree as the spec.
  assert.match(SPEC, /this spec's\s*\n?\*\*documents and nobody else's\*\*|\*\*this spec's\s*\n?documents and nobody else's\*\*/)
  assert.match(SPEC, /`owned` half of\s*\n?`spec-env stage`/)
  assert.match(SPEC, /companionPaths/)
  assert.match(SPEC, /only the spec's own\s*\n?documents belong under this verdict/)
})

test('the pathspec comes from the render, not from the tree at verdict time', () => {
  assert.match(SPEC, /docs\.paths/)
  assert.match(SPEC, /Take the pathspec from the render, not from the tree/)
})

// --- the wait ---------------------------------------------------------------

test('the wait is the engine command, and the skill forbids composing one', () => {
  assert.match(SPEC, /\*\*The wait is a command\. Do not write one\.\*\*/)
  assert.match(SPEC, /skitterspec spec-env review wait <spec> --since <the timestamp>/)
})

test('no timeout is passed, and the skill says why not', () => {
  assert.match(SPEC, /takes no timeout unless you pass one, and you must not pass one/)
  assert.match(SPEC, /lunch break/)
})

test('the engine picks the pass, so the skill never chooses one', () => {
  assert.match(SPEC, /--docs --claim-since <the timestamp> --json/)
  assert.match(SPEC, /refuses to choose when two did/)
})

test('a file:// page waits by ending the turn, and starts no watch that cannot fire', () => {
  // The documented failure: a watch on the pending store spins forever while the
  // report underneath it claims to be holding.
  assert.match(SPEC, /\*\*Do not start a watch that cannot fire\*\*/)
  assert.match(SPEC, /The wait is\s*\n?the turn ending/)
})

// Was "one link, because the engine has already chosen which page the reader can
// use" — the engine no longer chooses. It prints every tier, labelled, and the
// skill relays the lot; `.claude/rules/spec-reports.md` carries why.
test('every tier is relayed, in the engine\'s own order', () => {
  assert.match(SPEC, /Relay the engine's \*\*stack\*\*/)
  assert.match(SPEC, /all\s*\n?three, in that order/)
  assert.match(SPEC, /never the bare `page:` path/)
  assert.match(SPEC, /spec-reports\.md/)
})

// --- the four endings -------------------------------------------------------

test('commit-start commits then starts the spec, and stops there', () => {
  assert.match(SPEC, /review\.commitWith/)
  assert.match(SPEC, /run \*\*`\/spec-start <name>`\*\*, and \*\*stop there\*\*/)
  // The thing it must not do, named — the same caveat `commit-continue` carries.
  // `lands` dropped out of the list, because landing is now what it DOES.
  assert.match(SPEC, /never completes or tears anything down/)
})

test('commit keeps the spec in the backlog rather than starting it', () => {
  assert.match(SPEC, /the same commit and the same land/)
  assert.match(SPEC, /stays `Ready` in\s*\n?\s*`backlog`/)
})

test('changes re-renders and waits again rather than dropping out to the terminal', () => {
  assert.match(SPEC, /\*\*re-render, and\s*\n?\s*wait again\*\*/)
  assert.match(SPEC, /record a resolution for each one/)
  assert.match(SPEC, /reopen the loop this exists to close/)
})

test('discuss claims nothing and changes nothing', () => {
  assert.match(SPEC, /\*\*`discuss`\*\* — report and talk\. Claim nothing, change nothing\./)
})

// --- arming is separate from waiting ----------------------------------------

test('/spec arms nothing, and says that is a decision rather than an omission', () => {
  assert.match(SPEC, /\*\*Arm nothing\.\*\*/)
  assert.match(SPEC, /a backlog spec owes no phase/)
  assert.match(SPEC, /`spec-env review gate --check` exiting 0/)
})

test('/spec never calls review arm', () => {
  // The positive assertion above states the rule; this one is what a later edit
  // pasting the phase-end block in for symmetry would trip over.
  //
  // ANCHORED TO A CALL, NOT A MENTION. A bare `doesNotMatch(/review arm/)` is
  // the guard that matches something else: the skill has to NAME the command in
  // order to forbid it, so the naive form fails on its own prohibition — it did,
  // the first time this was written. A command in this skill is a line that
  // starts with `skitterspec`; the prohibition is inline prose in backticks.
  const callsArm = SPEC.split('\n').filter((l) => /^\s*skitterspec spec-env review arm/.test(l))
  assert.deepStrictEqual(callsArm, [], 'arming belongs to a phase that ended, not to authoring')
  // And the prohibition is still there to be read, which the check above cannot
  // tell you on its own.
  assert.match(SPEC, /There is no `spec-env review arm` in this path/)
})

// --- the report shape -------------------------------------------------------

test('a waiting run ends on the banner and drops the Review row', () => {
  assert.match(SPEC, /\*\*omits the `Review` row\*\*/)
  assert.match(SPEC, /## ⏸ Review ready/)
  assert.match(SPEC, /I'm holding here until you send a verdict/)
  assert.match(SPEC, /`Commit & Start` puts it in flight · `Commit` keeps it for later/)
})

test('the no-page Next still lands the reader somewhere runnable', () => {
  assert.match(SPEC, /`\/spec-start <name>`, with the name spelled the way it must\s*\n?be typed/)
  assert.match(SPEC, /`\/commit, then \/spec-start <name>` when anything else is uncommitted/)
})

// --- stays silent -----------------------------------------------------------

test('STAYS SILENT: no isolation config means no page and no wait', () => {
  assert.match(SPEC, /\*\*Only when the project has per-spec isolation\*\*/)
  assert.match(SPEC, /skip it in\s*\n?silence rather than explaining an absence/)
})

test('STAYS SILENT: a run that wrote no spec renders nothing and waits for nothing', () => {
  assert.match(SPEC, /\*\*Render nothing when nothing was written\.\*\*/)
  assert.match(SPEC, /must not ask for a\s*\n?verdict on one/)
})

test('STAYS SILENT: the phase-end skills keep the committing set, not the authoring one', () => {
  // `authoring` is for a spec with no phase in flight. A phase page offering
  // `Commit & Start` would offer to start a spec that is already started.
  for (const name of ['spec-next', 'spec-bug', 'spec-hotfix']) {
    assert.doesNotMatch(skillText(name), /--buttons authoring/, `${name} must not render the authoring set`)
  }
  assert.match(skillText('spec-next'), /takes the committing button set/)
})

// --- /spec-review hands its refresh back the same way -----------------------
//
// Same ending, different set. It is a separate block rather than a loop over
// both skills because the two differ in exactly the way that matters — whether
// a start verdict is offered — and a loop asserting "renders a page" would pass
// while that difference was wrong.

const REVIEW = skillText('spec-review')

test('/spec-review renders the refresh with the refresh buttons', () => {
  assert.match(REVIEW, /skitterspec spec-env review <spec> --docs --buttons refresh/)
  assert.match(REVIEW, /wants no worktree and works for a spec in any bucket/)
})

test('a refresh is shown as a patch, because the documents are tracked', () => {
  assert.match(REVIEW, /a patch rather than a set of new\s*\n?files/)
  assert.match(REVIEW, /what drifted, and what you\s*\n?rewrote/)
})

test('/spec-review offers no start verdict, and says why', () => {
  assert.match(REVIEW, /\*\*No start verdict, deliberately\.\*\*/)
  assert.match(REVIEW, /may already be\s*\n?in progress/)
  assert.match(REVIEW, /provision a worktree for a spec that already has one/)
})

test('/spec-review waits with the engine command and passes no timeout', () => {
  assert.match(REVIEW, /\*\*The wait is a command\. Do not write one\.\*\*/)
  assert.match(REVIEW, /skitterspec spec-env review wait <spec> --since <the timestamp>/)
  assert.match(REVIEW, /Pass no timeout/)
  assert.match(REVIEW, /--docs --claim-since <the timestamp> --json/)
})

test('/spec-review arms nothing', () => {
  const callsArm = REVIEW.split('\n').filter((l) => /^\s*skitterspec spec-env review arm/.test(l))
  assert.deepStrictEqual(callsArm, [], 'a re-validated spec has ended no phase')
  assert.match(REVIEW, /\*\*Arm nothing\.\*\*/)
})

test('a waiting /spec-review drops the Review row for the banner', () => {
  assert.match(REVIEW, /omits the\s*\n?`Review` row/)
  assert.match(REVIEW, /## ⏸ Review ready/)
  assert.match(REVIEW, /I'm holding here until you send a verdict/)
  assert.match(REVIEW, /`Commit` commits the refresh · `Request changes` works them now/)
})

test('STAYS SILENT: no drift means no page, and that is a success not a gap', () => {
  assert.match(REVIEW, /\*\*Render nothing when nothing changed\.\*\*/)
  assert.match(REVIEW, /that is a success rather than a gap/)
  assert.match(REVIEW, /Take that refusal\s*\n?as the answer/)
})

test('STAYS SILENT: no isolation config means /spec-review skips the page entirely', () => {
  assert.match(REVIEW, /skip\s*\n?the whole step in silence/)
})

test('the two authoring-side skills offer different sets, which is the point', () => {
  // `/spec` can start a spec; `/spec-review` cannot. A single shared set would
  // be simpler and would put a provision button on a spec already in flight.
  assert.match(SPEC, /--buttons authoring/)
  assert.doesNotMatch(SPEC, /--buttons refresh/)
  assert.match(REVIEW, /--buttons refresh/)
  assert.doesNotMatch(REVIEW, /--buttons authoring/)
})
