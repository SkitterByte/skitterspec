---
linear_issue_id: "SKS-83"
---

# Phase 1 — The `spec-env view` verb ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env view [spec]` prints a diff summary and opens the configured
viewer at the spec's worktree, refusing by name whenever a viewer would mislead.

## Tasks

- [ ] Add a pure planner (`planView` in `packages/common/src/env/provision.js`
      or a small `view.js`): given the spec + ctx, return the summary lines, the
      expanded viewer command (or null), and the refusals — `mode: checkout`
      ("the checkout is the view"), no worktree ("run /spec-go <name> first"),
      spec live ("its worktree is a detached HEAD — the primary checkout already
      shows this spec").
- [ ] Wire `spec-env view` into `cli.js`: resolve the spec (argument, else the
      worktree you are standing in), gather branch + `status --short` +
      `diff --stat` from the worktree, expand `open.view` (fallback
      `open.command`) with the standard tokens, **execute** it, and say what was
      opened. Neither configured → print the summary and the worktree path only.
- [ ] Route the unknown case to print-only: if the viewer command exits non-zero,
      report it and still leave the summary — never retry or guess a different
      opener.
- [ ] Add planner tests: each refusal fires by name; a live spec is refused even
      though its worktree exists; the fallback chain view → command → print-only;
      a stays-silent case proving an ordinary provisioned spec opens.
      Run `pnpm test` — green before the phase is done.
