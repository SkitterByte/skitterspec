---
linear_issue_id: "SKS-297"
---

# Phase 1 — Say what Linear refused, and whether waiting helps ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a refused write reports Linear's own explanation and says whether
retrying could ever work — so the reader acts on the cause instead of
diagnosing it.

## Tasks

- [ ] Stop flattening in `packages/linear/src/api.js`. Where the response body
      carries `errors`, raise an error that keeps the first entry's `message`,
      `extensions.code`, `extensions.userPresentableMessage`,
      `extensions.userError` and `extensions.meta` as fields — not only a joined
      string.
- [ ] **Keep the joined message as the error's `message`.** Every existing
      caller prints `error.message`, and this phase must not need them all
      changed to keep working; the fields are added beside it.
- [ ] **Do not retry a `userError`.** The retry loop exists for throttling, and
      a usage cap retried three times is three identical refusals and a slower
      failure. Name the reasoning beside the branch.
- [ ] Report it where `apply` and `push` print a failure: the presentable
      message when there is one, the code and `meta.usageMetric` beside it, and
      a line saying whether waiting can help — **not a rate limit, so waiting
      will not help** for a `userError`, and the opposite for a 429.
- [ ] **Say what was written**, since that is what decides the next move: a
      refusal before the first create wrote nothing, and one part-way through
      has stamped what landed. The existing `ids stamped so far are saved` line
      is only true in the second case, and it is currently printed in both.
- [ ] Tests: a `USAGE_LIMIT_EXCEEDED` body produces an error carrying the code,
      the presentable message and `userError: true`; the client does **not**
      retry it; the reported line names the fix and says waiting will not help.
- [ ] Test the 429 path still retries and still honours `Retry-After` — the
      throttle behaviour is correct today and this phase must not disturb it.
- [ ] Stays-silent test (`.claude/rules/negative-checks.md` rule 3): an error
      with **no** `extensions` — every error the MCP path and older Linear
      responses produce — reports exactly as it does today. An absent field is
      not evidence of anything, and must not read as "retryable" or as
      "unretryable".
- [ ] Run the project's typecheck and test commands — green before the phase is
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
