---
linear_issue_id: "SKS-110"
---

# Phase 1 — Resolve and cache "who am I in Linear" ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec spec-sync whoami` answers with the current user's Linear
`{ id, name }` — derived from the credential, cached in the user-level store, and
overridable — with `spec-sync users` available to search when it can't derive.

## Tasks

- [x] Add `packages/linear/src/identity.js`: `resolveIdentity(config, env, deps)`
      returning `{ ok, id, name, source }` where `source` is `store` · `viewer` ·
      `unknown`. Order: cached entry → derive → unknown. It never prompts and
      never throws — prompting is the skill's job, and "unknown" is a normal
      state, not a failure (same contract as `resolveApiKey`).
- [x] Extend `credentials.js` with `userForTeam(store, teamId)` and
      `writeUser(file, teamId, user, deps)`, preserving other teams' entries and
      the existing key, and reusing the 0600 / group-or-world guards verbatim.
      The store schema stays `version: 1` — `teams[<id>].user` is additive beside
      `teams[<id>].key`.
- [x] Add `viewer()` and `searchUsers(query, { limit, cursor })` to the API
      adapter in `api.js` (`query { viewer { id name } }`; users filtered by name
      or email). Keep them on the same typed operation contract `mcp.js` fulfils.
- [x] Declare the MCP counterparts in `mcp.js` so the skill path has named tools
      to reach for: `get_user { query: "me" }` and `list_users { query, limit }`.
- [x] Add `spec-sync whoami [--json] [--set <id> --name <n>] [--unset]` to
      `cli-sync.js` + the subcommand switch and its usage text. On the API path it
      resolves and prints; with no key it prints `transport = mcp` and exits 0, so
      the skill knows to call `get_user "me"` and cache the answer with `--set`.
- [x] Add `spec-sync users [<query>] [--json]` on the same terms: API path
      searches and returns matches (id, name, email, active); MCP path prints
      `transport = mcp` for the skill to run `list_users`.
- [x] Never log, print or return the API key from any of these paths — `whoami`
      reports a *person*, and the key it was derived from must not leak into
      output, `--json`, or an error.
- [x] Add tests: derive-from-viewer; cached entry short-circuits the network;
      `--set`/`--unset` round-trip preserving another team's entry and the key;
      user search paging; a 0644 store refused rather than read; MCP path prints
      `transport = mcp` and writes nothing. Run `npm test` — green before the
      phase is done.
- [x] **Stays-silent test** (`.claude/rules/negative-checks.md`): with no config,
      no key and no store, `whoami` reports "unknown" and **exits 0** — an
      unidentifiable user is not a broken install.

## Notes

`resolveApiKey` in `api.js` is the model to copy throughout: structured
`{ ok: false, reason }` over exceptions, "absent" treated as the normal default,
and nothing secret in the error. Identity is the same shape of question.
