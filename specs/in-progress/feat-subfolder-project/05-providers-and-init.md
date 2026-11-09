---
github_issue_id: "#145"
---

# Phase 5 — Providers and init ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every provider and `skitterspec init` work from a subfolder project —
proven by nested provider and init tests.

## Tasks

- [x] Make `release.ignorePaths` prefix-aware for every provider: the kit's
      `onlyIgnoredPaths` / `ticketsInRange` take a `prefix` and read git's
      root-relative paths project-relative (a path outside the project is
      never bookkeeping); `projectPrefixOf(dir)` supplies it in azure-boards,
      github, jira and linear's `released`
- [x] provider-kit `listSpecsLive`: anchor on the project folder, attach the
      repo root to the env config, and read each worktree's specs at
      `projectIn(<wt>, prefix)`. sync-core needed nothing: its
      `specs/<bucket>/<name>` strings are project-relative labels, read from
      the project folder
- [x] `skitterspec init` from a subfolder: the trusted worktree root resolves
      against the repo root and is named for it; `.gitignore`, `.claude/` and
      the hook commands (`${CLAUDE_PROJECT_DIR}/…`) already land in the project
      folder
- [x] Tests: `provider-kit/test/nested-providers.test.js` — `released` and
      `ref` through all four providers in both layouts, plus the matcher at a
      fixed prefix; `init-subfolder.test.js` — trust root, nothing written at
      the repo root, the install `spec-env` accepts. `test:nested` now finds
      helper users in sibling packages. Full suite 4629 green, `test:nested`
      167 green (13 files)

## Notes

Providers take their project folder from `cwd` (or `--dir`), so `spec-sync`
runs from the project folder — as the adopter already does — and not from a
folder beneath it, which is true of a root-layout repo today too. `spec-env`
finds the project from anywhere beneath it; extending that to `spec-sync`
is not this spec's.

`listSpecsLive` (behind the providers' live listing) is changed but has no
nested test of its own: exercising it needs a tracker listing, which no
offline fixture provides.
