---
github_identifier: "#226"
github_url: "https://github.com/SkitterByte/skitterspec/issues/226"
---

# Run the suite on Windows before a release is tagged

> **Type:** Chore
> **Name:** chore-release-windows-run (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/226
> **Author:** Reuben Greaves
> **Raised:** 2026-11-17
> **Area:** scripts/release.js, scripts/release.test.js, RELEASING.md
> **Stack:** worktree
> **Docs:** none: release tooling is documented in RELEASING.md, which this spec updates

## Summary

`scripts/release.js` gains a third pass of the suite, on Windows, through a
command the releaser configures with an environment variable. The pass runs
before the tag, so a Windows-only failure stops the release instead of
showing up in CI after the tags are pushed.

## Problem

`release.js` runs the suite on the releasing machine (macOS) and on Linux in
Docker. Windows runs only in `ci.yml`, after the push, and a tag pushed with a
red Windows run cannot be taken back. That has now happened three times in a
row: `bug-afterswitch-tests-windows`, `bug-review-serve-spawn-sh` and
`bug-no-shell-test-windows`, the last of them right after five releases were
cut on 2026-11-17. The releaser already has a Windows VM that can see the
checkout through a Parallels shared folder, and a `vm` wrapper that runs
commands inside it.

## Acceptance criteria

- With `SKITTERSPEC_RELEASE_WINDOWS` set (e.g. `vm pnpm test`), the plan lists
  a Windows run step after the Linux one, and `--yes` runs it before the
  commit and tag.
- A red Windows run stops the release with nothing committed or tagged, and
  restores the bumped files exactly as a red native or Linux run does.
- With the variable unset, the plan and the run say
  `note:  Windows run skipped — SKITTERSPEC_RELEASE_WINDOWS not set`, and the
  release proceeds.
- `--skip-windows` skips a configured run, and says so in the plan.
- `RELEASING.md` documents the variable, the shared-folder requirement and the
  flag.

## Decisions

1. **The Windows command is the releaser's, set by environment variable.** The
   VM belongs to one machine, so `SKITTERSPEC_RELEASE_WINDOWS` holds the whole
   command (`vm pnpm test`), and `release.js` runs it from the repo root with
   the shell. Same reasoning as `SKITTERSPEC_READER`. Rejected: a committed
   key, which every other releaser would inherit even though the command only
   works on one Mac.
2. **The VM tests the same tree through a shared folder.** The suite has to see
   the tree that is about to be tagged, with the bump written but not
   committed. A Parallels share of the checkout gives exactly that, with
   nothing copied. Rejected: a separate clone in the VM, which would need the
   tree sent across and could test something other than what gets tagged.
3. **`windowsGate` mirrors `linuxGate`: `run` · `skipped` · `unknown`.**
   Unset → `unknown`, which says so loudly and does not block
   (`.claude/rules/negative-checks.md` rule 4). Rejected: refusing to tag
   without Windows, which would block anyone with no VM.
4. **It runs after Linux.** It is the slowest pass, so failures common to every
   platform show up first, in seconds.
5. **No test-hygiene lint in this spec.** Running Windows before the tag catches
   the class of failure by actually running it, while a lint for one shape of
   it would be narrow and easy to get around.

## Solution overview

- `windowsGate({ command, skip })` → `{ state, why }`. It is pure, and the
  caller reads `process.env.SKITTERSPEC_RELEASE_WINDOWS`.
- In `buildPlan`, when `windows.state === 'run'`, add a `verify` step after the
  Linux one: `cmd` is the command, run through the shell from the root, with
  the same `restore` list.
- `formatPlan` prints the skipped note in every non-`run` state, like Linux.
- `--skip-windows` is parsed beside `--skip-linux` and listed in the usage text.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Env var | add | `SKITTERSPEC_RELEASE_WINDOWS` (release.js only) |
| CLI flag | add | `release.js --skip-windows` |
| Release plan | update | Windows verify step / skipped note |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Windows gate in release.js | ✅ | [01-windows-gate.md](01-windows-gate.md) |

## Open questions

- None

## Changelog

- 2026-11-17 — Spec created after the third Windows-only failure found after
  tagging (`bug-no-shell-test-windows`).
