---
github_issue_id: "#143"
---

# Phase 3 — Repo-relative matching ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** spec docs, noise and foreign paths classify correctly in a nested
project — proven by stays-silent tests that a healthy nested spec is never
reported as code or foreign.

## Tasks

- [x] Normalise git outputs to root-relative: `dirtyPaths` adds
      `--full-name` to `ls-files --others`; every tree a review reader is bound
      to is a git root (live view, docs view, the review server's views);
      `committedDocsFor` names its pathspec from the root; the primary leak
      baseline reads from the root, so a leak beside the project is seen
- [x] env/review.js `isNoise` / `isSpecDocOf`: convert with `fromRepoPath`
      (resolved specs now carry `prefix`); `null` (outside the project) is code.
      The spec-dir lookup takes `projectIn(treePath, prefix)`
- [x] env/serve.js: `isProjectBookkeeping` is prefix-aware; the
      `ls-files -- specs/*/<folder>/*` pathspec via `toRepoPath`
- [x] env/classify.js: `classifyDirtyTree` matches project-relative folders
      and companions against converted git paths (repo paths in and out).
      Paths handed out as pathspecs — `stage`'s owned/foreign and `tree`, the
      `up` gate's planned commit, `review --docs`'s `docs.paths` — are
      project-relative (`projectRelative`: `../Sql/…` for a sibling)
- [x] Move `cli-spec-env-stage` and `env-review-docs` tests onto the helper
- [x] Tests: `env-subfolder-paths.test.js` — nested doc owned, sibling and
      `<prefix>.Tests/` foreign, companion inside only, prefix `''` unchanged
      (with and without an anchor), isNoise both ways; a sibling change is code
      on the worktree page, `docs.paths` stage from the project folder, stage
      names a sibling `../Sql/…`, the leak check sees a write beside the
      project. Full suite 4605 green, `test:nested` 102 green (9 files)

## Notes

The review page lists git paths, so a nested project's files show with their
prefix (`FF.CSC.Solution/specs/…`) beside `Sql/…` — the honest repo-wide view.
Only what is handed out as a pathspec is converted.
