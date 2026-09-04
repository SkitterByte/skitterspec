---
linear_issue_id: "SKS-44"
---

# Phase 3 — `spec-sync stage` — the write verb ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a CI job moves exactly the tickets a release contains to a declared
stage, refuses to touch anything it was not configured for, and says what it
skipped.

## Tasks

- [x] Add `spec-sync stage <key> [<range>] [--apply] [--json]`, reusing
      `released`'s range resolution and `ticketsInRange` rather than forking
      them. `released` stays read-only.
- [x] **Dry run is the default**; `--apply` is required to write. The resolved
      range, the target state name, and the plan print in both modes.
- [x] Refuse with a useful message when `release.stages` is absent or the key is
      not in it — list the declared keys.
- [x] Filter refs to `linear.teamKey`; report each skipped ref with the reason.
- [x] Filter refs to specs in the `complete` bucket via `listSpecs`
      (`{identifier, spec, bucket}`); report each skipped ref as
      "spec not complete — push owns its state".
- [x] Report the `N commit(s) carry no ref` count on every run: a missed `Refs:`
      trailer and a legitimate chore commit look identical, and silence would
      read as "everything is accounted for".
- [x] Warn (never refuse) on a backwards or skipping move relative to
      `release.stages` order.
- [x] Resolve every state id before the first write, mirroring `applyOneSpec`, so
      a bad config cannot strand the run half-applied.
- [x] API transport only for `--apply`; on MCP, print the plan and say so.
      Non-zero exit on failure so a pipeline stage fails visibly.
- [x] Tests: dry run writes nothing; `--apply` moves only matching refs;
      **a range whose refs are all foreign/incomplete moves nothing, exits 0, and
      says why** (the stays-silent case); an empty range; an unknown stage key;
      a backwards move warns and proceeds; unreferenced commits counted.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Done 2026-09-04. Full suite green: **1170/1170** (+26 over phase 2).

Two things the plan did not anticipate:

**A lifecycle state must win over a rung of the same name.** `states.complete`
and a final `prod` rung are both naturally `Done`, so a freshly-completed spec
read as *already deployed to prod*, and its first real deploy was warned about as
a move backwards. `stageOrderWarning` now takes the bucket state names and treats
a match among them as a lifecycle position, never a rung — the same precedence
`bucketForState` already uses.

**A fourth skip category was needed.** The plan had foreign and unfinished refs;
a ref that is this team's but that no spec claims is neither. It may be
tracker-only work or a typo in a trailer, and nothing here can tell which, so it
is reported and left alone.

`readCommitRange` was extracted from `released` and is shared, so both verbs
cannot disagree about what a release contains.

The CI range is `<previous-tag>..<this-tag>`, not the `git describe` default —
that default is a developer convenience and a pipeline should always pass the
range explicitly. Print the resolved range in every mode so a wrong guess is
visible rather than silent.
