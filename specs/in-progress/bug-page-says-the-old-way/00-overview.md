---
linear_identifier: "SKS-240"
linear_url: "https://linear.app/skitterbyte/issue/SKS-240/bug-the-page-still-describes-the-workflow-spec-reviewed-replaced"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: the page still describes the workflow /spec-reviewed replaced

> **Type:** Bug
> **Name:** bug-page-says-the-old-way (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** packages/common/assets/review/page.html, packages/common/test/assets-review.test.js

## Symptom

After sending a verdict, the page says:

    Sent — tell Claude it is waiting. It should say code 608223

There is a command for this now. `/spec-reviewed` shipped hours earlier and is
the thing to type; the page instead describes the interim arrangement it
replaced — narrate that a pass exists, and hope the agent looks. Spotted by the
operator on a real send: *"the message is still talking about codes etc instead
of pointing the user to the spec-reviewed."*

## Root cause

`packages/common/assets/review/page.html`, in `post()`'s success branch. The
line was written by `feat-claim-by-confirmation` phase 2, which **corrected** an
earlier version (`Sent · claim it with 418207`) for instructing a transcription
nobody needed. That correction was right and landed before `/spec-reviewed`
existed, so the best it could say was "tell Claude". Nothing went back to it when
the command shipped.

The class is the one `bug-next-skips-the-commit` was about: **shipped prose that
contradicts a shipped command**. Neither half is wrong on its own, and nothing
connects them — so the page goes on describing a world that moved.

## Failing test (red)

`packages/common/test/assets-review.test.js` — *"the sent message names
/spec-reviewed"*. It drives the real page, presses a verdict on a served render,
and asserts the hint names the command, still shows the code, and no longer
carries the old phrasing.

Run: `pnpm exec node --test packages/common/test/assets-review.test.js`

```
✖ the sent message names /spec-reviewed
  AssertionError: it names the command to type
```

## Fix

- [x] Say `Sent — run /spec-reviewed to pick it up. It should say code <code>`,
      and name the command in the no-code case too.
- [x] Keep the code, as the thing to **check** rather than the instruction — it
      is the one part of a waiting pass that tells yours from anyone else's.
- [x] Leave a note at the line naming **both** phrasings it has now outgrown, so
      the next edit can see what it is not allowed to go back to.
- [x] Failing test now passes (GREEN); `pnpm test` green at the root and in
      `packages/common` — no regressions.
- [x] None.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Page | update | the hint shown after a pass is sent |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-14 — Fixed: the hint names `/spec-reviewed`; test green (2287).
- 2026-09-14 — The guard asserts the **old phrasing is absent**, not only that
  the new one is present. This line has now been wrong twice in one day, each
  time by describing whatever was true when it was written — so the test pins
  what it must no longer say as well as what it must.
- 2026-09-14 — Bug reproduced; failing test added (red).
