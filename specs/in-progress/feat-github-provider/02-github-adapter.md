---
linear_issue_id: "SKS-410"
---

# Phase 2 — GitHub adapter core (REST, GraphQL board, dialect) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `packages/github` speaks GitHub — config, credentials, an API adapter
fulfilling the kit's op contract, board-backed status — proven by mock-based
tests.

## Tasks

- [ ] `github.config.json` via the kit's config factory: `github.{owner, repo,
      project, statusField, labels, issueTypes?}`, `states`, `intake`,
      `auth.tokenEnv`, `apply.transport`, `sync.baseDir:
      specs/.core/github-base`, `sync.fieldOwnership`, `fields` defaulting to
      `github_identifier`/`github_url`/`github_issue_id`; plus
      `github.config.json.example` and `github.config.md`.
- [ ] Credentials: `GITHUB_TOKEN`/`GH_TOKEN` env precedence over the kit's v2
      store under the `github` namespace; token never logged.
- [ ] HTTP client on the kit's `makeHttpClient`: REST (`readIssue`,
      `createIssue`, `createSubIssue` — create then `POST .../sub_issues`,
      `updateIssue`, `listSubIssues`, `searchIssues`, `listComments`,
      `createComment`, `readViewer`) and a GraphQL call; primary + secondary
      rate-limit retry (`retry-after`, `x-ratelimit-reset`).
- [ ] Board resolution: look up the project by owner + number, its Status
      field and option ids by name, cached per run; `listIssueStates` returns
      the option names so the kit's state gate works unchanged.
- [ ] Status write (Decision 3): add to board if absent, set the Status option;
      terminal buckets also close with `state_reason`; reopening a closed issue
      that moved back out of a terminal bucket.
- [ ] Spec vs phase labelling: labels on a personal owner; issue type when
      `issueTypes` is configured and the owner is an org.
- [ ] GFM dialect: near-identity write, canonical read stream for snapshot
      hashing + verify; 65,536-char body refusal.
- [ ] Remote accessors: status from the board item's Status value (not the
      issue's open/closed), description from `body`, children from sub-issues.
- [ ] Mock tests: create/update/read-back, sub-issue linking, board add + Status
      set, unknown option refusal, close/reopen, 403 secondary-limit retry,
      and stays-silent cases (missing config opts out, an issue already on the
      board is not re-added). Full workspace suite green.
