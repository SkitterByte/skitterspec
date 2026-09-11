---
linear_issue_id: "SKS-152"
---

# Phase 4 — `/spec-start` offers to continue into phase 1 ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** in `worktree` mode, `/spec-start` ends by asking whether to build
phase 1 from here — and a "no" leaves exactly today's outcome.

## Tasks

- [x] Rewrite step 6's worktree branch in
      `packages/common/assets/skills/spec-start/SKILL.md`: after the push, offer
      the two paths — build phase 1 now, or hand off to a session in the
      worktree — recommending the build.
- [x] On yes: continue into `/spec-next --worktree <worktreePath>`. It records
      the baseline itself — phase 3 put both halves of the guard in the skill
      that does the writing, so there is nothing to record here.
- [x] On no: print today's message verbatim — the path, and to run `/spec-next`
      from a session in it. Nothing else changes on this branch.
- [x] Keep `--plan` stopping before the offer, and keep `--no-worktree`
      behaving as it does today.
- [x] Leave `checkout` mode alone — it already carries straight on, and it has
      no second tree to leak into.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

The offer is the consent point for the remote build, so it must be a real
question with a real decline — not a notification phrased as one.

`assets-spec-start-one-path.test.js` guards the current single-path shape and
will need updating; the thing worth preserving from it is that worktree mode has
**one** provisioning path, which this phase does not change — the offer comes
after provisioning is finished.

The prediction above did not hold, and that is the good outcome:
`assets-spec-start-one-path.test.js` needed **no** editing. What it guards is
that worktree mode has one *provisioning* path, and the offer sits in step 6
after provisioning and housekeeping are finished — so the property survived
untouched. A new test pins that ordering explicitly rather than leaving it to
coincidence.
