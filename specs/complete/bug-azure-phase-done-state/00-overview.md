---
github_identifier: "#336"
github_url: "https://github.com/SkitterByte/skitterspec/issues/336"
---

# Bug: a hand-applied push writes a phase the parent's state

> **Type:** Bug
> **Name:** bug-azure-phase-done-state (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/336
> **Author:** Reuben Greaves
> **Raised:** 2026-11-26
> **Area:** packages/sync-core/src/push.js, packages/{azure-boards,github,jira,linear}/assets/skills/spec-push/SKILL.md
> **Docs:** azure-boards, github, jira, linear

## Symptom

Reported from ereqs (Azure Boards, 3.2.8): *"a phase Task pushed as done gets
the parent type's done state, not statesByType[childType]."* Config:
`states.complete: "Resolved"`, `statesByType.Task.complete: "Closed"`,
`workItemType: "User Story"`, `childType: "Task"`. Phase 2 of
feat-logging-heartbeat (AB#667) flipped to ✅ while the spec was in
`in-progress/`; afterwards AB#669 sat in **Resolved** and
`stateNames.subIssues["AB#669"]` read `"Resolved"`, until
`spec-sync restate` moved it to Closed.

## Root cause

The engine's own apply resolves per type correctly — reproduced against `main`,
the installed 3.2.8, 3.2.6, ereqs' exact config and its real spec files: all
write **Closed**. The defect is on the **no-token path**: every provider's
`/spec-push` skill told the agent to map a planned bucket to a state name
"via `config.states`" (`packages/azure-boards/assets/skills/spec-push/SKILL.md:101`,
and the same line in github, jira and linear), and the plan carried only the
bucket. `config.states` is the parent's map, so a done Task was written
`Resolved` — `statesByType` (Azure, Jira) and `statesByKind` (GitHub, Linear)
were invisible to a hand apply. The engine already resolved the right name per
item (`writtenStateName`, recorded in snapshots) but never put it on the plan.

The snapshot half of the report (`"Resolved"` recorded) is not explained by
this path — `record` keeps the previous name — and was not reproduced; see the
Changelog.

## Failing test (red)

`packages/azure-boards/test/phase-done-state.test.js` — *the plan names the
state each item is written, per type*: plans the ereqs config and asserts
`plan.issue.stateName` is `Active`, each created phase's `stateName`
(`Closed` / `Active` / `New`), and that phase 2 flipped to ✅ plans
`stateName: "Closed"`. Red before the fix:

```
✖ the plan names the state each item is written, per type
    actual: undefined,
    expected: 'Active',
```

Run: `node --test packages/azure-boards/test/phase-done-state.test.js`.

## Fix

- [x] `push()` attaches each planned item's resolved `stateName` (the
      provider's `writtenStateName` answer) beside its bucket; `null` = this
      bucket sends no state; no hook answer adds nothing
      (`attachPlannedStateNames`, `packages/sync-core/src/push.js`)
- [x] Every provider's `/spec-push` skill writes `stateName` instead of a
      `config.states` lookup, with `config.states` only as the fallback for a
      plan from an older engine
- [x] Pin the engine's apply: done-phase-while-in-progress writes Closed and
      records Closed, restate then moves nothing, and a config with no
      `statesByType` still takes `states.complete`; a null-mapped bucket plans
      `stateName: null`
- [x] Failing test now passes (GREEN); `pnpm build && pnpm test` green

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync plan --json` items gain `stateName` |
| Skill/rule | update | `/spec-push` (Azure, GitHub, Jira, Linear) no-token state mapping |

## Changelog

- 2026-11-26 — Bug reproduced as a plan defect; failing test added (red).
  The engine apply could not be made to write Resolved on any version tried,
  so the reported snapshot value stays unexplained; ereqs' AB#669 was repaired
  with `spec-sync restate --apply`.
- 2026-11-26 — Fixed: the plan carries the resolved state name per item and
  every no-token push skill writes it; test green.
- 2026-11-26 — Completed; fix green, suite green.
