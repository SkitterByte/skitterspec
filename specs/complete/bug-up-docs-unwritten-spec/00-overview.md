---
linear_identifier: "SKS-366"
linear_url: "https://linear.app/skitterbyte/issue/SKS-366/bug-spec-env-up-docs-cannot-provision-an-unwritten-spec"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: `spec-env up --docs` cannot provision an unwritten spec

> **Type:** Bug
> **Name:** bug-up-docs-unwritten-spec (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-18)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** packages/common/src/cli.js, packages/common/src/env/resolve.js, packages/common/src/env/provision.js
> **Stack:** worktree

## Symptom

`/spec`'s Phase B says: after grilling, run `skitterspec spec-env up <name>
--docs`, cd into the worktree, and write the spec there — "no chicken-and-egg
on the slug" (feat-main-is-a-landing-zone, phase 2). In practice, for a spec
that does not exist on disk yet:

```
$ skitterspec spec-env up feat-docs-site-restructure --docs
skitterspec-linear: spec not found under specs/**: feat-docs-site-restructure (searched: …)
```

The author-in-worktree flow is unreachable. The observed fallback — writing
the spec in the primary checkout so `up` can resolve it — makes the gate
commit the spec **straight onto main** before forking, so nothing uncommitted
remains, the C2 authoring page renders nothing, and the spec lands on main
unreviewed: exactly what feat-main-is-a-landing-zone exists to prevent.

## Root cause

`resolveSpec` (`packages/common/src/env/resolve.js:517`) resolves a name only
from a folder under `specs/**` or from the specless registry (`/no-spec`
records). An unwritten spec has neither, so `specEnvUp`
(`packages/common/src/cli.js:859`) throws before any plan is made — there is
no authoring lane. Compounding it, `planSpecCommit`
(`packages/common/src/env/provision.js:222`) treats "spec nowhere at all,
clean tree" as `blocked` ("the worktree would fork without the spec it is
for") — right for a spec that exists somewhere unlanded, wrong for one that
is deliberately not written yet. feat-main-is-a-landing-zone phase 2 asserted
"no chicken-and-egg on the slug" but pinned only the skill prose; no test
ever ran `up <unwritten> --docs` against the engine.

## Failing test (red)

`packages/common/test/cli-spec-env-up-authoring.test.js` — 6 tests: the
authoring plan (fork `-b feat/<slug>` into `…-wt/<slug>`, docs mode, no
commit, no block), the registry record + name resolution before the folder
exists, and four stays-silent guards (no `--docs` still refuses; a
non-spec-shaped name still refuses; an existing spec is untouched; a written
folder shadows the record with no double listing).

Run: `node --test packages/common/test/cli-spec-env-up-authoring.test.js`
Red: `✖ up --docs on an unwritten spec plans an authoring worktree instead of
refusing — Error: spec not found under specs/**: feat-new-thing` (3 fail /
3 stays-silent pass).

## Fix

- [x] `resolve.js`: tag the not-found error `code = 'SPEC_NOT_FOUND'` so the
      CLI can catch precisely it, never a different failure.
- [x] `resolve.js` `resolveSpecless`: an entry marked `spec: true` resolves
      with `splitPrefix` type/slug — branch `feat/<slug>`, worktree
      `…-wt/<slug>` — identical to what the written spec will resolve to.
      Plain `/no-spec` entries are byte-identical to before.
- [x] `resolve.js` `allSpecs`: skip a specless name whose folder was already
      collected — the written spec shadows its authoring record.
- [x] `cli.js` `specEnvUp`: on `SPEC_NOT_FOUND` + `--docs` + a
      `feat-`/`bug-`/`hotfix-` name (worktree mode only), enter the authoring
      lane: record `{branch, spec: true}` specless-style, resolve via the
      record, skip the fork-point read (`specOnFork` stays unknown — the gate
      must not accuse), plan the `-b` fork with no spec commit, print an
      `authoring:` line. Checkout mode rethrows — `/spec` writes in place
      there.
- [x] Failing tests now pass (GREEN); run `node --test` — no regressions.
- [x] None further.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env up <name> --docs` — authoring lane for unwritten specs |
| Engine | update | `resolveSpecless` (spec-shaped records), `allSpecs` (folder shadows record) |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-18 | In Progress | in-progress | Reuben Greaves |
| 2026-09-18 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-18 — Bug reproduced; failing tests added (red).
- 2026-09-18 — Fixed: authoring lane in `spec-env up --docs` (record → resolve
  → plan, fork-point gate stays unknown); 6 new tests green, full suite 3464
  pass 0 fail.
- 2026-09-18 — Completed; fix committed (6bede98), suite green (3464).
