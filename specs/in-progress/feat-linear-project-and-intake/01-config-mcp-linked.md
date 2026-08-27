# Phase 1 — Config, MCP ops & the `linked` CLI 🔄

> Spec: [00-overview.md](00-overview.md) · **Status:** In progress

**Goal:** the offline foundations — new config keys, the Linear MCP additions the
picker and intake need, and a deterministic way to know which issues are already
adopted — all unit-tested without touching the network.

## Tasks

- [ ] Add an `intake` block to the frozen defaults in
      `packages/linear/src/config.js`: `{ label: '', bugLabels: [] }`, with
      `assign` validation (`string?`, `string[]?`) alongside the existing keys.
- [ ] Re-document `linear.projectId` as the picker **default** (not a mandate) in
      `config.js` comments — behaviour change lands in Phase 2.
- [ ] Add a `projectList` matcher to `MATCHERS` in `packages/linear/src/mcp.js`
      (`/list_?projects?/i`, `/projects?_?list/i`) and a `listProjects(teamId)`
      adapter method. Leave `REQUIRED` unchanged — a server without it must still
      push; the picker just becomes unavailable.
- [ ] Add a `searchIssues({ label, query, teamId })` adapter method over the
      already-discovered `issueList` op — no new matcher. (`issueRead` already
      exists and is `REQUIRED`, so `/spec <ISSUE-REF>` needs nothing new.)
- [ ] Add `skitterspec spec-sync linked [--json]` to `packages/linear/src/cli-sync.js`
      (a fifth case beside `normalize|push|record|status`): walk
      `specs/**/00-overview.md`, emit `[{ spec, identifier }]` using the existing
      `identifierOf` frontmatter reader. Offline, no MCP.
- [ ] Add/extend tests: config defaults + validation for `intake`; `discoverLinear`
      resolving `projectList` and degrading cleanly when the server lacks it;
      `linked` against a fixture spec tree (stamped, unstamped, legacy bare-file
      spec). Run the project's typecheck and test commands — green before the
      phase is done.

## Notes

`identifierOf` in `cli-sync.js` already reads `frontmatter.linear_identifier` for
the snapshot sidecar key — `linked` should reuse it rather than re-parse, so the
two can never disagree about what "adopted" means.
