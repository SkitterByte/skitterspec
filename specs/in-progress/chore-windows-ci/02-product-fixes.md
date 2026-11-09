---
github_issue_id: "#149"
---

# Phase 2 — Line endings and Windows product fixes ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the product behaves correctly on Windows for every failure phase 1
filed here — proven by those tests passing on windows-latest and ubuntu.

## Tasks

- [ ] Get a windows-latest run with phase 1's short-name fix (operator pushes)
      and triage what remains — line endings · product · test-only — into
      this phase and phase 3
- [ ] Add `.gitattributes` (`* text=auto eol=lf`) and renormalise
- [ ] supervise.js: stop a dev server's whole tree on Windows (no negative-pid
      group kill there — e.g. `taskkill /T /F`), keeping POSIX unchanged
- [ ] bootstrap.js: symlink seeds on Windows — fall back to copy (or refuse
      clearly) where a symlink needs Developer Mode, per triage
- [ ] Spawns of `sh` / `/dev/null` in review, reviewers, serve, hotfixland:
      fix only those phase 1 shows failing under Git Bash
- [ ] Tasks added by phase 1's triage
- [ ] Tests: each fix gets a Windows-path test and keeps its POSIX one; commit
      user-visible fixes as `fix(...)` with a Release-Note; `pnpm test` and
      `pnpm test:nested` green on ubuntu

## Notes

The four product tasks above come from the static scan; phase 1 confirms,
drops or adds to them.
