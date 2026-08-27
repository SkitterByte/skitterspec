# Bug: /spec-complete and /spec-cancel self-block on their own edits

> **Type:** Bug
> **Name:** bug-complete-cancel-self-block
> **Status:** In Progress — fixed (test green)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-27
> **Area:** packages/common/assets/skills/{spec-complete,spec-cancel}/SKILL.md,
> packages/common/test/assets.test.js
> **Stack:** worktree

## Symptom

`/spec-complete` writes the completion edits (status flip in step 3, `git mv` to
`specs/complete/` in step 4), then step 6 refuses to land because the worktree is
dirty — with the edits it just made. It instructs *"offer `/commit` and **stop**;
don't auto-commit"*, so landing always costs a manual extra `/commit`. It fails
this way on **every** run, by construction, not intermittently.

Observed live while completing `feat-linear-project-and-intake`:

```
spec-env integrate: blocked — worktree has uncommitted changes — commit the completion first
```

`/spec-cancel` has the identical shape (steps 4–5 edit + `git mv`, step 6 forbids
committing) and is worse: step 7 teardown refuses a dirty worktree and offers
`--force` as the way through — which would delete the cancellation record the
skill had just written.

## Root cause

Both skills carry the rule *"Do **not** `git commit` unless the user asks"*
(`spec-complete/SKILL.md:52`, `spec-cancel/SKILL.md:52`) and then hit a
clean-tree guard downstream (`spec-complete/SKILL.md:68` and `:95–97`;
`spec-cancel/SKILL.md:66`). The rule is sound — it stops a lifecycle skill
sweeping a user's half-finished phase work into a bookkeeping commit — but it was
applied to the **wrong dirt**. The tree isn't dirty with the user's work at that
point; it's dirty with the skill's *own* mechanical output. So the guard fires on
edits the skill authored one step earlier.

`/spec-to-main` carries the same wording and is **correct**, which confirms the
diagnosis: it makes no edits of its own, so dirt there really is the user's.

## Failing test (red)

`packages/common/test/assets.test.js` — three tests over the shipped skill
markdown. Run with `node --test packages/common/test/assets.test.js`.

- *"a self-editing lifecycle skill commits its own edits before the guard"* —
  each of `spec-complete`/`spec-cancel` must say it commits its own edits, name
  the `chore(spec):` commit, and **not** carry the blanket no-commit rule.
- *"…checks for pre-existing dirt before editing"* — the pre-existing-changes
  check must appear **before** the `## N. Move to …` step, not after.
- *"/spec-to-main keeps the no-auto-commit rule"* — a control: the rule stays
  where it's right.

Red output before the fix:

```
AssertionError [ERR_ASSERTION]: spec-complete commits the edits it made itself
AssertionError [ERR_ASSERTION]: spec-complete checks the tree before it edits
```

## Fix

- [x] Move the dirty-tree check **before** the edits — `/spec-complete` step 2,
      `/spec-cancel` step 3 — so pre-existing work still stops the skill, which is
      what the rule was protecting.
- [x] Have each skill commit its own edits: `/spec-complete` step 4 →
      `chore(spec): complete <name>`, `/spec-cancel` step 5 →
      `chore(spec): cancel <name>`. Neither pushes.
- [x] Reword the downstream guards to "step 4 already committed these; still
      dirty means unrelated work" instead of "commit first and stop".
- [x] Call out in `/spec-cancel` why this matters most there — teardown's escape
      hatch is `--force`, which would destroy the record.
- [x] Failing test now passes (GREEN); full suite green, no regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `/spec-complete` — dirt check to step 2; step 4 commits |
| Skill/rule | update | `/spec-cancel` — dirt check to step 3; step 5 commits |
| Skill/rule | none | `/spec-to-main` unchanged — pinned by a control test |

## Notes — what this test can and cannot prove

The regression test asserts on the **prose** of the shipped `SKILL.md`: that the
instruction exists and is ordered before the guard. It cannot prove a model
follows it. That's the honest ceiling for testing a skill, and it's still worth
having — the bug was that the instruction said the wrong thing, and that is
exactly what the test now catches.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-27 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-27 — Bug reproduced; failing test added (red). Root cause: the
  no-auto-commit rule applied to the skill's own edits rather than to
  pre-existing user work.
- 2026-08-27 — Fixed: dirt check moved ahead of the edits; each skill now commits
  its own bookkeeping. Test green; full suite 468 green.
