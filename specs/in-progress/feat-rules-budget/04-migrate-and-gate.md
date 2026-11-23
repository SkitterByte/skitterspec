---
github_issue_id: "#286"
---

# Phase 4 — Migration, budget gate, docs, dogfood ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** existing hosts upgrade cleanly, the budget becomes a failing test,
and this repo runs the new layout.

## Tasks

- [x] Generate the list of section-stripped hashes: for each tagged release,
      hash its `spec-planning.md` with the `## Project conventions` section
      removed. Store the list as a checked-in asset, with a script to
      regenerate it.
- [x] `update`: when `spec-planning.md` is customized and its stripped hash
      is on the list, write the section's body to
      `.claude/rules/project-conventions.md` (unless that file exists), then
      install the new rule. Otherwise keep the file and warn with its size and
      the `--force` step.
- [x] Tests for the migration: a conventions-only edit is extracted, and an
      existing project-conventions.md is not overwritten. Stays-silent: an
      edit outside the section is kept, not extracted, and a pristine file
      takes the plain update path.
- [x] Budget test: for every distribution, install into a temp dir and
      assert `alwaysLoaded(dir).total ≤ 30000`. On failure, print the per-file
      rows. A comment explains why (Claude Code's 150k total, and the host
      owns the rest).
- [x] Update `docs/index.html` and `docs/review.html` where they describe the
      rules layout, then `node scripts/docs-freshness.js verify index review`.
- [x] Dogfood on this repo: `pnpm relink` (this repo symlinks its rules
      into the assets, where `update` would write through the links), and fill
      in `.claude/rules/project-conventions.md`.
- [x] Confirm in a fresh session that Claude Code reports no instruction-size
      warning:
  - [x] 1. In `/Users/reubengreaves/code/skitterspec-wt/rules-budget`, start a
        new Claude Code session (`claude`)
  - [x] 2. Check that the "instruction files … over the 150.0k-char total
        limit" warning does not appear at startup
- [x] Rebuild (`pnpm build`) and run `pnpm typecheck && pnpm test`, green
      before the phase is done.
