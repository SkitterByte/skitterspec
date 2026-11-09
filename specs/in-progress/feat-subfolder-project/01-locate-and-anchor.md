---
github_issue_id: "#141"
---

# Phase 1 — Locate the project, re-anchor, nested harness ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every `spec-env` verb finds `env.config.json` from a subfolder project,
worktrees land beside the repo, and a nested rerun of the suite runs on ubuntu
and Windows — proven by `test:nested` going green for resolve/config tests.

## Tasks

- [x] Add `packages/common/src/env/project.js`: `primaryAnchor` (find-up to
      `specs/.core/`, bounded by `--show-toplevel`; `''` when none),
      `projectIn`, `fromRepoPath`, `toRepoPath`, `attachProject` /
      `repoRootOf` — posix repo paths, `path` only at the OS edge; the blind
      spot is named beside `findPrefix`
- [x] Re-anchor `resolvePrimaryCheckout` to `<primary root>/<prefix>`; the
      root rides on the loaded config (`config.project`, non-enumerable) for
      worktree coordinates — attached in both CLI load sites and the review
      server
- [x] Resolve `worktree.root` against the primary root and expand `{repo}` /
      `{repoSlug}` from the root's name (`resolveSpec`, `resolveSpecless`,
      `resolveSpecWithWorktree`, prune's volume slug)
- [x] Print `subfolder: <prefix>/ (in repo <root>)` in `spec-env resolve` and
      at the top of `skitterspec status`, only when the prefix is non-empty
- [x] Add `test/helpers/repo.js` (`makeRepo` honours
      `SKITTERSPEC_TEST_PREFIX`; nested, a `Sql/` sibling and a space in the
      root's name) and `pnpm test:nested` (`scripts/test-nested.js`), which
      reruns every test file built on the helper
- [x] Add a windows-latest CI job (`core.longpaths` on): `test:nested` gates,
      the full suite reports with `continue-on-error`; ubuntu runs
      `test:nested` too
- [x] Tests: `env-project.test.js` (prefix `''`, deeper cwd, no
      `specs/.core`, outside the toplevel, linked worktree, repo-path
      round-trips); `cli-spec-env-anchor.test.js` on the helper (both
      layouts); `scripts/test-nested.test.js`; full suite 4583 green,
      `test:nested` green

## Notes

`path.win32` is not injected into `project.js`: repo paths are pure `/`
strings, and the OS edge is exercised for real by the windows-latest job
instead.

Left for later phases, because they read specs out of a worktree
(`<wt>/specs`), which is phase 2's site: `cli-spec-env-status.test.js`,
`cli-spec-env-zero-arg.test.js`, `cli-spec-env-up-from.test.js` migrate onto
the helper there.
