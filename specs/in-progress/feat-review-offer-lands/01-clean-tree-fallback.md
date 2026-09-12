---
linear_issue_id: "SKS-182"
---

# Phase 1 — Engine: a clean tree falls back to the branch, announced ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env review` on a committed phase shows the branch instead of an
empty page, says why, and still says nothing when it cannot tell.

## Tasks

- [ ] In `specEnvReview` (`packages/common/src/cli.js:1466`), collect in
      `working` mode as now, then fall back when **both** hold: `flags.branch`
      is unset **and** `totals.files === 0`. Re-collect with the branch `ref`
      and `mode = 'branch'`.
- [ ] Reuse the existing `--branch` merge-base resolution, including its refusal:
      no merge-base → **do not** fall back, render the empty page and print
      today's `nothing to review — no changes found` line unchanged.
- [ ] Track that the swap happened and name it in the header line —
      `spec-env review: <spec> (working tree clean — since <base>)` — so the
      reader is never told they are looking at uncommitted work when they are not.
- [ ] Append the reason to the page subtitle in
      `packages/common/assets/review/page.html:1103`; the `everything since
      <base>` / `uncommitted work` split already exists, so this adds the cause,
      not a new field.
- [ ] Update `/spec-diff`'s SKILL.md where it states the working-tree default
      (`assets/skills/spec-diff/SKILL.md`, the `--branch` block) so the skill
      describes the fallback rather than contradicting it.
- [ ] Tests in `packages/common/test/env-review.test.js`: the fallback fires on a
      committed branch with a clean tree and reports `branch` mode; the header
      line names the swap; the page subtitle carries the reason.
- [ ] **Stays-silent tests** (`.claude/rules/negative-checks.md` rule 3): a spec
      with real uncommitted work stays in `working` mode; an explicit `--branch`
      is never re-interpreted; a branch with no merge-base falls back to nothing
      and prints the existing message.
- [ ] Run the project's test command — green before the phase is done.

## Notes

The fallback is a "no information lost" swap by construction: it only fires when
the view it replaces is empty. That is what makes it safe to do without a flag
to opt out — there is no `--working`, and none is wanted.

Name the blind spot beside the check (rule 2): a clean tree means *committed* on
a worked branch, but it also means *nothing done yet* on a fresh one. Both are
harmless here — the second falls back to a branch range that is itself empty —
and the comment should say so, because the next reader will wonder.
