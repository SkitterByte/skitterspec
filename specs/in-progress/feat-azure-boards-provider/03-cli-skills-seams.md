---
linear_issue_id: "SKS-420"
github_issue_id: "#12"
---

# Phase 3 — CLI, MCP, skills, seams, intake ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec-azure-boards spec-sync` ships the full Jira-v1 core on
both transports, the skills and seam fragments compose, and intake adopts an
existing work item — proven by the workspace suite plus the seam composition
tests.

## Tasks

- [x] `cli-sync.js` on the kit's orchestration: link, plan/apply/stamp/record/
      verify, status, list, linked, ref, released, preserve, doctor,
      credentials, init-config, states.
- [x] Frontmatter vocabulary: `azure_identifier` (`AB#123`), `azure_url`,
      `azure_item_id`; ref pattern `AB#\d+` supplied to the kit;
      `refs.foreignPatterns` classified as known-foreign in `released`.
      *(Adjusted: the kit seam does not exist yet — `released` REFUSES with the
      dependency named, and the pattern + foreignPatterns wiring moves to a
      task below, blocked on `feat-github-provider` phase 1. See Notes.)*
- [x] MCP fallback (`mcp.js`): matchers for the official server's work item,
      link and comment tools; per-command degradation per phase 1's
      cannot-do list (impossible ops exit 1; the rest hand skill
      instructions + file handoff).
- [x] Intake: adopt an existing work item by id/URL, route on
      `intake.bugTags`/`hotfixTags` (hotfix wins), preserve the original
      description as a comment before the linking push.
- [x] Skills + seam fragments (push, status, sync, list, setup) composed into
      the shared skills at build time; `commit-trailers.md` for `Refs: AB#N`.
- [x] Doctor: capability probes per phase 1 (token valid, item read via
      `--check-remote`, states, identity search), each failure named;
      unknown-state refusals surfaced.
- [x] Tests green: CLI command routing, intake routing (bug/hotfix/plain),
      preserve ordering, MCP degradation table, seam composition. Full
      workspace suite (`pnpm test`).

## Notes

- `released` refuses by design rather than mis-scanning: the kit's trailer
  scan hardcodes `KEY-N`, so running it would count every `AB#n` ref as
  unreferenced — an accusation against a healthy repo. The refusal names
  `feat-github-provider` as the dependency (spec Decision 2 forbids hoisting
  the seam from here).
- `states`/validation use the UNION of `workItemType` and `childType` states —
  one `states` map serves both the spec item and its children, and the two
  types can have different state sets (Agile: User Story vs Task).
- The setup skill is `/spec-azure-setup`; `commands.js` landed here beside the
  `cli-sync.js` it routes to, as phase 2 deferred.
