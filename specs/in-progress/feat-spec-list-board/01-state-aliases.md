---
github_issue_id: "#60"
---

# Phase 1 — Read-side state aliases ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `states.<bucket>` accepts an array in all four providers. Push writes
the first name and every name reads as its bucket. Proven by config, sync-core
and status tests.

## Tasks

- [ ] sync-core: add `stateNamesFor(bucket, config)` (all names) and
      `primaryState(bucket, config)` (the first). Make `bucketForState` match
      any alias. Keep `release.stages` matching as before.
- [ ] Route every write of a mapped state through `primaryState` (push / apply,
      `stateIdFor`, GitHub `closeReasonFor`, and the ~30 `config.states[...]`
      readers). Grep for `states[` / `.states.` and convert each.
- [ ] Config parsing in azure-boards, github, linear and jira:
      - accept a string or a non-empty array of non-empty strings, otherwise a
        hard error at load;
      - a name in two buckets is a hard error.
- [ ] `states` check (`spec-sync states`, doctor): validate every alias
      against the workspace, not only the first.
- [ ] `/spec-status`: an aliased state reads as its bucket, so no drift and no
      "does not map" line.
- [ ] `spec-sync list` live default: hide every `complete` / `cancelled` alias.
- [ ] Docs: each provider's `*.config.md` → "Choosing your state map": the
      array form, first-is-written, read-only aliases, no pull.
- [ ] Tests:
      - string form unchanged (stays-silent);
      - push writes the first alias;
      - an alias reads as its bucket in status;
      - the live list hides a `complete` alias;
      - malformed arrays and a duplicate name are refused at load.
- [ ] Run `pnpm test`. Green before the phase is done.
