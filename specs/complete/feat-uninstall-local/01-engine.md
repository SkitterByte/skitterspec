---
github_issue_id: "#267"
---

# Phase 1 — Uninstall engine and CLI verb, with tests ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec uninstall [--yes]` removes a local install exactly,
proven by tests on a fixture that ran `init --local`.

## Tasks

- [x] Give `removeHooks` a `{ local }` option (targets `settings.local.json`); delete the file when emptied
- [x] Let the CLAUDE block strip take a target file, so it can strip `CLAUDE.local.md`; delete the file when left empty
- [x] Add `uninstall({ dir, yes })` to `init.js`: manifest/scope check, in-flight refusal, plan, then act in the order in the overview
- [x] Park customized managed files at `<git-common-dir>/skitterspec-kept/<relPath>` (refuse to overwrite an existing parked copy — name it and keep both); list each with its parked path
- [x] Remove the exclude block from the git common dir's `info/exclude` (the inverse of `writeLocalExcludes`)
- [x] Wire `uninstall` into `cli.js` and its help text; it is reachable through every distribution's binary
- [x] Tests: plan-only changes nothing; `--yes` leaves no managed path under `.claude/`, no hook or block behind, and `git status` unchanged; an edited skill is moved to the park with its content intact and listed; a second uninstall with a parked copy already there keeps both; other settings keys and other CLAUDE.local.md text survive; a provisioned spec, a specless branch and a held live overlay each refuse naming it; a team install refuses; no manifest exits 0 saying so (the stays-silent case)
- [x] Run `pnpm test` — green before the phase is done

## Notes

`init.js` `localExcludes` and `localManagedPaths` are the inverse's source of
truth; read the paths from there, not from the exclude file's text.
