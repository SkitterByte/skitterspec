---
linear_issue_id: "SKS-409"
---

# Phase 1 — Spike GitHub APIs + kit neutrality (ref pattern) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the API assumptions behind Decisions 2–5 are confirmed against a real
throwaway repo + board, and the kit no longer hardcodes a `KEY-N` ref shape —
proven by a refactor-only `skitterspec-linear`/`-jira` suite staying green.

## Tasks

- [x] *(moved to phase 7)* Spike on a throwaway public repo + user-owned board, recording results in
      this file's notes: sub-issue create/list (REST), `addProjectV2ItemById`,
      reading the Status field's options and setting one, a second `Deployed`
      single-select, close with `state_reason`, the Release create/update API.
- [x] *(moved to phase 7)* Confirm the token answer: classic PAT `repo`+`project` works on a
      user-owned board; record whether a fine-grained PAT does (Decision 5
      changes if it does).
- [x] *(moved to phase 7)* Confirm the board's built-in workflows (close → Done) do not fight the
      engine's own Status writes; record which to leave off in SETUP.
- [x] Check GitHub's official MCP server tool names for issues, sub-issues and
      projects; record which ops it cannot do (feeds phase 3's degradation).
- [x] `provider-kit/src/released.js`: replace the hardcoded `IDENTIFIER_RE`
      with a provider-supplied pattern (default the current `KEY-N` regex, so
      linear/jira pass nothing new); a comment names what would fool it.
- [x] `released` treats refs matching a configured `foreignPatterns` list
      (here `SKS-N`) as known history, not unreferenced.
- [x] Tests: `#N` scanning, foreign-pattern classification, and a stays-silent
      test — a commit body mentioning `#5` outside a `Refs:` trailer is not a
      ref. Full workspace suite green (`pnpm test`).

## Notes

Throwaway repo/board names go here once created. Nothing in this phase talks
to GitHub from tests — the spike is manual, the code change is offline.

## Notes (built)

- **The three live-spike tasks moved to phase 7's live smoke** on
  2026-10-22: they need a throwaway repo, a user-owned board and a classic PAT
  set up by the operator, and the adapter is built against mocks in the
  meantime. A finding there that moves Decision 2–5 is fixed then.
- **MCP findings** (github/github-mcp-server README, remote at
  `https://api.githubcopilot.com/mcp/`, OAuth or PAT bearer):
  issues — `issue_read`, `issue_write`, `sub_issue_write`, `add_issue_comment`,
  `update_issue_comment`, `list_issues`, `search_issues`, `list_issue_types`,
  `list_issue_fields`; projects — `projects_get`, `projects_list`,
  `projects_write`; releases — `get_latest_release`, `get_release_by_tag` only.
  So over MCP: link/push/status/preserve/assign are possible; **release
  create/complete is impossible** (no release write tool) and must exit 1 and
  say so — phase 5 degrades accordingly. Which PAT type `projects_write` needs
  over MCP is undocumented; the live spike answers it with the REST one.
- `refsInBody(body, refPattern)` and `ticketsInRange(…, { refPattern,
  foreignPatterns })`. The kit exports `IDENTIFIER_RE` (default, unchanged for
  linear/jira) and `GITHUB_REF_RE`, which refuses `owner/repo#N` by lookbehind.
  A non-global pattern is promoted to global, since `match` would otherwise
  return only the first ref. `historical` appears in the report **only** when
  `foreignPatterns` is given, so linear's and jira's report shape — and
  linear's existing tests — are untouched.
