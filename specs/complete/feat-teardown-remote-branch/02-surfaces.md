---
linear_issue_id: "SKS-55"
---

# Phase 2 — Surfaces: CLI output, docs, skills ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the plan reaches a human in a form that gets confirmed rather than
pasted, and the config key is documented where operators look.

## Tasks

- [x] `specEnvDown()` prints `remote branch — confirm with the user first:` as a
      section separate from `run these:`, omitted entirely when empty
- [x] Document `teardown.deleteRemoteBranch` in `assets/core/env.config.md` —
      the three values, the `landed` gate, and that `--force` does not enable it
- [x] `/spec-complete` step 7: ask before running the remote delete, saying the
      branch is merged so it loses nothing; never fold it into the batch
- [x] `/spec-cancel` teardown: same ask, plus that a cancelled spec is normally
      unlanded so no section appearing is the expected case, not a fault
- [x] Tests — CLI, over a real git repo with a real remote: the push lands
      outside `run these:`, never-pushed prints nothing, unlanded-with-`--force`
      prints nothing, non-origin honoured, `"always"` folds in, `"never"` silent,
      and a branch pushed **without** `-u` is still found
- [x] Verify both built distributions carry the docs and both skill edits
- [x] Full suite green

## Notes

The CLI tests drive real git rather than the planner because the property in
question is a rendering one: asserting on `plan.remoteCommands` alone would still
pass if both lists printed under one heading.
