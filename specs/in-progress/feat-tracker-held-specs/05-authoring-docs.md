---
github_issue_id: "#128"
---

# Phase 5 — Authoring, setup skills, docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** new specs carry a `## Summary`, and a project can pick the summary
profile without reading a config reference.

## Tasks

- [ ] `/spec`: write a `## Summary` paragraph (what the work needs, no phase
      breakdown) and grill for `## Acceptance criteria`; `/spec-review` offers
      both when missing
- [ ] `/spec-github-setup` and its provider peers: ask summary vs spec, and the
      phase mode, with the 2026-08-28 parallel-phases trade stated
- [ ] `spec-planning.md` ticketing section: what the ticket carries per mode
- [ ] `/spec-push` MCP path (and `/spec`'s): in summary mode, read the live
      body and splice the block before `issue_write`, never write the plan's
      block over the whole body; consider a `spec-sync splice` verb so the
      skill does not compose it
- [ ] `init-config` for Linear, Jira and Azure: write
      `mapping.description: "summary"` like GitHub's
- [ ] Skill text that says a sub-issue carries the phase's task checklist
      (`/spec`, `/spec-push`) — true only in `spec` mode
- [ ] Carry the phase 1 draft (index + github) to linear, jira and
      azure-boards once phase 3 settles the shape; bump each `verified:`
- [ ] Tests: skill-text assertions where the repo has them; docs-freshness test
      green
