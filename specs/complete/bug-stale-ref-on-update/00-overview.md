---
linear_identifier: "SKS-29"
linear_url: "https://linear.app/skitterspec/issue/SKS-29/bug-verify-reports-every-updated-sub-issue-as-a-stale-ref"
---

# Bug: verify reports every updated sub-issue as a stale ref

> **Type:** Bug
> **Name:** bug-stale-ref-on-update (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-09-02)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-02
> **Area:** packages/sync-core/src/compare.js, packages/linear/src/cli-sync.js

## Symptom

After a successful `spec-sync apply`, the read-back verify pass reports EVERY
updated sub-issue as an unmatched stale ref:

```
spec-sync apply: transport = api
  sub-issue updated: REU-151
  ... (8 of them)
  spec-sync verify: ERQ-150
    ?? sub-issue REU-151: read back, but the projection has no such phase — stale ref?
    ... (all 8)
       the repo is unchanged and still correct; re-push to overwrite the mirror
```

The writes themselves are correct — `spec-sync status` reads `up to date`
afterwards and the descriptions landed in Linear. The warning's own remedy
("re-push") reproduces it. Seen on `@skitterbyte/skitterspec-linear@10.2.0`,
still present in 10.3.0, consumer `~/code/ereqs`.

Reported via `handoff-skitterspec-stale-ref.md`, which had already disproved the
leading theory (the workspace's `REU` → `ERQ` team-key rename): the repo was
fully restamped and `ERQ-274`, pushed after the rename, still warned.

## Root cause

The plan's **create** items carry a `ref` (the phase-file handle, e.g.
`01-engine`); its **update** items carried only the Linear issue `id`
(`packages/sync-core/src/compare.js:88`). `applyOneSpec` then keyed the read-back
map with `sub.ref || sub.id`, so an update landed under an issue id
(`packages/linear/src/cli-sync.js:755`). `verifyLines` matches that map's keys
against the projection **by ref** (`cli-sync.js:522`), so an id-keyed entry could
never match — every updated sub-issue was flagged, on every push.

This is orthogonal to the team rename, which is why restamping the repo changed
nothing: creates verified clean and updates never did.

## Failing test (red)

`packages/linear/test/cli-apply.test.js` — "an updated sub-issue verifies clean —
it is not reported as a stale ref". Pushes once (create), edits a phase goal,
takes the real plan from `spec-sync push --json`, applies it, and asserts the
output carries no `stale ref`. Run with
`node --test packages/linear/test/cli-apply.test.js`.

Red output reproduced the field report verbatim:

```
  sub-issue updated: SKI-2
  spec-sync verify: SKI-1
    ?? sub-issue SKI-2: read back, but the projection has no such phase — stale ref?
```

Every pre-existing test in that file used a create plan — the update path had no
coverage at all, which is how this shipped.

## Fix

- [x] `compare.js` — update items carry `ref` alongside `id`, so the plan keeps
      the handle the read-back matches on.
- [x] `cli-sync.js` — key the update read-back by ref, resolving id → ref off the
      projection when a plan predates the above rather than falling back to the
      id (which is what produced the false positive).
- [x] Failing test now passes (GREEN); full suite green — 868/868, `pnpm test`.
- [x] Regression guard: "a genuinely stale ref is still reported on the update
      path" — an update whose ref names a phase that does not exist is still
      flagged, so the fix cannot be mistaken for deleting the check.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync apply` — read-back no longer false-flags updated sub-issues |
| Domain object | update | plan `subIssues.update[]` items gain `ref` |

No spec content, snapshot format, or Linear write behaviour changes — the plan
gains a field, and only the verify report differs.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-02 | In Progress | in-progress | Reuben Greaves |
| 2026-09-02 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-02 — Bug reproduced; failing test added (red).
- 2026-09-02 — Fixed: update plan items carry `ref`, read-back keyed by ref; test green.
- 2026-09-02 — Completed; all phases done, tests green (868/868).
