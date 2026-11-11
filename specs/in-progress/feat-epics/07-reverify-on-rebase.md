---
github_issue_id: "#160"
---

# Phase 7 — Re-verify a wait met by rebase ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** when a landing's rebase brings in a phase another phase of this spec
waits on, that phase's tests are re-run before the fast-forward (Decision 9).

## Tasks

- [x] Engine: given the old fork point and the new base, list this spec's done
      phases whose `Waits on:` (or the start's) was unmet at the fork point and
      is met on the new base — positive on both reads, else cannot-tell
- [x] `spec-env integrate` prints those phases in its plan, before the
      run-these commands (the plan is computed before anything runs, so it
      names what the rebase WILL bring in). `integrate` has no `--json`, and a
      hotfix carry is a cherry-pick onto `main` rather than a rebase of the
      member — both left out, recorded in Notes
- [x] `/spec-to-main` and `/spec-complete` re-run the project's tests when the
      list is non-empty and land only on green; red stops before the
      fast-forward with the rebased branch left as it is
- [x] Tests: the field case (phase 2 built before the awaited phase, then
      rebased over it) lists phase 2; a wait already met at the fork point
      lists nothing (stays silent); an unreadable fork point is cannot-tell,
      never a forced re-run claim

## Notes

Field case: #154 phase 2 was rebased to 3acd42d over #159's 43463b3 and landed
as cb20cae; no record shows its tests re-ran with the safety rules underneath.

PR mode (`land.strategy: "pr"`) rebases onto the remote base and leaves the
merge to the host, so its plan prints no `re-verify:` lines yet; the host's own
CI is where that run happens there.
