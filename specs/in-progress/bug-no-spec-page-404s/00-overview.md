---
linear_identifier: "SKS-344"
linear_url: "https://linear.app/skitterbyte/issue/SKS-344/bug-the-review-server-404s-every-no-spec-page"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

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

## Root cause

Both resolvers already handle specless branches and the server passed neither
map. `resolveSpec` takes `opts.specless` and falls back to `resolveSpecless`
when a name is in it (`resolve.js:530`); `allSpecs` takes a specless map and
appends those branches, because `collectSpecFolders` scans `specs/**` where they
are by definition not (`resolve.js:625`). `cli.js:410` gets this right —
`allSpecs(dir, config, worktreePaths, speclessMap(dir, config))`. `serve.js`
called `resolveSpec(folder, dir, config, { searchDirs })` and
`servableSpecs(dir, config, git)` and never read the registry at all.

**And the wiring was copied, which is why it survived.** The daemon's entry
point built `resolveOne`/`resolveEntries` inline, and `env-review-serve.test.js`
built its own identical copy to stand a server up — so the suite was testing a
second server that happened to share the defect, and could never have caught it.
A fix to one would have left the other broken.

## Failing test (red)

`packages/common/test/env-serve-specless.test.js` — a repo with one ordinary
spec and one specless branch, both provisioned, served through the production
wiring. Red on `GET /tidy-up`:

```
✖ a specless branch serves its page
  AssertionError: a /no-spec page must be reachable
  + actual - expected
  + 404
  - 200
```

Run with `node --test packages/common/test/env-serve-specless.test.js`.

## Fix

- [x] Add `serverHooks(dir, config)` to `serve.js`, exported, building every
      hook `createReviewServer` needs — and pass the registry's specless map to
      both `resolveSpec` and `servableSpecs`.
- [x] Give `servableSpecs` a `specless = {}` parameter and pass it to
      `allSpecs`. Defaulted, so every caller with no concept of them is unchanged.
- [x] Read the registry **per request**, not once at startup: a branch
      provisioned after the daemon started must be servable without a restart,
      which is the same reason the settings file stores only `dir`.
- [x] Replace the entry point's inline wiring with `serverHooks`, and the test
      helper in `env-review-serve.test.js` with it too, so there is one copy
      rather than three.
- [x] Failing test now passes (GREEN); full suite green — 3352 passed.
- [x] Guard the copy: one test asserts the entry point uses `serverHooks` and
      builds no resolver of its own; another scans the suite for a test that
      resolves real specs with wiring of its own. A fourth copy fails rather
      than drifts.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI engine | add | `serve.js` exports `serverHooks(dir, config)` |
| CLI engine | update | `servableSpecs(dir, config, git, specless = {})` |
| Behaviour | update | the review server resolves and lists `/no-spec` branches |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-18 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-18 — Bug reproduced live on `chore/docs-catch-up` (404 on a page that
  existed on disk); failing test added (red).
- 2026-09-18 — Fixed: the server passes the registry's specless map to both
  resolvers, via one shared `serverHooks`; test green.
- 2026-09-18 — Found on the way: the daemon's wiring was duplicated in the test
  helper, so the suite could not have caught this. Folded into one exported
  function and guarded with a test, rather than fixing the two copies.
- 2026-09-18 — The copy was worse than reported: four places built the wiring,
  not two. `env-review-serve.test.js` was the third and is now folded in; the
  guard's first version also accused `env-serve-pass-state` and
  `env-serve-post`, which are correct — they inject stub callbacks to drive the
  request handling with no repo behind them, which is the absence of wiring
  rather than a copy of it. Narrowed to a positive signal: reaching for a
  resolver.
