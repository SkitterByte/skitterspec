---
github_issue_id: "#116"
---

# Phase 3 — Fetch before resolving; land onto the newest rc ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** forking and landing always see the newest rc, a spec that outlived a
roll says so, and an `ff` land never lands on the wrong checked-out branch.

## Tasks

- [ ] `spec-env up` and `integrate`: fetch the remote before resolving when
      `baseBranchPattern` is set (no fetch otherwise — byte-identical plans)
- [ ] `integrate`: when the branch's fork point lies on an older match, print
      `forked from <old> · landing onto <new>` in the plan and in `--json`
- [ ] `ff` plan: when the primary checkout is not on the resolved base, plan a
      `git -C <primary> switch <base>` (creating it tracking the remote when
      absent) before the `merge --ff-only`; refuse on a dirty primary checkout
- [ ] Check the main-guard and live overlay resolve through the same function
      (a primary checkout left on an old rc is no longer "base")
- [ ] Tests: fetch only with a pattern; retarget line; switch planned; dirty
      primary refuses; pattern-unset stays-silent; run `pnpm test` — green before done
