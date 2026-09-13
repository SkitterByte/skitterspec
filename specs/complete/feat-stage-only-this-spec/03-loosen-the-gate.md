---
linear_issue_id: "SKS-213"
---

# Phase 3 — Stop refusing foreign dirt in worktree mode ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-start` provisions while another spec sits uncommitted, commits
only the target spec's paths, and says what it left alone.

## Tasks

- [x] In `planSpecCommit` (`packages/common/src/env/provision.js`), make the
      `foreign.length` refusal conditional on `carriesChanges`. Without it,
      return the foreign paths and carry on to the owned-set commit.
- [x] Surface them from `planUp` as `untouched` (or `foreign`) alongside
      `specCommit`, so the plan carries the fact rather than swallowing it.
- [x] Print them in the `spec-env up` worktree renderer in
      `packages/common/src/cli.js`, next to the existing `specCommitLines`
      output, under a heading that says they are left alone.
- [x] Leave `planCheckoutUp` untouched — it passes `carriesChanges: true` and
      keeps refusing.
- [x] Extend the comment above `planSpecCommit` to name the new blind spot: this
      is safe **because** phase 2 made the commit pathspec-limited; a future
      un-limited commit would make it unsafe again
      (`.claude/rules/negative-checks.md` §2).
- [x] Add `Untouched` to the field vocabulary in
      `packages/common/assets/rules/spec-reports.md`, positioned after
      `Worktree` and before `Review` — both are workspace facts. Give it a
      one-line "Carries" entry, plus a paragraph on why it stays `✅`.
- [x] Declare `Untouched` in `/spec-start`'s `**Fields:**` line, in the rule's
      order (`packages/common/test/assets-report-contract.test.js` derives the
      vocabulary from the rule and asserts the order, so both edits are needed
      together).
- [x] Rewrite `/spec-start`'s gate section
      (`packages/common/assets/skills/spec-start/SKILL.md` §1, including the
      three-row table): in `worktree` mode a foreign path is reported, not a
      refusal. Keep the `checkout` mode wording exactly as it is.
- [x] Tests: worktree mode with foreign dirt provisions and reports it; checkout
      mode with the same tree still refuses; the owned set is still committed in
      both the clean-plus-owned and the owned-plus-foreign cases.
- [x] **Stays-silent test:** provisioning with a foreign path present exits zero
      and emits no refusal — the healthy concurrent case must not accuse.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Nothing here changes what `spec-env up` *does* to the primary checkout; it
changes what it refuses to do it in the presence of. The only mutation was
always the spec commit, and phase 2 bounded that.

The `specOnFork === false` refusal stays — that one is a positive signal (the
spec is genuinely absent from the commit the worktree would fork from) and it
produces a branch missing the spec it is for, which foreign dirt never does.

`packages/skitterspec/` and `packages/skitterspec-linear/` are built from these
sources by `scripts/build-dist.js` — edit the `common`/`linear` originals only.
