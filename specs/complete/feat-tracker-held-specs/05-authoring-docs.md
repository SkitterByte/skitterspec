---
github_issue_id: "#128"
---

# Phase 5 — Authoring, setup skills, docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** new specs carry a `## Summary`, and a project can pick the summary
profile without reading a config reference.

## Tasks

- [x] `/spec`: template gains `## Summary` and `## Acceptance criteria`, the
      grill's item 2 asks for the criteria, and the body rules name the pair as
      ticket-facing; `/spec-review` offers both when missing, never unasked
- [x] Setup skills (GitHub, Linear, Jira, Azure): a "What does a ticket
      carry?" step — summary recommended, spec via `--description spec`, the
      phase mode named with the parallel-phases reason; GitHub also offers
      `summary.progressField`
- [x] `spec-planning.md` ticketing section: what the ticket carries per mode
- [x] MCP path: a `spec-sync splice <spec> --live <f> [--phase <ref>]` verb in
      all four providers (shared kit `splice.js`; prints the body or nothing,
      exit 1 on a damaged block); every `/spec-push` §4a writes exactly what
      it prints when the plan's new `descriptionMode` is `summary`. `/spec`'s
      MCP linking defers to those steps, so it is covered
- [x] `init-config` for Linear, Jira and Azure writes
      `mapping.description: "summary"` (`--description spec` opts out)
- [x] Skill and seam text that says a sub-issue carries the task checklist now
      says that is `spec` mode (`/spec-push` ×4, `spec-tracker-link` ×4)
- [x] linear, jira and azure-boards pages carry the summary model (provisional
      heading delimiter named); `splice` in every engine table; `verified:`
      bumped on index, github, linear, jira, azure-boards and reference
- [x] Tests: `packages/provider-kit/test/splice-skill-text.test.js` (4),
      splice verb (3, GitHub), init-config `--description` (Linear) and the
      updated init-config pins; docs-freshness and docs-claims green.
      `pnpm test`: 4528 passed
