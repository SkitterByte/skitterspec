---
linear_issue_id: "SKS-184"
---

# Phase 3 — `/spec-bug` and `/spec-hotfix` render too, pinned by a test ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every skill that takes a phase to green renders the page and offers the
review, and a test fails when one of them stops.

## Tasks

- [x] Add the render + offer step to
      `packages/common/assets/skills/spec-bug/SKILL.md`, between **5. Drive to
      GREEN** and **6. Report**, matching phase 2's wording and rules.
- [x] Add the same to `packages/common/assets/skills/spec-hotfix/SKILL.md`,
      between **6. Drive to GREEN** and **7. Report**.
- [x] Note in the `/spec-hotfix` copy that its worktree is forked from a release
      tag, so the branch view is measured against that tag rather than the base
      branch. **The engine did not already resolve this** — see Outcome; it does
      now, and the prose is true rather than aspirational.
- [x] New test `packages/common/test/assets-phase-end-review.test.js` asserting
      **all three** of `/spec-next`, `/spec-bug`, `/spec-hotfix` carry the step:
      it invokes `spec-env review`, offers `/spec-diff`, and states the
      never-publish and never-fatal rules.
- [x] **Stays-silent test:** no *other* shipped skill gains the step — in
      particular `/spec-complete` and `/spec-to-main`, which land branches and are
      the obvious place for someone to paste it in for symmetry (decision 6).
- [x] Rebuild the generated provider skills (`scripts/build-dist.js`) and confirm
      the seam-filled copies under `packages/skitterspec-linear/assets/skills/`
      carry the step, so the superset distribution ships it too.
- [x] Run the project's test command — green before the phase is done.

## Notes

The gap this closes is evidenced, not hypothetical:
`bug-fork-check-worktree-path` was built and completed on 2026-09-12 and is the
only spec of that day's four with no page in `.spec-env/reviews/`.

## Outcome

Nineteen tests added across the phase (17 in `assets-phase-end-review.test.js`,
2 in `env-review-fallback.test.js`); full suite **1897 pass, 0 fail**.

**The phase's premise about the engine was wrong, and needed a code change.**
The task said the branch view is "measured against that tag rather than the base
branch — the engine already resolves this". Half of that was true:
`resolveSpec` reads the `> **Base version:**` header into `spec.baseRef`
(`packages/common/src/env/resolve.js:254`) — but the review path never used it.
It called `resolveBaseBranch`, so a hotfix was measured from `main`.

Writing the prose as planned would have shipped a skill that misdescribes the
tool. So the engine now picks the base through one lazy helper used by both the
`--branch` path and the clean-tree fallback:

```js
const reviewBase = () => spec.baseRef || resolveBaseBranch(config, trimmed)
```

Two things were wrong before, not one. The header said `since main`, which is
not where the work started — and when the tag is **not** an ancestor of the base
branch (a release line that never merged back) the range widened to include
commits the hotfix never touched. The second test computes that counterfactual
with git rather than asserting it: from the fork point the diff contains
`release-only.js`, a commit the hotfix never touched, and from the tag it does
not.

**The composed skills are gitignored build output.** `pnpm build` regenerates
`packages/skitterspec*/assets/`, and this repo's own `.claude/skills/` are
symlinks into it — so the step is live for a session standing in **this
worktree** already, while the primary checkout's installed copies stay on the
old text until this lands and is rebuilt there.
