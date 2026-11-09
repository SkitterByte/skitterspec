---
github_issue_id: "#141"
---

# Phase 1 — Locate the project, re-anchor, nested harness ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every `spec-env` verb finds `env.config.json` from a subfolder project,
worktrees land beside the repo, and a nested rerun of the suite runs on ubuntu
and Windows — proven by `test:nested` going green for resolve/config tests.

## Tasks

- [ ] Add `packages/common/src/env/project.js`: `locateProject(cwd)` (find-up to
      `specs/.core/`, bounded by `--show-toplevel`; `''` when none),
      `projectIn`, `fromRepoPath`, `toRepoPath` — posix repo paths, `path` only
      at the OS edge; name the blind spot beside the find-up
- [ ] Re-anchor `resolvePrimaryCheckout` to `projectIn(<primary root>)`; keep a
      separate primary-root accessor for git and worktree coordinates
- [ ] Resolve `worktree.root` against the primary root and expand `{repo}` /
      `{repoSlug}` from the root's name
- [ ] Print `project: <prefix>/ (in repo <root>)` in `spec-env resolve` and at
      the top of `skitterspec status`, only when the prefix is non-empty
- [ ] Teach the shared git-fixture builder `SKITTERSPEC_TEST_PREFIX` (project
      nested under that folder, sibling non-project folders present); add a
      `test:nested` script
- [ ] Add a windows-latest CI job running both suites with
      `git config --global core.longpaths true`
- [ ] Tests: unit tests for `project.js` (incl. `path.win32`, prefix `''`,
      cwd deeper than the project, no `specs/.core` anywhere); stays-silent: a
      root-layout repo run from a subfolder still gets prefix `''`; run the
      typecheck + test commands, then `test:nested` — green before done

## Notes

Sites that do not yet route through the module will fail under `test:nested`;
mark those tests as phase-pending only if they belong to a later phase, and
list them here so phase 2–5 pick them up.
