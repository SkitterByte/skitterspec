---
github_issue_id: "#267"
---

# Phase 1 — Engine and CLI verb, with tests ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec uninstall [--yes]` removes a local install exactly,
proven by tests on a fixture that ran `init --local`.

## Tasks

- [ ] Give `removeHooks` a `{ local }` option (targets `settings.local.json`); delete the file when emptied
- [ ] Let the CLAUDE block strip take a target file, so it can strip `CLAUDE.local.md`; delete the file when left empty
- [ ] Add `uninstall({ dir, yes })` to `init.js`: manifest/scope check, in-flight refusal, plan, then act in the order in the overview
- [ ] Remove the exclude block from the git common dir's `info/exclude` (the inverse of `writeLocalExcludes`)
- [ ] Wire `uninstall` into `cli.js` and its help text; it is reachable through every distribution's binary
- [ ] Tests: plan-only changes nothing; `--yes` leaves no managed path, hook or block behind and `git status` unchanged; an edited skill is kept and listed; other settings keys and other CLAUDE.local.md text survive; a provisioned spec, a specless branch and a held live overlay each refuse naming it; a team install refuses; no manifest exits 0 saying so (the stays-silent case)
- [ ] Run `pnpm test` — green before the phase is done

## Notes

`init.js` `localExcludes` and `localManagedPaths` are the inverse's source of
truth; read the paths from there, not from the exclude file's text.
