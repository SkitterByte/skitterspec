---
github_identifier: "#58"
github_url: "https://github.com/SkitterByte/skitterspec/issues/58"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Bug: status calls an unmapped tracker state drift, and promises a resend that never comes

> **Type:** Bug
> **Name:** bug-status-state-drift (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-10-29)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-29
> **Area:** packages/sync-core/src/normalize.js, packages/sync-core/index.js, packages/azure-boards/src/cli-sync.js, packages/github/src/cli-sync.js, packages/linear/src/cli-sync.js

## Symptom

A person moves a ticket into a state skitterspec does not map (Azure
"Blocked", a "Next Sprint" column). `spec-sync status --remote` then prints:

```
  drift: Azure says "blocked", the repo says "in-progress" (repo wins on next push)
```

That is wrong twice:

1. **"blocked" is not one of our buckets**, so the ticket does not disagree
   with the spec. It is somewhere push does not manage.
2. **The next push does not resend State.** Push resends State only when the
   spec's own state changes (`issueChanges`, `sync-core/src/compare.js`). So the
   ticket stays where it was put until the spec next moves, and that holds for
   a *mapped* disagreement too.

The same lines are in the GitHub (`the board says …`) and Linear
(`Linear workflow-state is …`) providers.

## Root cause

Each provider's `status` maps the remote state through `remoteWorkflowState` →
`bucketForState` (`sync-core/src/normalize.js:779`). For an unknown name that
returns the lowercased raw name, so "Blocked" becomes `"blocked"`, which never
equals a bucket. Each provider then compares that with the spec's bucket and
prints the disagreement with a fixed "(repo wins on next push)"
(`azure-boards/src/cli-sync.js:720`, `github/src/cli-sync.js:561`,
`linear/src/cli-sync.js:475`). Nothing in the report could tell an unmapped
state from a mapped one. The resend promise was never checked against what push
actually does; the Linear assignee line already avoids it for the same reason.

## Failing test (red)

- `packages/azure-boards/test/cli-sync.test.js`:
  - "status reports a state skitterspec does not map as position, not drift";
  - "status reports drift only on a positive answer" (now also asserts the
    resend wording).
- `packages/github/test/cli-sync.test.js` → "status: state drift": both cases.
- `packages/linear/test/cli-status-stage.test.js`:
  - "a state on no rung and in no bucket is reported, not accused";
  - "a mapped state that disagrees is drift, without promising a resend";
  - "with no ladder declared, the same state is an unmapped one".

Run `pnpm test` (or `pnpm --filter <pkg> test`). Red before the fix:

```
AssertionError: The input did not match /state: Azure has it in "Blocked", a state skitterspec does not map — left alone/. Input:
  '  drift: Azure says "blocked", the repo says "in-progress" (repo wins on next push)\n'
```

## Fix

- [x] Add `remoteStateReading(issue, config)` to sync-core, returning
      `{ name, bucket, mapped }` (or null when there is no state). A declared
      ladder rung counts as mapped.
- [x] Azure, GitHub and Linear `status`:
      - an unmapped state prints
        `state: <tracker> has it in "<name>", a state skitterspec does not map — left alone`;
      - a mapped disagreement keeps its `drift:` line, with
        "(push resends State only when the spec moves)" in place of "repo wins
        on next push".
- [x] Failing tests now pass (GREEN). `pnpm test`: 4225 passed, 0 failed.
- [x] Hardening: none. The unmapped case is still *reported*, never silent, so
      the check is not made blind (the Linear stays-silent test's original
      point).

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync status --remote` state line (Azure, GitHub, Linear) |
| Service | add | sync-core `remoteStateReading` |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-29 | In Progress | in-progress | Reuben Greaves |
| 2026-10-29 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-29 — Bug reproduced; failing tests added (red).
- 2026-10-29 — Reverses the Linear test "a state on no rung is still reported
  as drift". It is still reported, but as position, since it maps to no bucket.
- 2026-10-29 — Fixed: unmapped states reported as position, and the resend
  promise replaced with what push does; tests green.
- 2026-10-29 — Follow-up surfaced: optional read-side state aliases
  (`states.<bucket>` as an array; the first name is what push writes, the rest
  read as that bucket). Not in scope for a bug fix.
- 2026-10-29 — Follow-up surfaced: the description-drift line also says "repo
  wins on next push". It likely has the same false premise (description resends
  only when the spec's text changes). Not verified here.
- 2026-10-29 — Completed; fix done, tests green. Both follow-ups above deferred.
