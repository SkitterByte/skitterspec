---
github_issue_id: "#214"
---

# Phase 4 — Linear and Azure Boards seams ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Linear and Azure Boards implement the same `spec-sync idea`
contract as GitHub. Jira registers `supports: false`, so it falls back to
the file.

## Tasks

- [x] Linear: an idea is an issue with the idea label, in the team, with no
      project. Drop moves it to the team's cancelled state with a comment.
- [x] Azure Boards: an idea is a work item tagged with the idea label and
      kept out of the spec area/iteration. Drop sets it to Removed with a
      comment.
- [x] Jira: register `setProviderIdeaStore({ supports: false })` explicitly.
      Registering nothing reads as unknown and refuses capture.
- [x] Tests: run each provider's add/list/drop against its fake, and check
      that Jira registers a positive no. Run `pnpm test`. It must be green.

## Notes

- Linear's idea label must already exist in the team. `add` refuses (with
  the text back) rather than creating a label. `searchIssues` gained an
  `openOnly` filter (state type is neither completed nor cancelled).
- Azure Boards reads "open" from each state's **category**, never from state
  names, because the process templates spell Done and Removed differently.
  `drop` moves the idea to the Removed-category state, falling back to
  Completed. The config key is `intake.ideaTag`, because Boards has tags
  rather than labels. `createIssue` and `searchIssues` gained `tags` and
  `tag`.
- In the docs tables, each provider's `idea` verb lists `/spec-idea` as the
  thing that runs it, not "you": the routing test requires a verb someone
  types to be routed by that provider's `/spec-sync` skill.
- Smoke test: the built Jira CLI files an idea into `specs/ideas.md`
  on main.
