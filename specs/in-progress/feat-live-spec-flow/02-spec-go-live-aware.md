# Phase 2 — Live-aware `/spec-go` + skill docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-go` on a live spec works directly in the primary checkout on the
branch (no worktree churn, no detached-HEAD commits), and the skill docs reflect
the new safety behaviour. Proven by a test over the live signal plus the updated
skill markdown.

## Tasks

- [ ] Expose a reliable **live signal** spec-go can consult: extend `spec-env
      live status <name>` (and/or `spec-env status`) to report whether the spec's
      branch is checked out in the **primary checkout** (reuse
      `assertPrimaryOnMain`). Keep output machine-readable enough for the skill to
      branch on.
- [ ] Update `spec-go/SKILL.md` step 2: **before** the "provision worktree"
      bullets, add a live check — if the spec is live (branch in the primary
      checkout), **skip provisioning** and implement the phase directly in the
      primary checkout on the branch (commits advance the branch; `/spec-complete`
      lands them). Explicitly distinguish this from the existing
      stale/normal-worktree case so a **detached** worktree is never treated as a
      normal one to "work in".
- [ ] Update `spec-complete/SKILL.md` step 6 wording: document that `integrate`
      now **aborts loudly** if it would land nothing (stranded commits), and what
      recovery looks like (surface the diagnostic to the user).
- [ ] Keep the `/.claude/skills/spec-go` and `/.claude/skills/spec-complete`
      mirror in sync with the `packages/common/assets/skills/...` sources
      (rebuild/copy per the project's build step).
- [ ] Add/adjust tests for the live signal under `packages/common`; run
      `npm test` (`node --test`) — green before the phase is done.

## Notes

Depends on Phase 1's `assertPrimaryOnMain`-based detection being in place. The
skill change is the primary UX fix; Phase 1 is the safety net that makes the bad
state non-destructive even if a user reaches it another way.
