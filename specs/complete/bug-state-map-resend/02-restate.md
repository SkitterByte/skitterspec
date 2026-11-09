---
github_issue_id: "#138"
---

# Phase 2 — `spec-sync restate` for items pushed before names were recorded ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** A safe way to bring already-pushed child states up to the current
config, with no snapshot to diff against. This is what fixes ereqs's 141
Tasks.

## Tasks

- [x] `spec-sync restate <spec>|--all <bucket> [--parents] [--apply]`: read each linked
      item's live state and settle it to the current config through the
      phase-1 guard. Children only by default, and `--parents` opts the spec
      item in. Dry-run is the default and prints one line per item: move,
      already there, or left alone and why.
- [x] On `--apply`, record `stateNames` into each spec's snapshot, so the
      next state-map change is detected by `plan`.
- [x] Over MCP, or with no credential, say so and exit 0 without writing.
- [x] Docs: `docs/azure-boards.html` covers changing a state map and
      `restate`. Bump its `verified:`.
- [x] Tests: dry-run writes nothing; `--apply` moves Resolved → Closed on
      Tasks and leaves a parent at On Prod alone; a later state is left and
      named; MCP exits 0. Run the full suite.

## Notes

- `restate` records names only into a snapshot that already exists. A
  snapshot holding nothing but names would make `plan` treat every phase as
  unrecorded and resend all their bodies.
- `docs-freshness impact` also lists the GitHub, Jira and Linear pages,
  because they cover sync-core. Their behaviour is unchanged, since only
  Azure supplies the name lookup.
