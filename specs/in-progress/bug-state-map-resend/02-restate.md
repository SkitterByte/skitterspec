---
github_issue_id: "#138"
---

# Phase 2 — `spec-sync restate` for items pushed before names were recorded ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** A safe way to bring already-pushed child states up to the current
config, with no snapshot to diff against. This is what fixes ereqs's 141
Tasks.

## Tasks

- [ ] `spec-sync restate <spec>|--all [--parents] [--apply]`: read each linked
      item's live state and settle it to the current config through the
      phase-1 guard. Children only by default, and `--parents` opts the spec
      item in. Dry-run is the default and prints one line per item: move,
      already there, or left alone and why.
- [ ] On `--apply`, record `stateNames` into each spec's snapshot, so the
      next state-map change is detected by `plan`.
- [ ] Over MCP, or with no credential, say so and exit 0 without writing.
- [ ] Docs: `docs/azure-boards.html` covers changing a state map and
      `restate`. Bump its `verified:`.
- [ ] Tests: dry-run writes nothing; `--apply` moves Resolved → Closed on
      Tasks and leaves a parent at On Prod alone; a later state is left and
      named; MCP exits 0. Run the full suite.
