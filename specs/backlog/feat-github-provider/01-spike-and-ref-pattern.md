---
linear_issue_id: "SKS-409"
---

# Phase 1 — Spike GitHub APIs + kit neutrality (ref pattern) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the API assumptions behind Decisions 2–5 are confirmed against a real
throwaway repo + board, and the kit no longer hardcodes a `KEY-N` ref shape —
proven by a refactor-only `skitterspec-linear`/`-jira` suite staying green.

## Tasks

- [ ] Spike on a throwaway public repo + user-owned board, recording results in
      this file's notes: sub-issue create/list (REST), `addProjectV2ItemById`,
      reading the Status field's options and setting one, a second `Deployed`
      single-select, close with `state_reason`, the Release create/update API.
- [ ] Confirm the token answer: classic PAT `repo`+`project` works on a
      user-owned board; record whether a fine-grained PAT does (Decision 5
      changes if it does).
- [ ] Confirm the board's built-in workflows (close → Done) do not fight the
      engine's own Status writes; record which to leave off in SETUP.
- [ ] Check GitHub's official MCP server tool names for issues, sub-issues and
      projects; record which ops it cannot do (feeds phase 3's degradation).
- [ ] `provider-kit/src/released.js`: replace the hardcoded `IDENTIFIER_RE`
      with a provider-supplied pattern (default the current `KEY-N` regex, so
      linear/jira pass nothing new); a comment names what would fool it.
- [ ] `released` treats refs matching a configured `foreignPatterns` list
      (here `SKS-N`) as known history, not unreferenced.
- [ ] Tests: `#N` scanning, foreign-pattern classification, and a stays-silent
      test — a commit body mentioning `#5` outside a `Refs:` trailer is not a
      ref. Full workspace suite green (`pnpm test`).

## Notes

Throwaway repo/board names go here once created. Nothing in this phase talks
to GitHub from tests — the spike is manual, the code change is offline.
