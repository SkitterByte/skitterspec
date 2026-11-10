---
github_issue_id: "#148"
---

# Phase 1 — Run the Windows job and triage its failures ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a categorised list of every windows-latest failure, written into
phases 2–3 as tasks — proven by the phase files naming each failing test.

## Tasks

- [x] Get a windows-latest run of the current suite: `main` pushed
      (59158b38) — run 42694773088
- [x] Read the failures — the job log needs repo-admin auth, so the operator
      supplied the `failing tests` section; only its first ~100 of ~1500 lines
- [x] Sort them: every failure seen is ONE class — in the nested layout every
      `spec-env` verb answered "isolation not enabled". Root cause:
      `findPrefix` canonicalised with the JS `realpathSync`, which keeps the
      runner's 8.3 short temp path (`C:\Users\RUNNER~1\…`) while git reports the
      long one, so the folder looked outside its own repo and the prefix fell
      to `''`
- [x] Fixed it here, because the rest of the triage cannot be seen past it:
      `realpathSync.native` in `project.js`, the main guard's `sameDir`, the
      CLI's three containment checks, provider-kit's `listSpecsLive`, and the
      test helper. `config.js`'s serve-port hash is left on the JS call — moving
      it could change a running review server's port
- [x] Tests: `env-project.test.js` finds the project from a case-flipped
      spelling of its folder (the same failure, buildable on macOS and Windows;
      skipped with a reason on case-sensitive Linux) — red without the fix,
      green with it. Full suite 4634 green, `test:nested` 167 green
- [x] Write the remaining failures into phases 2–3 — moved to phase 2's first task:
      the remaining failures need a run with this fix in it

## Notes

`gh` is not installed and the log API needs admin rights; the public
check-run annotations only say "exit code 1". The operator reads the log from
the run page.
