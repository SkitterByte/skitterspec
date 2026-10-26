---
linear_issue_id: "SKS-410"
github_issue_id: "#3"
---

# Phase 2 — GitHub adapter core (REST, GraphQL board, dialect) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `packages/github` speaks GitHub — config, credentials, an API adapter
fulfilling the kit's op contract, board-backed status — proven by mock-based
tests.

## Tasks

- [x] `github.config.json` via the kit's config factory: `github.{owner, repo,
      project, statusField, labels, issueTypes?}`, `states`, `intake`,
      `auth.tokenEnv`, `apply.transport`, `sync.baseDir:
      specs/.core/github-base`, `sync.fieldOwnership`, `fields` defaulting to
      `github_identifier`/`github_url`/`github_issue_id`; plus
      `github.config.json.example` and `github.config.md`.
- [x] Credentials: `GITHUB_TOKEN`/`GH_TOKEN` env precedence over the kit's v2
      store under the `github` namespace; token never logged.
- [x] HTTP client on the kit's `makeHttpClient`: REST (`readIssue`,
      `createIssue`, `createSubIssue` — create then `POST .../sub_issues`,
      `updateIssue`, `listSubIssues`, `searchIssues`, `listComments`,
      `createComment`, `readViewer`) and a GraphQL call; primary + secondary
      rate-limit retry (`retry-after`, `x-ratelimit-reset`).
- [x] Board resolution: look up the project by owner + number, its Status
      field and option ids by name, cached per run; `listIssueStates` returns
      the option names so the kit's state gate works unchanged.
- [x] Status write (Decision 3): add to board if absent, set the Status option;
      terminal buckets also close with `state_reason`; reopening a closed issue
      that moved back out of a terminal bucket.
- [x] Spec vs phase labelling: labels on a personal owner; issue type when
      `issueTypes` is configured and the owner is an org.
- [x] GFM dialect: near-identity write, canonical read stream for snapshot
      hashing + verify; 65,536-char body refusal.
- [x] Remote accessors: status from the board item's Status value (not the
      issue's open/closed), description from `body`, children from sub-issues.
- [x] Mock tests: create/update/read-back, sub-issue linking, board add + Status
      set, unknown option refusal, close/reopen, 403 secondary-limit retry,
      and stays-silent cases (missing config opts out, an issue already on the
      board is not re-added). Full workspace suite green.

## Notes (built)

- **Ops** (`src/api.js`): `readIssue` (GraphQL — one query carries body,
  assignees, labels, parent, sub-issues and the board item's Status),
  `createIssue`, `createSubIssue` (create, then link by database id; a failed
  link refuses with the orphan as `err.created`), `updateIssue`,
  `setIssueOpen`, `listSubIssues`, `searchIssues`, `resolveBoard` (cached per
  adapter), `listIssueStates`, `addToBoard` (idempotent by GitHub's contract),
  `setFieldOption` / `setStatus` (by option NAME; a no-op when already set),
  `readViewer` (scopes from `X-OAuth-Scopes`, `null` = fine-grained, cannot
  tell), `listLabels`, `listComments` (paged), `createComment`.
- **Ids:** `id` is the issue number as a string, `identifier` `#N`. Node and
  database ids ride on the normalised issue and are never stamped (Decision 6
  corrected — see the Changelog).
- **The board item is matched by number AND owner**, since two owners can each
  have a board 7; a test pins it.
- **Which bucket closes the issue is config's call** (`closeReasonFor`,
  `closeReasonForBucket`), not the adapter's; phase 3's apply ops combine
  `setStatus` with `setIssueOpen`. Labels/types per kind: `markersFor`.
- **Kit change:** `withRateLimitRetry` takes `isLimited` (default: 429 only,
  so linear/jira are unchanged) and `retryDelay` honours
  `X-RateLimit-Reset`. GitHub's adapter treats a 403 with `Retry-After` or a
  spent `X-RateLimit-Remaining` as a limit; a plain 403 is not retried.
- **The GraphQL shapes are assumed, not yet observed** — phase 7's moved spike
  task checks them against the live API.
