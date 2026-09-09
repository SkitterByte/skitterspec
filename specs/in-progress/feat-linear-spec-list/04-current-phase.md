---
linear_issue_id: "SKS-119"
---

# Phase 4 — the current phase on in-progress rows ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** an in-progress spec row also says which phase is live — `2/5 — <title>` —
without adding a lookup to any other row.

## Tasks

- [x] For in-progress rows only, fetch the spec's phase sub-issues
      (`adapter.listSubIssues(parentId)` on the API path; the parent filter on the
      MCP path) and pick the one whose state is the in-progress state.
- [x] Render it as `<n>/<total> — <phase title>`, where `n` is the sub-issue's
      position in the phase order, so the row says both where the work is and how
      much is left. (Phase order is the **identifier**, numerically —
      `sortOrder` is a Backlog-view position and tracks nothing about the plan.
      The row also carries the assignee, which the overview's example output
      shows but no phase had claimed.)
- [x] Handle the three real shapes without guessing: no sub-issue in progress
      (print nothing extra — a spec can sit in progress between phases), more than
      one (print the lowest-numbered and note the count), and `mapping.phases`
      resolved to a non-sub-issue mode for this spec's bucket (skip the lookup
      entirely — there are no sub-issues to read).
- [x] Skip the lookup for every non-in-progress row, so a backlog-only listing
      makes exactly one Linear call (decision 8).
- [x] Mirror the column in the `/spec-list` skill's MCP path and in `--json`.
- [x] Extend `test/cli-list.test.js`: the phase column on an in-progress spec;
      silence when no phase is in progress; two-in-progress reporting; a
      `section`-mode spec skipping the lookup; and a backlog-only listing making
      no sub-issue call at all.
- [x] Run `pnpm test` in `packages/linear` and at the repo root — green before the
      phase is done.

## Notes

`mapping.phases` is per-bucket resolvable (see the `phases:` line in
`spec-sync status`) — read it through the existing helper rather than assuming
`subissue` mode. A spec in `section` mode has no phase sub-issues, and asking for
them would report "no phase in progress" for a spec that is mid-build.
