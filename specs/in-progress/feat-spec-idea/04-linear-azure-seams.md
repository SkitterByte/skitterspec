---
github_issue_id: "#214"
---

# Phase 4 — Linear and Azure Boards seams ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Linear and Azure Boards implement the same `spec-sync idea`
contract as GitHub. Jira registers `supports: false`, so it falls back to
the file.

## Tasks

- [ ] Linear: an idea is an issue with the idea label, in the team, with no
      project. Drop moves it to the team's cancelled state with a comment.
- [ ] Azure Boards: an idea is a work item tagged with the idea label and
      kept out of the spec area/iteration. Drop sets it to Removed with a
      comment.
- [ ] Jira: register `setProviderIdeaStore({ supports: false })` explicitly.
      Registering nothing reads as unknown and refuses capture.
- [ ] Tests: run each provider's add/list/drop against its fake, and check
      that Jira registers a positive no. Run `pnpm test`. It must be green.
