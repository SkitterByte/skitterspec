---
linear_issue_id: "SKS-419"
---

# Phase 2 — Azure adapter core (REST, dialect, states) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `packages/azure-boards` exists with a REST adapter passing the kit's
op-contract check, a dialect round-tripping the projection's markdown, and
config + credentials wired — proven by unit tests against recorded fixtures,
no live calls.

## Tasks

- [ ] Scaffold `packages/azure-boards` (private
      `@skitterbyte/skitterspec-provider-azure-boards`) on the Jira package's
      layout: `src/{api,config,credentials,dialect,commands}.js`.
- [ ] `config.js`: load/validate `azure-boards.config.json` (org URL, project,
      `workItemType`, `childType`, optional `areaPath`, `states`, `intake`,
      `auth`, `refs.foreignPatterns`, `releases`) via the kit's config-merge
      factory; ship the `.example` and reference doc source.
- [ ] `credentials.js`: PAT via `auth.tokenEnv` then the kit store namespaced
      `azure-boards`; basic-auth header assembly.
- [ ] `api.js`: REST adapter — JSON Patch create/update, hierarchy links,
      comments, WIQL query, state write relaying process-rule refusals as
      named refusals (phase 1's recorded error shape), on the kit's HTTP
      retry/backoff.
- [ ] `dialect.js`: markdown → the write format phase 1 chose (markdown or
      HTML), and read-back → canonical text for snapshot hashing and verify.
- [ ] State map: bucket → configured state name, validated against the type's
      actual states; unknown target is a named refusal listing what exists,
      plus a stays-silent test for a healthy custom process
      (`.claude/rules/negative-checks.md` rule 3).
- [ ] Run the kit's adapter op-contract check in this package's tests.
- [ ] Tests green: dialect round-trip fixtures, JSON Patch shapes, state
      refusal + stays-silent, credentials precedence. Full workspace suite
      (`pnpm test`).
