---
linear_issue_id: "SKS-44"
---

# Phase 3 — `spec-sync stage` — the write verb ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a CI job moves exactly the tickets a release contains to a declared
stage, refuses to touch anything it was not configured for, and says what it
skipped.

## Tasks

- [ ] Add `spec-sync stage <key> [<range>] [--apply] [--json]`, reusing
      `released`'s range resolution and `ticketsInRange` rather than forking
      them. `released` stays read-only.
- [ ] **Dry run is the default**; `--apply` is required to write. The resolved
      range, the target state name, and the plan print in both modes.
- [ ] Refuse with a useful message when `release.stages` is absent or the key is
      not in it — list the declared keys.
- [ ] Filter refs to `linear.teamKey`; report each skipped ref with the reason.
- [ ] Filter refs to specs in the `complete` bucket via `listSpecs`
      (`{identifier, spec, bucket}`); report each skipped ref as
      "spec not complete — push owns its state".
- [ ] Report the `N commit(s) carry no ref` count on every run: a missed `Refs:`
      trailer and a legitimate chore commit look identical, and silence would
      read as "everything is accounted for".
- [ ] Warn (never refuse) on a backwards or skipping move relative to
      `release.stages` order.
- [ ] Resolve every state id before the first write, mirroring `applyOneSpec`, so
      a bad config cannot strand the run half-applied.
- [ ] API transport only for `--apply`; on MCP, print the plan and say so.
      Non-zero exit on failure so a pipeline stage fails visibly.
- [ ] Tests: dry run writes nothing; `--apply` moves only matching refs;
      **a range whose refs are all foreign/incomplete moves nothing, exits 0, and
      says why** (the stays-silent case); an empty range; an unknown stage key;
      a backwards move warns and proceeds; unreferenced commits counted.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The CI range is `<previous-tag>..<this-tag>`, not the `git describe` default —
that default is a developer convenience and a pipeline should always pass the
range explicitly. Print the resolved range in every mode so a wrong guess is
visible rather than silent.
