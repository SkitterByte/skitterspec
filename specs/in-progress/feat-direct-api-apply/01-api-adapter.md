# Phase 1 — GraphQL adapter + credential resolution ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `packages/linear/src/api.js` fulfils the `makeAdapter` operation
contract against Linear's GraphQL API, and a key is resolved from the
environment with a loud, early failure — proven by tests with an injected
`fetch`.

## Tasks

- [x] Confirm Linear's current auth header form for a personal API key against
      Linear's own docs before writing the client (Decision 3 / Open question).
- [x] Add `resolveApiKey(config, env)` — reads `config.auth.keyEnv` or defaults
      to `LINEAR_API_KEY`. Returns the key, or a structured "no key" result the
      caller can branch on. Never returns the key in an error message.
- [x] Extend the config loader with `auth.keyEnv` (string, optional) and
      `apply.transport` (`api`|`mcp`, optional), validated like the existing
      enums — a typo is a clear error, not a silent fallback.
- [x] Add `makeApiAdapter({ apiKey, fetch })` implementing every op in `mcp.js`'s
      `makeAdapter`: `readIssue`, `createIssue`, `updateIssue`, `createSubIssue`,
      `updateSubIssue`, `listSubIssues`, `searchIssues`, `listProjects`. `fetch`
      is injectable so tests stay offline.
- [x] Map the ops onto `issueCreate` / `issueUpdate` mutations and the matching
      queries; sub-issues are `issueCreate` with `parentId`.
- [x] Add `fetchWorkspaceStates(adapter, teamId)` returning the same shape
      `--workspace-states` accepts today, so the existing state check is reused
      rather than duplicated.
- [x] Resolve local bucket names to Linear state ids via `config.states` — the
      API needs a `stateId`, not the name the MCP tool accepted.
- [x] Fail loudly and early: a missing or rejected key must fail **before** any
      write, naming the env var it looked for.
- [x] Redact by construction — assert in tests that the key appears in no error,
      no log line, no plan JSON, no snapshot, and no stamped frontmatter.
- [x] Add tests with an injected `fetch`: each op issues the expected mutation;
      a GraphQL `errors` payload surfaces as a clear failure; a 401 names the env
      var; the adapter satisfies the same shape as the MCP one. Run the project's
      test command — green before the phase is done.

## Notes

Linear's auth header is confirmed: the personal API key goes in `Authorization`
**raw, with no `Bearer` prefix** — the opposite of the OAuth convention, and
sending `Bearer lin_api_…` fails authentication. Endpoint is
`https://api.linear.app/graphql`. Source: Linear's own developer docs.

One op has no MCP counterpart: `listIssueStates`, which is what lets the API path
fetch workspace states itself instead of requiring `--workspace-states`. The
contract test asserts the API adapter is never *missing* an MCP op, rather than
that the two sets are equal, so additions like this stay legal.

The adapter is the only new place that knows GraphQL, mirroring `mcp.js` as the
only place that knows MCP tool names. Keeping both behind one interface is what
lets phase 2 be written once.
