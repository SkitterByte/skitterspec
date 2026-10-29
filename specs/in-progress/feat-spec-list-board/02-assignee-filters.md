---
github_issue_id: "#61"
---

# Phase 2 — Assignee, `--mine`, `--by` on Azure and GitHub ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Azure and GitHub listings show who each ticket is assigned to and
filter by `--mine` / `--by <user>`, including tickets with no spec. Proven by
list tests against fake adapters.

## Tasks

- [x] Azure `api.js` `searchIssues`: batch-read `System.AssignedTo` and map it
      to `{ id, name }`. Add an assignee clause to the WIQL when filtering.
- [x] GitHub `api.js` list: carry the issue's assignees and filter by login.
- [x] Both `specSyncList`:
      - add an assignee column, and `assignee` in `--json`;
      - add `--mine` (through `whoami`) and `--by <user>` (through `users`),
        mutually exclusive;
      - `--mine` refuses with the reason when identity is unknown, never
        falling back to everyone (Linear's contract);
      - rows with no spec print `(no spec)`.
- [x] `/spec-list` skills (azure, github): add the flags to the table, and
      remove the stale "not yet shipped for the GitHub provider" caveat.
- [x] Tests:
      - assignee column;
      - `--mine` with a known identity;
      - `--mine` with unknown identity refuses (stays-silent: lists nothing);
      - `--by` resolves a name;
      - `--mine` with `--by` refuses;
      - an unspec'd ticket appears under `--mine`.
- [x] Run `pnpm test`: 4251 passed, 0 failed. The contract is shared in
      `provider-kit/src/list-assignee.js`, with its own tests.
