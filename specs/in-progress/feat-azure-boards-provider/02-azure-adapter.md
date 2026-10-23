---
linear_issue_id: "SKS-419"
github_issue_id: "#11"
---

# Phase 2 — Azure adapter core (REST, dialect, states) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `packages/azure-boards` exists with a REST adapter passing the kit's
op-contract check, a dialect round-tripping the projection's markdown, and
config + credentials wired — proven by unit tests against recorded fixtures,
no live calls.

## Tasks

- [x] Scaffold `packages/azure-boards` (private
      `@skitterbyte/skitterspec-provider-azure-boards`) on the Jira package's
      layout: `src/{api,config,credentials,dialect,commands}.js`.
- [x] `config.js`: load/validate `azure-boards.config.json` (org URL, project,
      `workItemType`, `childType`, optional `areaPath`, `states`, `intake`,
      `auth`, `refs.foreignPatterns`, `releases`) via the kit's config-merge
      factory; ship the `.example` and reference doc source.
- [x] `credentials.js`: PAT via `auth.tokenEnv` then the kit store namespaced
      `azure-boards`; basic-auth header assembly.
- [x] `api.js`: REST adapter — JSON Patch create/update, hierarchy links,
      comments, WIQL query, state write relaying process-rule refusals as
      named refusals (phase 1's recorded error shape), on the kit's HTTP
      retry/backoff.
- [x] `dialect.js`: markdown → the write format phase 1 chose (markdown or
      HTML), and read-back → canonical text for snapshot hashing and verify.
- [x] State map: bucket → configured state name, validated against the type's
      actual states; unknown target is a named refusal listing what exists,
      plus a stays-silent test for a healthy custom process
      (`.claude/rules/negative-checks.md` rule 3).
- [x] Run the kit's adapter op-contract check in this package's tests.
- [x] Tests green: dialect round-trip fixtures, JSON Patch shapes, state
      refusal + stays-silent, credentials precedence. Full workspace suite
      (`pnpm test`).

## Notes

- `commands.js` moved to phase 3, beside the `cli-sync.js` it routes to — a
  routing table with nothing to route is a file that exists to be rewritten.
- Dialect leads with markdown per phase 1; `htmlToText` is the read-side
  reduction for HTML-era items (intake adoptions), never a write format.
  `flattenTables` is identity — markdown is stored verbatim, no renderer
  constraint to reshape for.
- The op contract has no `listTransitions`: Azure has no transition API, so
  `transitionTo` is a rule-aware direct write whose refusal lists the type's
  actual states (positive signal), fetched on demand.
- Azure answers a bad PAT with HTTP 203 (the sign-in page) — phrased as a
  credential rejection beside 401/403, so an expired token never surfaces as
  a JSON parse error.
