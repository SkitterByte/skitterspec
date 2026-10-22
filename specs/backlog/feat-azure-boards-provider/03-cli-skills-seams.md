---
linear_issue_id: "SKS-420"
---

# Phase 3 — CLI, MCP, skills, seams, intake ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec-azure-boards spec-sync` ships the full Jira-v1 core on
both transports, the skills and seam fragments compose, and intake adopts an
existing work item — proven by the workspace suite plus the seam composition
tests.

## Tasks

- [ ] `cli-sync.js` on the kit's orchestration: link, plan/apply/stamp/record/
      verify, status, list, linked, ref, released, preserve, doctor,
      credentials, init-config, states.
- [ ] Frontmatter vocabulary: `azure_identifier` (`AB#123`), `azure_url`,
      `azure_item_id`; ref pattern `AB#\d+` supplied to the kit;
      `refs.foreignPatterns` classified as known-foreign in `released`.
- [ ] MCP fallback (`mcp.js`): matchers for the official server's work item,
      link and comment tools; per-command degradation per phase 1's
      cannot-do list (impossible ops exit 1; the rest hand skill
      instructions + file handoff).
- [ ] Intake: adopt an existing work item by id/URL, route on
      `intake.bugTags`/`hotfixTags` (hotfix wins), preserve the original
      description as a comment before the linking push.
- [ ] Skills + seam fragments (push, status, sync, list, setup) composed into
      the shared skills at build time; `commit-trailers.md` for `Refs: AB#N`.
- [ ] Doctor: capability probes per phase 1 (token valid, item read, item
      write, comment write), each failure named; unknown-state and
      missing-type refusals surfaced.
- [ ] Tests green: CLI command routing, intake routing (bug/hotfix/plain),
      preserve ordering, MCP degradation table, seam composition. Full
      workspace suite (`pnpm test`).
