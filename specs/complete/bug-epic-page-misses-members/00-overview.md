---
github_identifier: "#304"
github_url: "https://github.com/SkitterByte/skitterspec/issues/304"
---

# Bug: a new epic's page is an empty dashboard, not its authoring page

> **Type:** Bug
> **Name:** bug-epic-page-misses-members (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/304
> **Area:** packages/common (src/env/classify.js, src/env/serve.js, src/env/epicpage.js, src/env/epic.js, src/cli.js)
> **Docs:** review

## Symptom

Seen in skitterload on skitterspec-github 2.18.0, and still the case on 3.2.0.
`/spec` wrote `epic-in-workout-screens` and its four members in the epic's
`--docs` worktree (all uncommitted, each member carrying
`> **Epic:** epic-in-workout-screens`). The first review page was the epic
**dashboard** instead of the authoring page:

> 0 of 0 done · 0 in flight · 1 lanes, 1 free
>
> No member yet — no spec carries `> **Epic:** epic-in-workout-screens`.

No documents and no verdict buttons, so `Commit & Start` could not be pressed.

## Root cause

`docsWorktree` (`packages/common/src/env/serve.js:261`) grants the authoring
view only when every dirty path belongs to the spec, and `classifyDirtyTree`
(`src/env/classify.js:83`) owns exactly the spec's folder plus
`companionPaths`. An epic is written **with** its members in one tree
(`/spec`, "Writing an epic"), so each member folder was foreign, the view fell
to `worktree`, and `render()` (`serve.js:1124`) served the epic dashboard. That
dashboard reads members off the base branch, worktrees' own folders and spec
branches, so members that exist only inside the epic's uncommitted tree are
invisible to it, which is why it said "No member yet". The same split feeds
`spec-env stage` and `review --docs`, so the members were also outside what a
committing verdict would stage. Separately, the lane count is never
singularised (`epicpage.js:65`, `epic.js:422`).

## Failing test (red)

- `packages/common/test/env-classify-epic-members.test.js`: an epic owns the
  member folders whose overview names it, and only those.
- `packages/common/test/env-serve-epic.test.js`: "an epic written WITH its
  members keeps its authoring page, members shown"; "one lane reads 1 lane".

Run `node --test packages/common/test/env-classify-epic-members.test.js
packages/common/test/env-serve-epic.test.js`. Red:

```
✖ an epic owns the members written beside it in the same tree
✖ an epic written WITH its members keeps its authoring page, members shown
  AssertionError [ERR_ASSERTION]: not the epic dashboard
✖ one lane reads "1 lane", not "1 lanes"
ℹ pass 12  ℹ fail 5
```

## Fix

- [x] `classifyDirtyTree` takes an optional `readFile`; for an epic, a path in
      a spec folder whose overview in that tree names the epic is owned.
      Unreadable or another epic's: foreign.
- [x] Pass the tree's reader from `docsWorktree`, `specDocsIn` and
      `spec-env stage`, so page, `--docs` render and staging agree.
- [x] Singularise the lane count on the page and in `epic status`.
- [x] Update `docs/review.html` (epic authoring sentence) and
      `docs/reference.html` (`spec-env stage`); stamp them with `index`.
- [x] Failing tests pass (GREEN); `pnpm build` and `pnpm test` green.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Route/UI | update | `/<epic>` keeps the authoring page while its members are written beside it |
| CLI command | update | `spec-env stage <epic>` and `review --docs` own the epic's co-authored members |
| Route/UI | update | epic page and `epic status`: "1 lane", not "1 lanes" |

## Changelog

- 2026-11-24 — Bug reproduced; failing tests added (red).
- 2026-11-24 — Fixed: an epic owns the members written beside it (page,
  `--docs`, `stage`); lane count singularised; suite green (5509 pass).
- 2026-11-24 — Decided: the epic dashboard is not taught to read members
  inside an epic's uncommitted tree. With this fix that tree shows the
  authoring page, and after the verdict lands the members are on base.
- 2026-11-24 — Completed; fix done, tests green.
