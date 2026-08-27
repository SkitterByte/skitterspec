---
linear_issue_id: "SKI-18"
---

# Phase 1 — Config, MCP ops & the `linked` CLI ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the offline foundations — new config keys, the Linear MCP additions the
picker and intake need, and a deterministic way to know which issues are already
adopted — all unit-tested without touching the network.

## Tasks

- [x] Add an `intake` block to the frozen defaults in
      `packages/linear/src/config.js`: `{ label: '', bugLabels: [] }`, with
      `assign` validation (`string?`, `string[]?`) alongside the existing keys.
- [x] Re-document `linear.projectId` as the picker **default** (not a mandate) in
      `config.js` comments — behaviour change lands in Phase 2.
- [x] Add a `projectList` matcher to `MATCHERS` in `packages/linear/src/mcp.js`
      (`/list_?projects?/i`, `/projects?_?list/i`) and a `listProjects(teamId)`
      adapter method. Leave `REQUIRED` unchanged — a server without it must still
      push; the picker just becomes unavailable.
- [x] Add a `searchIssues({ label, query, teamId })` adapter method over the
      already-discovered `issueList` op — no new matcher. (`issueRead` already
      exists and is `REQUIRED`, so `/spec <ISSUE-REF>` needs nothing new.)
- [x] Add `skitterspec spec-sync linked [--json]` to `packages/linear/src/cli-sync.js`
      (a fifth case beside `normalize|push|record|status`): walk
      `specs/**/00-overview.md`, emit `[{ spec, identifier }]` using the existing
      `identifierOf` frontmatter reader. Offline, no MCP.
- [x] Add/extend tests: config defaults + validation for `intake`; `discoverLinear`
      resolving `projectList` and degrading cleanly when the server lacks it;
      `linked` against a fixture spec tree (stamped, unstamped, legacy bare-file
      spec). Run the project's typecheck and test commands — green before the
      phase is done.

## Notes

`identifierOf` in `cli-sync.js` reads `frontmatter.linear_identifier` for the
snapshot sidecar key, but it only ever looks at **one** spec (and falls back to
the folder name when unlinked, which `linked` must not do). So `linked` got its
own non-throwing `linkedIdentifier` reader over the same field, sharing
sync-core's `parseFrontmatter` rather than a second parser.

Two small shared-package exports were needed and taken (both purely additive, no
behaviour change): `parseFrontmatter` from the `sync-core` barrel, and `BUCKETS`
from `common/src/env/resolve.js` — the latter so the bucket list isn't duplicated
in the Linear package and left to drift.

`intake` is documented in `linear.config.md` / `.json.example` already, since the
key exists as of this phase. `linear.projectId`'s prose there still describes
today's behaviour and changes in Phase 2, when the picker actually replaces the
config read.
