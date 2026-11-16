---
github_issue_id: "#209"
---

# Phase 2 — Run and report on take and release; docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `live take` and `live release` run the planned commands in the primary
checkout after their checkout and report them — proven by CLI tests against a
real git fixture — and the docs describe the key.

## Tasks

- [ ] In `specEnvLiveTake`, pass the `onto...branch` range already read for
      `migrationsHit` — distinguishing a failed read (`null`, unknown) from an
      empty diff — and run `afterSwitch.commands` in the primary checkout after
      the receipt is written.
- [ ] In `specEnvLiveRelease`, read `base...branch` before the checkout and run
      the same way after the worktree is re-attached and the receipt cleared.
- [ ] Run each command through the shell with output captured; stop at the
      first non-zero exit; print `ran:` lines with the reason comment,
      `skipped (nothing in the switch matched):` with globs, and on failure a
      `!` line with the command, exit status, the last 20 output lines and the
      commands not run. Never undo the switch.
- [ ] Unset or empty list → output byte-identical to today (no `after switch`
      section).
- [ ] CLI tests (`test/cli-spec-env-live.test.js`): matched command runs and
      its side effect is visible in the primary checkout; skipped is listed and
      not run; a failing command stops the list and leaves the branch checked
      out; release runs the list after switching back; **stays silent** with no
      key configured.
- [ ] Document `live.afterSwitch` in `assets/core/env.config.md` (beside
      `live.migrations`, pointing at the `afterLand` grammar rather than
      restating it, and saying why it is a separate list); note it in the live
      paragraph of `assets/rules/spec-planning.md` and in `docs/reference.html`,
      bumping that page's `verified:`.
- [ ] Run `pnpm test` — green before the phase is done.
