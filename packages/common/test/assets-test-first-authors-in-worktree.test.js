'use strict'

/**
 * The test-first skills author in their own worktree — neither seeds a stub on
 * the base branch.
 *
 * WHAT THIS CLOSES. `feat-main-is-a-landing-zone` converted `/spec` to the
 * authoring lane and then shipped `main-guard.cjs`, which refuses an `Edit` or
 * a `Write` in the primary checkout while it is on the base branch. The
 * test-first skills were never converted with it: both still open with
 * "from the base branch (`main`), create `specs/in-progress/…/00-overview.md`",
 * which is precisely the write the guard exists to refuse. A `/spec-bug` run in
 * a project with the hook installed is denied on its own documented first step.
 *
 * The fix is the lane that already exists. `specEnvUp`'s authoring branch opens
 * on a `SPEC_NOT_FOUND`, `--docs`, and a name matching `^(feat|bug|hotfix)-.` —
 * so it has always accepted these two; only the skills never asked.
 *
 * WHAT IS ASSERTED IN EQUAL MEASURE is the second `up`. `--docs` skips the
 * `setup` commands, and where `/spec` can defer them to `/spec-start` there is
 * no `/spec-start` in a bug's life: this skill runs the suite itself, three
 * steps later. A converted skill that dropped the flagless re-run would trade a
 * refused write for a worktree with no dependencies, which is not better.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')

const BUG = skillText('spec-bug')
const HOTFIX = skillText('spec-hotfix')

// --- it provisions, and provisions before it writes -------------------------

test('/spec-bug provisions a docs worktree before it writes the stub', () => {
  assert.match(BUG, /skitterspec spec-env up bug-<name> --docs/)
  assert.match(BUG, /\*\*Provision before you write, not after\.\*\*/)
})

test('the stub is no longer seeded on the base branch', () => {
  assert.doesNotMatch(
    BUG,
    /From the base branch \(`main`\), create/,
    'the instruction the guard refuses is gone, not merely contradicted',
  )
})

test('it names the guard, so the next reader knows what moving it back would cost', () => {
  assert.match(BUG, /`main` is where work \*\*lands\*\*, not where it\s*\n?happens/)
  assert.match(BUG, /main-guard/)
})

test('the session moves with a plain cd, and the move is confirmed', () => {
  assert.match(BUG, /plain `cd`/)
  assert.match(BUG, /`skitterspec spec-env resolve` with no argument must name this spec/)
  assert.match(BUG, /negative-checks\.md` rule 1/)
})

// --- and the tree it leaves behind can run the suite ------------------------

test('the flagless up runs afterwards, so the setup commands happen', () => {
  assert.match(BUG, /skitterspec spec-env up bug-<name>\n```/)
  assert.match(BUG, /skips the `setup` commands/)
})

test('the second up is justified by the red test, not by symmetry with /spec', () => {
  // `/spec` defers the setup to `/spec-start`. Nothing defers it here: §3 runs
  // the suite, so the dependencies have to be in by the end of §2.
  assert.match(BUG, /there is no `\/spec-start` in a bug's life/)
  assert.match(BUG, /a tree that cannot run the suite\s*\n?cannot go red/)
})

// --- §4 stops describing a move that no longer happens ----------------------

test('§4 writes the spec in the worktree, and claims no move', () => {
  assert.doesNotMatch(
    BUG,
    /moved it into the worktree/,
    'nothing is moved any more — the spec is written where the session stands',
  )
  assert.match(BUG, /Nothing was seeded\s*\n?ahead of it and nothing is moved across/)
  assert.match(BUG, /§2 provisioned it and moved you there/)
})

// ---------------------------------------------------------------------------
// STAYS SILENT — `.claude/rules/negative-checks.md` rule 3. This changes where
// every `/spec-bug` run writes, so a project that never adopted isolation must
// be provably untouched by all of it.
// ---------------------------------------------------------------------------

test('STAYS SILENT: no isolation means no worktree and no mention of one', () => {
  assert.match(
    BUG,
    /\*\*Only when per-spec isolation is enabled\*\* \(`specs\/\.core\/env\.config\.json`\s*\nexists\)\. Skip this whole section otherwise/,
  )
  assert.match(BUG, /the fix happens in place, on the\s*\ncurrent branch/)
})

// ---------------------------------------------------------------------------
// `/spec-hotfix` — the same lane, plus the fork point its spec cannot yet name.
// ---------------------------------------------------------------------------

test('/spec-hotfix provisions from the tag, on the command line', () => {
  assert.match(HOTFIX, /skitterspec spec-env up hotfix-<name> --docs --from <tag>/)
  assert.match(HOTFIX, /\*\*Provision before you write, not after\.\*\*/)
})

test('it says why the tag cannot come off the spec, as it does everywhere else', () => {
  // Without this the flag reads as redundant with the header and gets dropped,
  // and a hotfix silently forks from main.
  assert.match(HOTFIX, /the spec that would carry it does not\s*\n?exist yet/)
  assert.match(HOTFIX, /fork from `main`/)
})

test('the hotfix stub is no longer seeded on the base branch either', () => {
  assert.doesNotMatch(HOTFIX, /From the base branch \(`main`\), create/)
  assert.match(HOTFIX, /`main` is where work \*\*lands\*\*, not where it\s*\n?happens/)
})

test('the hand-move across is gone, and so is the hazard paragraph it needed', () => {
  const flat = HOTFIX.replace(/\s+/g, ' ')
  assert.doesNotMatch(flat, /mv specs\/in-progress\/hotfix-/, 'nothing is moved')
  assert.doesNotMatch(flat, /mkdir -p <worktreePath>/, 'no bucket-creation hazard left')
  assert.doesNotMatch(flat, /renames your spec folder/, 'and not its warning either')
})

test('the session moves and confirms, and the setup commands still run', () => {
  assert.match(HOTFIX, /plain `cd`/)
  assert.match(HOTFIX, /`skitterspec spec-env resolve` with\s*\n?no argument must name this spec/)
  assert.match(HOTFIX, /skitterspec spec-env up hotfix-<name>\n```/)
})

test('the header records the same tag the fork used', () => {
  // `/spec-complete` tags and cherry-picks off the header, so a worktree forked
  // from one ref and a header naming another is the whole bug wearing a hat.
  assert.match(HOTFIX, /the same tag you passed to `--from`/)
})

test('STAYS SILENT: a hotfix without isolation still stops, rather than improvising', () => {
  // The inverse of /spec-bug's stays-silent case: there is no in-place path
  // here, so the healthy-but-unusual input is refused up front rather than
  // half-provisioned.
  assert.match(HOTFIX, /\*\*Isolation is required\.\*\*/)
  assert.match(HOTFIX, /there is no in-place path/)
})
