---
linear_issue_id: "SKS-184"
---

# Phase 3 — `/spec-bug` and `/spec-hotfix` render too, pinned by a test ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every skill that takes a phase to green renders the page and offers the
review, and a test fails when one of them stops.

## Tasks

- [ ] Add the render + offer step to
      `packages/common/assets/skills/spec-bug/SKILL.md`, between **5. Drive to
      GREEN** and **6. Report**, matching phase 2's wording and rules.
- [ ] Add the same to `packages/common/assets/skills/spec-hotfix/SKILL.md`,
      between **6. Drive to GREEN** and **7. Report**.
- [ ] Note in the `/spec-hotfix` copy that its worktree is forked from a release
      tag, so the branch view is measured against that tag rather than the base
      branch — the engine already resolves this, and the prose must not imply
      `main`.
- [ ] New test `packages/common/test/assets-phase-end-review.test.js` asserting
      **all three** of `/spec-next`, `/spec-bug`, `/spec-hotfix` carry the step:
      it invokes `spec-env review`, offers `/spec-diff`, and states the
      never-publish and never-fatal rules.
- [ ] **Stays-silent test:** no *other* shipped skill gains the step — in
      particular `/spec-complete` and `/spec-to-main`, which land branches and are
      the obvious place for someone to paste it in for symmetry (decision 6).
- [ ] Rebuild the generated provider skills (`scripts/build-dist.js`) and confirm
      the seam-filled copies under `packages/skitterspec-linear/assets/skills/`
      carry the step, so the superset distribution ships it too.
- [ ] Run the project's test command — green before the phase is done.

## Notes

The gap this closes is evidenced, not hypothetical:
`bug-fork-check-worktree-path` was built and completed on 2026-09-12 and is the
only spec of that day's four with no page in `.spec-env/reviews/`.
