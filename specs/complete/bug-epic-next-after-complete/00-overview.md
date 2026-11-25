---
github_identifier: "#316"
github_url: "https://github.com/SkitterByte/skitterspec/issues/316"
---

# Bug: /spec-epic-next can't resolve the epic after a member completes

> **Type:** Bug
> **Name:** bug-epic-next-after-complete (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/316
> **Author:** Reuben Greaves
> **Raised:** 2026-11-25
> **Area:** packages/common/src/cli.js (`epicStatusCommand`, `epicFromHere`, `specEnvDown`), packages/common/src/env/epicread.js, packages/common/assets/skills/spec-complete/SKILL.md, packages/common/assets/skills/spec-cancel/SKILL.md, packages/common/assets/skills/spec-epic-next/SKILL.md
> **Docs:** reference

## Symptom

After `/spec-complete` finishes an epic member, the bare `/spec-epic-next` it
recommends can never resolve the epic.

Repro (skitterload, 2026-11-25):

1. Epic `epic-in-workout-screens` has 4 members. Member
   `feat-live-steps-start-pages` (header `> **Epic:** epic-in-workout-screens`)
   is built in its own worktree.
2. `/spec-complete` lands it by fast-forward. Then §7 teardown `cd`s the
   session to the primary checkout (on `main`) and removes the worktree.
3. The report's `Next` is a bare `/spec-epic-next`, as spec-complete §5
   prescribes.
4. `skitterspec epic status --json` returns `epic: null, inFlight: []`, so the
   skill stops with ⏸ "no epic resolved".
5. `skitterspec epic status epic-in-workout-screens --json` works: 3 of 4 done,
   `feat-two-step-finish` ready.

This happens every time a member completes and tears down in one run.

## Root cause

A bare `epic status` resolves the epic only from `epicFromHere`
(`packages/common/src/cli.js:1267`): the epic's own worktree, or the
`> **Epic:**` header of the member whose worktree cwd is in. /spec-complete
deletes that worktree and moves the session to the base branch, then hands off
to a command whose only input it has just removed. `epicsInFlight` doesn't help
either, because an epic with no worktree of its own is not in flight. The skill
text makes it worse: spec-complete §5 prescribes a bare `/spec-epic-next` when
the member's `Epic:` header was right there to name.

## Failing test (red)

`packages/common/test/cli-epic-last-completed.test.js`: *a member landed and
torn down leaves a bare epic status its epic.* It completes `feat-a`
(`Epic: epic-x`) on its branch, fast-forwards `main`, runs `spec-env down
feat-a` from the primary checkout and removes the worktree. A bare
`epic status --json` must then answer `epic-x` with `via:
"last-completed-member"`. Run it with
`node --test packages/common/test/cli-epic-last-completed.test.js`.

```
✖ a member landed and torn down leaves a bare epic status its epic
    actual: null,
    expected: 'epic-x',
```

The same file holds the stays-silent cases, which already pass: no open member
left, epic moved to complete, unlanded teardown, a named epic, and cwd in
another epic's worktree.

## Decisions

1. **Fix both the skill text and the engine.** The skill text names the epic in
   the normal path. The engine fallback covers a bare command typed anyway, and
   any other route to the primary checkout.
2. **The record is written in `spec-env down`, not by a new verb.** That is the
   one place every teardown passes through, so /spec-complete and autonomous
   runs get it without new skill steps. Rejected: an `epic remember` verb the
   skill calls, because it relies on the skill text remembering to call it.
3. **Only a landed member is recorded** (`merged` or `reachableFromTag`, or a
   landed branch in checkout mode). A forced teardown of unlanded work is not a
   completion.
4. **`.spec-env/last-completed-member.json`**, next to `last-live.json` and
   built the same way: `{ epic, spec }`. A later landed member overwrites it.
5. **The fallback is the last rung.** The positional epic wins, then the cwd
   (`epicFromHere`), then the record. The answer carries
   `via: "last-completed-member"`, and the text view says so.
6. **Offered only while the epic has open members**: some member is neither
   complete nor cancelled, and the epic itself is not in `complete/` or
   `cancelled/`. An overview that can't be read, or anything else that cannot
   tell, gives `epic: null` as today (`.claude/rules/negative-checks.md`).
7. **spec-cancel names the epic in `Next` but records nothing.** A cancel is not
   a land.
8. **Autonomous runs** end in /spec-complete, so they inherit its `Next`. No
   separate text change.

## Fix

- [x] `specEnvDown` (both modes): when the torn-down spec landed and its
      overview carries `> **Epic:**`, write `last-completed-member.json`.
      Comment the blind spot beside it: the record is machine-local, so a
      member completed on another machine leaves nothing here.
- [x] `epicStatusCommand`: when there is no positional epic and no
      `epicFromHere` answer, read the record and keep it only when the epic is
      open (Decision 6). Answer with `via: "last-completed-member"` in the JSON
      and a line in the text view.
- [x] spec-complete §5: read the member's `Epic:` header **before** teardown;
      `Next` is `/spec-epic-next <epic>`.
- [x] spec-cancel Report: a member's `Next` is `/spec-epic-next <epic>`.
- [x] spec-epic-next: say that bare also falls back to the last member
      completed on this machine.
- [x] Asset tests: spec-complete's and spec-cancel's text prescribe the named
      form. `docs/reference.html`: the `epic status` and `/spec-epic-next`
      rows. Stamp it with `node scripts/docs-freshness.js verify reference`.
- [x] The failing test now passes (GREEN). `pnpm build` and `pnpm test` show
      no regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `epic status` (bare): falls back to the record, `via: "last-completed-member"` |
| CLI command | update | `spec-env down`: records a landed member's epic |
| Config key | add | `.spec-env/last-completed-member.json` (machine-local state) |
| Skill/rule | update | spec-complete §5, spec-cancel Report, spec-epic-next: `Next` names the epic |

## Changelog

- 2026-11-25 — Bug reproduced (skitterload); failing test added (red). Raised
  through `/spec` and switched to `/spec-bug` on confirmation. Decisions 2, 3
  and 7 were confirmed in the grill.
- 2026-11-25 — Fixed: `spec-env down` records a landed member's epic, and
  bare `epic status` falls back to it while the epic is open. spec-complete,
  spec-cancel and spec-epic-next name the epic. Tests green (4603 pass).
- 2026-11-25 — Completed; fix done, tests green. index.html re-read
  (docs impact) and stamped; no change needed.
