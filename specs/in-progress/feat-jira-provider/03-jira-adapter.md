---
linear_issue_id: "SKS-373"
---

# Phase 3 — Jira adapter core ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `packages/jira` speaks Jira Cloud — config, credentials, REST v3
adapter fulfilling the op contract, ADF dialect, transition mapping — proven by
mock-based tests.

## Tasks

- [ ] `jira.config.json` via the kit's config factory: `jira.{siteUrl,
      projectKey, issueType, subtaskType}`, `states` (bucket → status name),
      `apply.transport`, `sync.baseDir: specs/.core/jira-base`,
      `sync.fieldOwnership`, `fields` defaulting to `jira_identifier`/
      `jira_url`/`jira_issue_id`; plus `jira.config.json.example` and a
      `jira.config.md` reference.
- [ ] Credentials: `JIRA_EMAIL` + `JIRA_API_TOKEN` env precedence over the v2
      store (namespaced by site URL); basic-auth header assembly; token shape
      never logged.
- [ ] REST v3 client on the kit's `makeHttpClient`: `readIssue`, `createIssue`,
      `createSubIssue` (subtask type + `parent`), `updateIssue`,
      `listSubIssues`, `searchIssues` (JQL, project-scoped, escaped),
      `listIssueStates` (`/project/{key}/statuses`), `readViewer` (`/myself`),
      `listComments`/`createComment` (for preserve). Op-contract test from the
      kit runs against it.
- [ ] Transition resolution (Decision 8): `transitionTo(issueKey, targetStatus)`
      fetches `/issue/{key}/transitions`, applies the one whose `to.name`
      matches case-insensitively; no match → named refusal listing the
      transitions that do exist. Comment the blind spot: a workflow can reach a
      status only via intermediate steps, and v1 does not path-find.
- [ ] ADF dialect, write side: markdown→ADF renderer covering the projection
      subset — headings, paragraphs, strong/em/inline code, links, bullet +
      ordered lists (nested), task checklists, code fences, tables. No new
      runtime dependency.
- [ ] ADF dialect, read side: ADF→canonical text stream for snapshot hashing
      (`descriptionStream`) and verify read-back; round-trip property: render →
      stream → equals the projection's own canonical stream.
- [ ] Remote accessors (phase 1 hooks): status from `fields.status.name`,
      description from the ADF field, subtasks from `fields.subtasks`.
- [ ] Mock-based tests: fixtures for create/update/read-back, transition
      resolution incl. the no-path refusal, ADF round-trips (each node type +
      a full spec projection), 429 retry, and stays-silent cases (missing
      config exits 0 opted-out, unknown viewer is a normal state).
- [ ] Full workspace suite green.

## Notes

Whether Jira renders ADF `taskList` in issue descriptions everywhere is
verified in phase 6's live smoke; the renderer keeps a bullet-list fallback
switch in case it does not.
