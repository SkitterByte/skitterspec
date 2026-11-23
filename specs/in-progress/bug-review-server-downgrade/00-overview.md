---
github_identifier: "#288"
github_url: "https://github.com/SkitterByte/skitterspec/issues/288"
---

# Bug: an older engine downgrades the running review server

> **Type:** Bug
> **Name:** bug-review-server-downgrade
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/288
> **Author:** Reuben Greaves
> **Raised:** 2026-11-23
> **Area:** `packages/common/src/env/serve.js` (`staleServer`), `packages/common/src/cli.js` (`ensureReviewServer`, the review render, `review serve --status`)
> **Docs:** none: the docs pages never describe when the server is replaced

## Symptom

In ereqs on 2026-11-23, a review was rendered from a hotfix worktree forked
from `v37.23.2`. That worktree ran its own pinned engine, 2.5.0. The shared
review server was running 2.19.0, and the render replaced it with 2.5.0. From
then on every spec's page was drawn by the older engine.

## Root cause

`staleServer` (`packages/common/src/env/serve.js`) returned `stale` whenever
the recorded engine differed from this one (`recorded !== running`), in either
direction. `ensureReviewServer` (`packages/common/src/cli.js`) then replaced any
stale server, so an older engine replaced a newer one.

## Failing test (red)

`packages/common/test/env-serve-downgrade.test.js`. It asserts that
`staleServer('9.3.1', '9.2.0')` is `newer`. It also runs `ensureReviewServer`
against a live stand-in process whose settings record engine `999.0.0`, and
asserts that the server is adopted: nothing is started, the token is kept, and
the stand-in is still alive. Run it with
`node --test packages/common/test/env-serve-downgrade.test.js`.

```
actual: 'stale',
expected: 'newer',
```

## Fix

- [x] `staleServer` returns `newer` when the running server's engine orders
      after this one (`X.Y.Z[-pre]`, numeric). An older server is still
      `stale`, the same version still gets the mtime check, and versions that
      cannot be ordered are still `stale`, so this never adds a restart.
- [x] `ensureReviewServer` adopts a `newer` server and keeps its token. The
      render prints `the server runs engine X, newer than this one (Y) — kept
      it`, and `review serve --status` notes that it was kept.
- [x] Failing test passes. `env-serve-version.test.js` asserted the old
      either-direction rule and is updated. `pnpm build` and `pnpm test` are
      green.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env review`: keeps a newer running server and says so, instead of restarting it |
| CLI command | update | `spec-env review serve --status`: a `kept, not downgraded` line for a newer server |

## Changelog

- 2026-11-23 — Bug reproduced; failing test added (red).
- 2026-11-23 — Decided: an older engine adopts a newer server rather than
  refusing to serve, so the link on the phone keeps working.
- 2026-11-23 — Known limitation: engines released before this fix still
  downgrade, because the decision is made by the old code. The next render
  from a current tree replaces the old server upward and keeps the token.
- 2026-11-23 — Fixed: a newer running server is adopted, never downgraded;
  test green.
