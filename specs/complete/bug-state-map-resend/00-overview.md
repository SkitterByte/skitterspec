---
github_identifier: "#136"
github_url: "https://github.com/SkitterByte/skitterspec/issues/136"
---

# Bug: a state-map change never reaches already-pushed Boards items

> **Type:** Bug
> **Name:** bug-state-map-resend
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/136
> **Author:** Reuben Greaves
> **Raised:** 2026-11-09
> **Area:** `packages/sync-core/src/compare.js`, `packages/sync-core/src/push.js`, `packages/azure-boards/src/cli-sync.js`
> **Docs:** azure-boards

## Symptom

Reported from ereqs (`chore/task-closed-on-complete`): adding
`statesByType.Task.complete = "Closed"` to `azure-boards.config.json` changes
nothing on any work item already pushed, and there is no safe command that
would apply it.

1. `spec-sync plan feat-dependency-upgrade-review --workspace-states s.json --json`
   prints `{"subIssues":{"create":[],"update":[]}, …}` while its three Tasks
   (AB#664–666) sit at Resolved. Resolved is in Azure's InProgress category,
   so the parent's roll-up counts them as unfinished.
2. The only way to force a resend is deleting the snapshot, which turns the
   plan into a full push, and that rewrites every state that differs. In
   ereqs, CI moves finished parents Resolved → On Test → On Demo → On Prod →
   Closed, so a full resend knocks every released parent back to Resolved.

Blast radius in ereqs: 46 completed specs, 141 child Tasks left at Resolved.

## Root cause

The last-pushed snapshot hashes the **local bucket** (`complete`), never the
Boards state it resolved to: `subIssueHash` and `specIssueFieldHashes` in
`packages/sync-core/src/compare.js:169` and `:68` hash `state`, which is the
bucket name. A map change from Resolved to Closed diffs `complete` against
`complete` and plans nothing. The resolution to a name happens only at apply
time (`stateFor` in `packages/azure-boards/src/cli-sync.js:223`), where it is
never recorded. Separately, `settle` (`cli-sync.js:231`) writes the state
whenever the item differs from it. Nothing tells it whether this send is the
spec moving or just a resend, so a full push treats On Prod as a state to
correct.

## Failing test (red)

`packages/azure-boards/test/state-remap.test.js`, run with
`node --test test/state-remap.test.js` from `packages/azure-boards`:

- *a state-map change is planned as a state-only update of the child, never
  the parent*: red, `{"subIssues":{"create":[],"update":[]},…}` (the empty
  plan from symptom 1).
- *a full resend leaves a parent the host moved past complete where it is, and
  names it*: red, the parent at On Prod is transitioned back to Done
  (symptom 2).
- Stays-silent: an old snapshot with no recorded names plans nothing, a
  parent behind its bucket still moves, and a genuine bucket move is still
  sent even when it goes backwards.

## Fix

Phased: the snapshot change and the guard come first, and they fix every
push from here on. Items pushed before the snapshot recorded names (ereqs's
141 Tasks) need a separate command, because there is no record of what was
sent to them.

| Phase | Status |
|-------|--------|
| [01 — Record resolved state names; guard resends](01-record-and-guard.md) | ✅ |
| [02 — `spec-sync restate` for items pushed before names were recorded](02-restate.md) | ✅ |

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Schema/model | add | `<id>.base.json` → `stateNames: { issue, subIssues: { <id>: name } }` |
| Business rule | update | plan: a recorded name ≠ the current resolution → a state-only update |
| Business rule | add | apply: a resend never moves an item out of an unmanaged or later state, and names it |
| Config key | add | `config.remote.writtenStateName(bucket, role, snapshotDir)` provider hook (sync-core) |
| CLI command | add | `skitterspec-azure-boards spec-sync restate` (phase 2) |

## Changelog

- 2026-11-09 — Bug reproduced from the ereqs handoff; failing tests added
  (red). Split into two phases, because nothing records what was sent to
  items pushed before this fix, so they need a live read (phase 2).
- 2026-11-09 — Fixed (phase 1): the snapshot records the state name each
  sent item resolved to; `plan` turns a changed name into a state-only update,
  and a resend leaves an item in an unmapped or later state where it is. Red
  tests green; 4546 tests pass.
- 2026-11-09 — Fixed (phase 2): `spec-sync restate` settles items that were
  already pushed against today's map through the same guard, as a dry run
  unless `--apply`, and records names into the existing snapshot.
  `docs/azure-boards.html` covers both. 4554 tests pass.
- 2026-11-09 — Completed; all phases done, tests green. Follow-ups, not in
  scope here: a hand-applied MCP push (`spec-sync record`) records no state
  names, and GitHub, Jira and Linear can adopt the same name lookup.
