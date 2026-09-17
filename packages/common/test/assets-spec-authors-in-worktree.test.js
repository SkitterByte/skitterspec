'use strict'

/**
 * `/spec` authors in its own worktree, and lands the spec on the verdict.
 *
 * WHAT THIS CLOSES. Phase C2 makes `/spec` wait for a verdict without a timeout
 * — deliberately, because a reader walking away from a diff is the normal case.
 * While the spec was authored in the primary checkout, that wait held the base
 * branch dirty for as long as it lasted, so a release could not be cut through
 * it. The review mechanism that makes a spec good was the thing making `main`
 * unusable.
 *
 * So the rule is `main` is where work LANDS, not where it happens — and a spec
 * document is not an exception to it.
 *
 * The two halves are asserted in equal measure, because either alone is worse
 * than neither: authoring in a worktree WITHOUT landing leaves every new spec on
 * an unlanded branch, invisible to `ls specs/backlog/`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')
const ruleText = (pkg, name) =>
  fs.readFileSync(path.join(__dirname, '..', '..', pkg, 'assets', 'rules', name), 'utf8')

const SPEC = skillText('spec')
const SPEC_START = skillText('spec-start')
const PLANNING = ruleText('common', 'spec-planning.md')
const REPORTS = ruleText('common', 'spec-reports.md')
const TRAILERS = ruleText('linear', 'commit-trailers.md')

// --- it provisions, and provisions at the right moment ----------------------

test('/spec provisions a docs worktree before it writes the spec', () => {
  assert.match(SPEC, /skitterspec spec-env up <name> --docs/)
  assert.match(SPEC, /\*\*Provision before you write, not after\.\*\*/)
})

