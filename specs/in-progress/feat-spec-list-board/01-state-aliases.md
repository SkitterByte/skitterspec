---
github_issue_id: "#60"
---

# Phase 1 — Read-side state aliases ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `states.<bucket>` accepts an array in all four providers. Push writes
the first name and every name reads as its bucket. Proven by config, sync-core
and status tests.

## Tasks

- [x] sync-core: add `stateNamesFor(bucket, config)` (the written name, then
      its aliases). Make `bucketForState` match any alias. `release.stages`
      matching is unchanged.
- [x] ~~Route every write through `primaryState`~~. Instead, the first name is
      stored in `states[bucket]` at load and the rest in
      `stateAliases[bucket]`, so no writer changed (see the Changelog).
- [x] Config parsing in azure-boards, github, linear and jira, through the
      shared `mergeStates` in provider-kit:
      - accept a string or a non-empty array of non-empty strings, otherwise a
        hard error at load;
      - an alias that names another bucket is a hard error.
- [x] `states` view (Azure, GitHub, Linear) lists each alias under its bucket.
      A missing alias is named there but kept out of push-time validation,
      because it is never written.
- [x] `/spec-status`: an aliased state reads as its bucket, so no drift and no
      "does not map" line.
- [x] `spec-sync list`:
      - the live default hides every `complete` / `cancelled` alias (Azure,
        GitHub);
      - Linear's live, `--in-progress` and `--next` scopes take every name of
        the bucket.
- [x] Docs: each provider's `*.config.md`, a new "More than one name per
      bucket" section.
- [x] Tests:
      - `provider-kit/test/config-states.test.js`: string unchanged, array
        split, malformed refused, cross-bucket alias refused, shared written
        name still legal;
      - `sync-core/test/sync-state-aliases.test.js`;
      - Azure: load, status, live list, states view;
      - GitHub: live list.
- [x] `pnpm test`: 4239 passed, 0 failed.
