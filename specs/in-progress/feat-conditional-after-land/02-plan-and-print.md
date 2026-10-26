---
github_issue_id: "#37"
---

# Phase 2 — Planners and CLI: decide per entry against the land's range ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every plan that prints an after-land section decides each conditional
entry against the files the land changes, prints why, and routes an unknown
range to running — proven by planner and CLI tests.

## Tasks

- [ ] `afterLandFor(config, cwd, range)`: `range` is `string[]` (known, maybe
      empty) or `null` (unknown); return `{ cwd, commands, entries, range }`
      with `commands` = the entries to run, in config order
- [ ] `planIntegrate` / `planIntegrateCheckout`: take `ctx.changedFiles`; the
      no-op path passes `null`
- [ ] `specEnvIntegrate` (both modes): read
      `git diff --name-only <base>...<branch>`; a failed read → `null`
- [ ] `planHotfixLand`: range = union of files in the carried commits (or the
      `fixRange` diff); a failed read → `null`
- [ ] `afterLandSection`: print the run list with a `— <path> changed` reason on
      matched entries, a one-line note when the range is unknown, and a
      `skipped (nothing in the land matched):` block; output for a config of
      plain strings stays byte-identical
- [ ] Tests (`env-integrate`, `env-hotfix`, `cli-spec-env-integrate`):
  - [ ] a land touching `prisma/schema.prisma` runs the generate entry
  - [ ] a land touching only `src/` skips it, and says so
  - [ ] stays-silent: an empty range plans nothing conditional and prints no
        unknown-range note (`.claude/rules/negative-checks.md` rule 3)
  - [ ] no-op / failed read: conditional entries run, and the note says why
  - [ ] plain-string configs: plan and output unchanged
  - [ ] hotfix carry: range comes from the carried commits; a prod-only land
        still plans nothing
- [ ] Run `pnpm -r test` — green before the phase is done

## Notes

The range is read before the rebase, so it is `base...branch` (three-dot,
merge-base to tip) — not `base..branch`, which would list the base's own new
files after a divergent base and over-match.
