---
github_issue_id: "#137"
---

# Phase 1 — Record resolved state names; guard resends ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** After a push, a state-map change plans a state-only update for
exactly the items it affects. No resend moves an item out of a state the repo
does not manage, or out of a later one.

## Tasks

- [x] **sync-core `snapshotOf`**: record `stateNames` (the resolved Boards
      name per item, `null` for "send no state") when the provider supplies
      `config.remote.writtenStateName`. Nothing is recorded without the hook,
      so other providers are unaffected.
- [x] **sync-core `planChanges`**: when a recorded name differs from today's
      resolution and the item is otherwise unchanged, plan
      `{ ref, id, state, stateResend: 'remap' }` for a sub-issue and
      `{ state, stateResend: 'remap' }` for the issue. A missing record means
      cannot-tell and plans nothing. Under `pull`, a remap never re-asserts
      the parent's state.
- [x] **sync-core**: mark the unknown paths `stateResend: 'unknown'`: the
      issue with no split hashes, and a sub-issue with no snapshot entry.
- [x] **azure `settle`**: on any `stateResend`, read the item first. Leave it
      alone, with a `state kept:` line naming it and its state, when its state maps to
      no bucket for its type or to a later bucket than the target. Genuine
      transitions are unchanged.
- [x] **azure**: supply `writtenStateName` from the same per-type resolution
      `stateFor` uses (mint type by spec kind for the issue, `childType` for
      sub-issues).
- [x] Tests: `test/state-remap.test.js` green; a child at a later state is
      also left alone; sync-core unit tests for the record and the plan; run
      the full suite.

## Notes

- Names are recorded only for items whose state the apply actually sent
  (`recordPush({ sent })`); everything else keeps its old name or gets none.
  A hand-applied MCP push (`spec-sync record`) passes no `sent` and so records
  nothing new.
- Only Azure supplies the hook. The other providers are untouched until they
  opt in.
