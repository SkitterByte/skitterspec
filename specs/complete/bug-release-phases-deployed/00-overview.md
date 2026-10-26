---
github_identifier: "#33"
github_url: "https://github.com/SkitterByte/skitterspec/issues/33"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Bug: a release leaves a spec's phases "No Deployed"

> **Type:** Bug
> **Name:** bug-release-phases-deployed (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-10-26)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-26
> **Area:** `packages/github/src/api.js` (`releaseStage`)

## Symptom

On board 2's Deploy Tracking view, after `skitterspec-github@1.0.0` was
published, spec issue #1 sat under **Published** while its seven phase
sub-issues (#2–#8, all closed) stayed under **No Deployed**. They were set by
hand. Every future release would do the same.

## Root cause

`releaseStage` (`packages/github/src/api.js`) sets the Deployed field on
exactly the tickets the release's range references. Commits carry
`Refs: #N` naming the **spec** issue — `spec-sync ref` never answers a phase —
so a phase sub-issue is never in that list, and nothing reached it through its
parent.

Decided: closed phases follow their spec. An open phase is left alone,
because a spec landed mid-way with `/spec-to-main` ships some phases and not
others, and marking an unbuilt phase Staged/Published would be a false claim
on the board.

## Failing test (red)

`packages/github/test/api.test.js` —
`releaseStage carries the Deployed option onto the closed phases of each issue`
and `STAYS SILENT: an open phase is not marked shipped with its spec`, beside
`STAYS SILENT: an issue with no phases stages exactly itself`.
Run: `node --test packages/github/test/api.test.js`. Red before the fix:

```
✖ releaseStage carries the Deployed option onto the closed phases of each issue
  + actual - expected
    [ '#1=Test', - '#2=Test', - '#3=Test' ]
```

## Fix

- [x] `releaseStage` lists each ticket's sub-issues and stages the closed ones
      with the same option, once each (a ref reached twice is set once).
- [x] Failing test now passes (GREEN); full suite green (4014).
- [x] None further — `releaseAttach` stays spec-only on purpose: one "Shipped
      in" comment per spec, not one per phase.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync release deployed <tag> <stage>` also sets closed phase sub-issues |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-26 | In Progress | in-progress | Reuben Greaves |
| 2026-10-26 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-26 — Bug reproduced; failing test added (red).
- 2026-10-26 — Fixed: closed phase sub-issues now take the release's Deployed
  option with their spec; test green.
- 2026-10-26 — Completed; all phases done, tests green.
