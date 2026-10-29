---
github_identifier: "#74"
github_url: "https://github.com/SkitterByte/skitterspec/issues/74"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Bug: Linear API drops the errors body on a non-2xx response

> **Type:** Bug
> **Name:** bug-linear-http-error-body (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixed (green)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-29
> **Area:** packages/linear/src/api.js
> **Stack:** worktree

## Symptom

Linear answers a malformed GraphQL query with **HTTP 400** and an `errors`
payload naming the field at fault. The client reports only:

```
Linear API returned HTTP 400
```

That can't be diagnosed from a CI log. Found during the phase 1 spike of
`feat-tracker-releases` (now cancelled), where a typo in a query surfaced as a
bare 400. The fix was written on that branch, which never landed.

## Root cause

`makeClient` in `packages/linear/src/api.js` throws on `!res.ok` before reading
the body. Only a 2xx response reaches the `body.errors` →
`refusalFrom` path, so a non-2xx response loses the message and the
`extensions` (code, `userError`, `userPresentableMessage`) that the 2xx path
already carries.

## Failing test (red)

`packages/linear/test/api-refusal.test.js` — *an HTTP 400 with an errors body
names what Linear said, and keeps the status*. Run:
`cd packages/linear && node --test test/api-refusal.test.js`.

```
✖ an HTTP 400 with an errors body names what Linear said, and keeps the status
  actual: 'Linear API returned HTTP 400'
  expected: /^Linear API returned HTTP 400: /
```

Beside it, *STAYS PLAIN* covers a non-2xx with an unreadable or empty body,
which keeps the bare status line. It passes before and after the fix.

## Fix

- [x] On `!res.ok`, read the body. If it holds GraphQL `errors`, throw
      `refusalFrom(errors)` with the message prefixed `Linear API returned
      HTTP <status>: `. If the body is unreadable or empty, keep the bare line
- [x] Failing test passes (GREEN); full suite — no regressions
- [x] None

## Impact

_No external surface changes — internal refactor only._

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-29 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-29 — Bug reproduced; failing test added (red). Ported from the
  cancelled `feat-tracker-releases` branch (`origin/feat/tracker-releases`).
- 2026-10-29 — Fixed: a non-2xx with a GraphQL `errors` body throws the refusal,
  prefixed with the HTTP status; tests green (4270 passed).
