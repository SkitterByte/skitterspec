---
github_identifier: "#353"
github_url: "https://github.com/SkitterByte/skitterspec/issues/353"
---

# Bug: a /no-spec name starting with `epic-` gets a 404 review page

> **Type:** Bug
> **Name:** bug-specless-epic-prefix-404 (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Raised:** 2026-11-27
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/353
> **Area:** packages/common/src/env/serve.js, packages/common/test/env-serve-specless-epic-prefix.test.js
> **Docs:** none: a served page that 404'd now loads; no page describes the routing

## Symptom

`/no-spec epic-parent-snapshots` rendered its review page and armed the gate,
but every tier of the stack answered `404 not found`. The page HTML was on
disk in `.spec-env/reviews/`, `resolveSpec` resolved the name from the
registry's specless record, and `viewFor` returned a worktree view.

## Root cause

The `render` hook in `serverHooks` (`packages/common/src/env/serve.js:1128`)
asks `isEpic(folder)` first. That is a name-prefix test
(`resolve.js:336`), so every `epic-*` address goes to `epicPage(folder)`
unless the epic is being authored. A specless branch has no epic overview, so
`epicPage` returns null and the route 404s before the specless spec's own
page is ever rendered.

## Failing test (red)

`packages/common/test/env-serve-specless-epic-prefix.test.js` →
"a specless branch named epic-* serves its own diff, not a missing epic page".
It records a specless `epic-parent-snapshots` branch the way `spec-env nospec`
does and GETs its page through the production `serverHooks` wiring. Run with
`node --test packages/common/test/env-serve-specless-epic-prefix.test.js`.

```
AssertionError [ERR_ASSERTION]: the /no-spec page must be reachable
  actual: 404,
  expected: 200,
```

## Fix

- [x] In the `render` hook, take the epic route only when the resolved spec
      is not specless. The registry's record is a positive signal and wins
      over the name prefix.
- [x] Failing test now passes (GREEN); run `pnpm build` and `pnpm test` —
      confirm no regressions.
- [x] Stays-silent test: an `epic-*` name the registry does not claim is
      still a 404.

## Impact

_No external surface changes — internal refactor only._

## Changelog

- 2026-11-27 — Bug reproduced; failing test added (red). Found while
  committing the epic-live-workbench snapshots under `/no-spec`.
- 2026-11-27 — Fixed: the render hook takes the epic route only for a name
  the registry does not record as specless; test green, 4716 passed.
- 2026-11-27 — Completed; fix green, suite green. Re-read reference and
  review pages for the impact check and stamped them.