test('the timing is justified, not merely stated', () => {
  // Grilling puts nothing on disk and the name is settled by the end of Phase A,
  // so this is the one moment a worktree costs nothing and everything is ahead
  // of it. Without that reasoning the step reads as arbitrary and gets moved.
  assert.match(SPEC, /Grilling put nothing on disk/)
  assert.match(SPEC, /spec's name is settled by the time Phase A ends/)
})

test('the session moves with a plain cd, and the move is confirmed', () => {
  assert.match(SPEC, /plain `cd`/)
  assert.match(SPEC, /negative-checks\.md` rule 1/)
  assert.match(SPEC, /`skitterspec spec-env resolve` with no argument must name this spec/)
})

test('a failed cd writes the spec where the session is, rather than guessing', () => {
  // The harmful outcome is a spec in the wrong tree, so the cannot-tell case
  // routes to the harmless one.
  assert.match(SPEC, /write the spec where you are standing instead/)
  assert.match(SPEC, /a spec in the\s*\n?wrong tree is worse than a spec with no worktree/)
})

test('--docs is what makes provisioning cheap, and the skill says what it skips', () => {
  assert.match(SPEC, /skips the `setup` commands and the\s*\n?Docker stack/)
  assert.match(SPEC, /`\/spec-start` re-runs `up` over the same worktree without the flag/)
})

// --- and it lands ------------------------------------------------------------

test('both committing verdicts land the spec on the base branch', () => {
  assert.match(SPEC, /\*\*Both committing verdicts land\b/)
  assert.match(SPEC, /skitterspec spec-env integrate <name>/)
  assert.match(SPEC, /rebase onto the base branch.{0,80}merge --ff-only/s)
})

test('the land is justified by the backlog being findable, not by tidiness', () => {
  // This is the objection that killed "author it in a worktree and leave it
  // there": a folder bucket is only the truth on the branch you stand on.
  assert.match(SPEC, /`ls specs\/backlog\/` is how specs are found/)
  assert.match(SPEC, /only the truth\s*\n?on the branch you are standing on/)
  assert.match(SPEC, /invisible to everyone/)
})

test('a dirty tree at land time is the right refusal, and the skill says why', () => {
  assert.match(SPEC, /refuses on a dirty tree, which is correct here/)
  assert.match(SPEC, /the commit ran first/)
})

test('a conflicting rebase aborts, leaves the commit, and reports ❌', () => {
  assert.match(SPEC, /git rebase --abort/)
  assert.match(SPEC, /leave the commit sitting on the\s*\n?branch/)
  assert.match(SPEC, /report `❌`/)
  // ❌ rather than ⏸ — there is a standing worktree to clear.
  assert.match(SPEC, /which is what separates `❌` from `⏸`/)
  assert.match(SPEC, /Never resolve someone else's conflict/)
})

// --- the worktree's lifetime ------------------------------------------------

test('commit-start keeps the worktree, commit tears it down', () => {
  assert.match(SPEC, /\*\*keep the worktree\*\*/)
  assert.match(SPEC, /\*\*tear the worktree down\*\*/)
  assert.match(SPEC, /skitterspec spec-env down <name>/)
})

test('the asymmetry is argued, with both rejected alternatives named', () => {
  assert.match(SPEC, /Always-keep would leave five backlog specs holding five\s*\n?checkouts/)
  assert.match(SPEC, /always-teardown would have `commit-start` re-provision seconds/)
})

test('keeping it is what makes the deferred setup run at /spec-start', () => {
  assert.match(SPEC, /where the setup commands\s*\n?Phase B skipped finally run/)
})

// --- /spec-start reads the landed spec as healthy ---------------------------

test('/spec-start reads a landed spec as the healthy case, not a skipped step', () => {
  // The clean-tree check looks for the spec being in the fork commit. A landed
  // spec satisfies it, and "nothing to commit" must not read as an omission.
  assert.match(SPEC_START, /is the HEALTHY case of that check/)
  assert.match(SPEC_START, /it means the landing worked/)
})

test('/spec-start re-attaches an existing docs worktree and runs the setup', () => {
  assert.match(SPEC_START, /That\s*\n?is a re-attach, not a clash/)
  assert.match(SPEC_START, /plans the attach form rather than a\s*\n?second `-b` fork/)
  assert.match(SPEC_START, /`setup` commands `--docs` deliberately skipped/)
})

// --- the report --------------------------------------------------------------

test('/spec declares Landed and Worktree, and says when they appear', () => {
  assert.match(SPEC, /\*\*Fields:\*\* `Tracker` · `Spec` · `Built` · `Landed` · `Worktree`/)
  assert.match(SPEC, /appear\s*\n?only once one has been acted on/)
  assert.match(SPEC, /a run that is still waiting on the page has\s*\n?neither/)
})

test('/spec gains a ❌ verdict for a land that failed part-way', () => {
  assert.match(SPEC, /- `❌` — the spec was committed and the land failed part-way/)
  assert.match(SPEC, /standing worktree and a\s*\n?branch to deal with/)
})

// --- the rules follow the skill ---------------------------------------------

test('spec-planning.md carries the landing-zone rule for authoring', () => {
  assert.match(PLANNING, /`main` is where work \*\*lands\*\*, not where it happens/)
  assert.match(PLANNING, /spec-env up <name> --docs/)
  assert.match(PLANNING, /\*\*The committing verdict is what puts it on the base branch\.\*\*/)
})

test('spec-planning.md keeps arm-nothing, with the better reason', () => {
  assert.match(PLANNING, /Phase C2 still \*\*arms nothing\*\*/)
  assert.match(PLANNING, /a backlog spec owes no phase/)
  assert.match(PLANNING, /costs nobody anything rather than leaving a mess/)
})

test("spec-planning.md's skill table row says where the spec lands", () => {
  assert.match(PLANNING, /\| `\/spec` \|.*in its own worktree.*\|/)
  assert.match(PLANNING, /on the base branch, by a fast-forward/)
})

test('spec-env stage keeps its justification, replaced rather than dropped', () => {
  // Its original reason — several specs sharing one `specs/` folder — is gone.
  // Something smaller and just as real has to stand in its place, or the next
  // reader deletes the call as obsolete.
  assert.match(PLANNING, /stays load-bearing now that `\/spec` authors in its own worktree/)
  assert.match(PLANNING, /companionPaths/)
})

test('commit-trailers.md says the bare ref is now correct for a new spec', () => {
  assert.match(TRAILERS, /`\/spec` closes the usual way in/)
  assert.match(TRAILERS, /the \*\*bare\*\* command is then correct/)
  // The accident is still an accident.
  assert.match(TRAILERS, /still the thing to avoid/)
  assert.doesNotMatch(
    TRAILERS,
    /author backlog specs from the base branch/,
    'the advice this inverts is gone, not merely contradicted',
  )
})

test('spec-reports.md drops the where-to-write caveat from the follow-up offer', () => {
  assert.match(REPORTS, /The offer needs no caveat about where/)
  assert.match(REPORTS, /Take the offer and\s*\nlet `\/spec` handle it/)
})

// ---------------------------------------------------------------------------
// STAYS SILENT — `.claude/rules/negative-checks.md` rule 3. This phase changes
// where every `/spec` run writes, so a project that never adopted isolation
// must be provably untouched by all of it.
// ---------------------------------------------------------------------------

test('STAYS SILENT: no isolation means no worktree, no land, and no mention', () => {
  assert.match(
    SPEC,
    /\*\*Only when the project has per-spec isolation\*\* \(`specs\/\.core\/env\.config\.json`\s*\n?present\)\. Without it there is no worktree to make/,
  )
  assert.match(SPEC, /write the folder where you are\s*\n?standing, exactly as before/)
})

test('STAYS SILENT: the report omits Landed and Worktree where nothing was provisioned', () => {
  assert.match(SPEC, /Neither\s*\n?appears where isolation is off/)
  assert.match(SPEC, /nothing was provisioned and nothing was landed/)
})

test('STAYS SILENT: the rules say the old behaviour is unchanged without isolation', () => {
  assert.match(PLANNING, /With isolation \*\*absent\*\* none of this applies/)
  assert.match(PLANNING, /exactly as it always did/)
  assert.match(TRAILERS, /Without isolation the split is still real/)
  assert.match(REPORTS, /Where isolation is absent there is no worktree to move to/)
})

test('STAYS SILENT: the spec-in-another-worktree warning survives', () => {
  // The old section's substance is still needed — only its remedy changed.
  assert.match(SPEC, /physically lives on that branch/)
  assert.match(SPEC, /cancelled along with its host/)
  assert.match(SPEC, /\*\*warn, don't refuse\*\*/)
  assert.match(SPEC, /spec-sync ref <new-spec-name>/)
})
