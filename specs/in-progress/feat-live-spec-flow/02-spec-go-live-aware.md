# Phase 2 — Live-aware `/spec-go` + skill docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-go` on a live spec works directly in the primary checkout on the
branch (no worktree churn, no detached-HEAD commits), and the skill docs reflect
the new safety behaviour. Proven by a test over the live signal plus the updated
skill markdown.

## Tasks

- [x] Expose a reliable **live signal** spec-go can consult: extended
      `spec-env live status <name>` to take an optional spec arg and print a
      stable `live:      yes|no` verdict line (reuses `assertPrimaryOnMain`,
      backward-compatible — no arg keeps the global summary).
- [x] Update `spec-go/SKILL.md` step 2: added a **Live check first** block before
      the provisioning bullets — if `live: yes`, skip provisioning/`spec-env up`
      and implement the phase directly in the primary checkout on the branch;
      explicitly warns that the detached worktree must **not** be worked in.
- [x] Update `spec-complete/SKILL.md` step 6: documented the **work-loss abort**
      (stranded detached-HEAD commits, or missing worktree while live), the
      recovery hints, and "relay the diagnostic and stop".
- [x] Mirror sync: `.claude/skills/<name>` are **symlinks** into
      `packages/common/assets/skills/` — editing the asset updates the mirror
      automatically (verified).
- [x] Added tests for the live signal (`live: no` when not live, `live: yes`
      after `live take`) in `cli-spec-env-live.test.js`; ran `npm test` — 425
      pass, 0 fail.

## Notes

Depends on Phase 1's `assertPrimaryOnMain`-based detection being in place. The
skill change is the primary UX fix; Phase 1 is the safety net that makes the bad
state non-destructive even if a user reaches it another way.

The live signal is a per-spec extension of `spec-env live status` (not a new
`spec-env status` field) — it keeps the live-overlay surface in one command and
stays backward-compatible. The `.claude/skills` symlink means task 4 needed no
build step.
