---
linear_issue_id: "SKS-407"
---

# Phase 6 — Skills, docs, MIGRATION ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the skills describe the configured release, the push consent, the version-commit
exclusion and the deferred teardown, and an upgrader knows what changed.

## Tasks

- [x] `/spec-hotfix`: replace "tag a new patch" with the configured release. Accept a
  hotfix-suffixed base tag.
- [x] `/spec-complete` §6-hotfix:
  - run `hotfix land` after the §4 commit;
  - ask the operator before passing `--push`;
  - the `Landed` row names the tag and whether it was pushed;
  - the worktree is kept;
  - §7 for a hotfix: running `/spec-complete` again routes to `hotfix finish`.
- [x] `env.config.md`: document `hotfix.releaseWith` and `hotfix.bump`. Include the
  `--allow-postversion` note, the `branchPrefix` note, and that extra targets are
  tag-only.
- [x] `init`/`update`: when `scripts/release-hotfix.cjs` exists, suggest `releaseWith`
  in the output, without writing it.
- [x] MIGRATION.md (root plus both package copies): a major entry for each package,
  saying `hotfix land` now runs its steps and teardown waits for `hotfix finish`.
- [x] Update `docs/reference.html` and the verb lists (`spec-planning.md`) for `finish`,
  and run the docs tests.
- [x] Run `pnpm test`; green before the phase is done.
