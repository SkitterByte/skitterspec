---
github_issue_id: "#62"
---

# Phase 3 — `--next`, `--state <bucket>`, spec-status column ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `--next N` lists the top of the backlog in the tracker's own order.
`--state` takes bucket names. Every row shows the spec's status, read from its
own worktree where one exists. Proven by list tests.

## Tasks

- [x] Azure `--next N`:
      - the backlog bucket's aliases, ordered by
        `Microsoft.VSTS.Common.StackRank`;
      - a scope flag, exclusive with `--state` / `--all` (refuse the pair).
- [x] GitHub `--next N`: the backlog Status items in board order, with the same
      exclusivity.
- [x] `--state` (Azure, GitHub, Linear):
      - a bucket name expands through `stateNamesFor`;
      - any other name matches a tracker state, as today.
- [x] Spec-status column (Azure, GitHub, Linear):
      - read the bucket from the spec's own worktree when `git worktree list`
        has one, else from the current tree; `—` when the spec is not here;
      - mark `≠` when board bucket and spec bucket disagree; never for an
        unmapped state;
      - add `specStatus` and `disagrees` to `--json`.
- [x] Write the blind spot beside the column (`.claude/rules/negative-checks.md`
      rule 2): a declined-teardown worktree still counts, so a finished spec
      may read from a stale tree.
- [x] `/spec-list` skills (azure, github, linear): `--next`, bucket `--state`,
      the column and `≠`.
- [x] Tests:
      - `--next` order and cap;
      - `--next` with `--state` refuses;
      - `--state in-progress` matches an alias;
      - the spec column reads the worktree over the current tree;
      - `—` for a spec not on disk;
      - `≠` on a disagreement, none on an unmapped state (stays-silent).
- [x] `pnpm test`: 4263 passed, 0 failed. New tests are in
      `provider-kit/test/list-rows.test.js` (including a real git repo with a
      worktree), plus Azure, GitHub and Linear list tests.
