---
linear_issue_id: "SKS-297"
---

# Phase 1 — Say what Linear refused, and whether waiting helps ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a refused write reports Linear's own explanation and says whether
retrying could ever work — so the reader acts on the cause instead of
diagnosing it.

## Tasks

- [x] Stop flattening in `packages/linear/src/api.js`. Where the response body
      carries `errors`, raise an error that keeps the first entry's `message`,
      `extensions.code`, `extensions.userPresentableMessage`,
      `extensions.userError` and `extensions.meta` as fields — not only a joined
      string.
- [x] **Keep the joined message as the error's `message`.** Every existing
      caller prints `error.message`, and this phase must not need them all
      changed to keep working; the fields are added beside it.
- [x] **Do not retry a `userError`.** The retry loop exists for throttling, and
      a usage cap retried three times is three identical refusals and a slower
      failure. Name the reasoning beside the branch.
- [x] Report it where `apply` and `push` print a failure: the presentable
      message when there is one, the code and `meta.usageMetric` beside it, and
      a line saying whether waiting can help — **not a rate limit, so waiting
      will not help** for a `userError`, and the opposite for a 429.
- [x] **Say what was written**, since that is what decides the next move: a
      refusal before the first create wrote nothing, and one part-way through
      has stamped what landed. The existing `ids stamped so far are saved` line
      is only true in the second case, and it is currently printed in both.
- [x] Tests: a `USAGE_LIMIT_EXCEEDED` body produces an error carrying the code,
      the presentable message and `userError: true`; the client does **not**
      retry it; the reported line names the fix and says waiting will not help.
- [x] Test the 429 path still retries and still honours `Retry-After` — the
      throttle behaviour is correct today and this phase must not disturb it.
- [x] Stays-silent test (`.claude/rules/negative-checks.md` rule 3): an error
      with **no** `extensions` — every error the MCP path and older Linear
      responses produce — reports exactly as it does today. An absent field is
      not evidence of anything, and must not read as "retryable" or as
      "unretryable".
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The payload this is built against, captured from the real failure:

```json
{ "message": "usage limit exceeded",
  "path": ["issueCreate"],
  "extensions": {
    "code": "USAGE_LIMIT_EXCEEDED", "statusCode": 400, "userError": true,
    "userPresentableMessage": "You've exceeded the free issue limit for this
      workspace. Please upgrade or contact sales@linear.app for a free trial.",
    "meta": { "usageMetric": "activeIssueCount" } } }
```

Note the HTTP status was **200** — the GraphQL error is in the body. Anything
keying off `res.status` will not see this at all.

**`retryable` is three-valued, and the third value is the whole guard.** `false`
on a positive signal (`userError`, or a code in a short known-unretryable list),
`true` from the throttle path, and **`null`** for everything that said nothing —
every MCP-path error and every older Linear response. A looser version would
have read "no verdict" as retryable and reintroduced the collapse this phase
exists to remove.

**`applyOneSpec` became a thin wrapper**, which was not in the plan. The caller
must say whether re-running is a resume or a fresh start, and that answer lives
in the inner function's `result` — which a thrown error does not carry. The
wrapper hands `result` out through a `progress` object and stamps the count onto
the error, so the count is **what was actually stamped** rather than inferred
from which call failed; the second reading goes wrong the moment the order
changes.

**Phase 2 is already half done.** `cli-apply.test.js` has
*"an interrupted run stamps what it created, then resumes without duplicating"*
— failing on the second write, asserting the issue is stamped and the re-run
creates only the missing sub-issue. So phase 2's first task is covered; what
remains is the other boundaries and the create-succeeded-stamp-failed hole.
