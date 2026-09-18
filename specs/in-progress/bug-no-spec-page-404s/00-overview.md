# Bug: the review server 404s every `/no-spec` page

> **Type:** Bug
> **Name:** bug-no-spec-page-404s (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** packages/common/src/env/serve.js, packages/common/src/env/registry.js, packages/common/src/cli.js

## Symptom

`/no-spec` provisions a branch, renders a page, arms the gate and hands back a
served URL — and that URL 404s. Every time, for every specless branch.

Reproduced live on `chore/docs-catch-up`:

```
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7760/<token>/docs-catch-up
404
$ curl -s http://127.0.0.1:7760/<token>/docs-catch-up
not found
```

The page itself is fine — `.spec-env/reviews/docs-catch-up.html`, 179KB, written
by the render. The server index (`/<token>/`) returns 200 and does not list the
branch at all. So the work is reviewable on disk and unreachable over http,
which on a phone means unreachable.

**The reporting is the sharp part.** `/no-spec` ends by emitting the banner that
says *"I'm holding here until you send a verdict"* over a link that cannot
answer. The skill arms a gate on the strength of a review the operator was
never able to open.
