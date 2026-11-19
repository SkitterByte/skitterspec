---
github_identifier: "#240"
github_url: "https://github.com/SkitterByte/skitterspec/issues/240"
---

# Bug: Hooks fail open in a worktree with no node_modules

> **Type:** Bug
> **Name:** bug-hooks-engine-primary-checkout
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/240
> **Author:** Reuben Greaves
> **Raised:** 2026-11-19
> **Area:** packages/common/assets/hooks/{main-guard,review-gate,project-guard}.cjs
> **Docs:** review

## Symptom

`main-guard.cjs`, `review-gate.cjs` and `project-guard.cjs` locate the engine
with `findEngine(projectDir)`, which walks up at most 6 dirs for
`node_modules/.bin/<engine>` (win32: the package's JS entry), else returns
bare `'skitterspec'`. A worktree with no `node_modules` of its own — every
`spec-env up --docs` worktree — falls back to the bare name; when that is not
on PATH, spawn returns ENOENT and the hook allows. Every guard is then
silently off in that worktree.

Repro (ereqs, skitterspec-azure-boards 2.16.0, macOS):

```
mkdir /tmp/no-nm
printf '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"},"cwd":"/tmp/no-nm"}' \
  | node .claude/hooks/review-gate.cjs; echo $?      # 0, silent
```

Latent in ereqs today (0 of 23 worktrees lack `node_modules`), but it hits
every new `/spec` docs worktree, where project-guard is the guard that matters.

## Root cause

Worktrees live at `worktree.root` (`../{repo}-wt/<slug>`), a **sibling** of
the primary checkout, so the walk-up in `findEngine`
(`packages/common/assets/hooks/review-gate.cjs:87`, identical copies in
`main-guard.cjs` and `project-guard.cjs`) never reaches the primary's
`node_modules`. The ENOENT that follows is routed to `allow()` with no output
(`review-gate.cjs`: `if (result.error || result.status === null) allow()`).

## Failing test (red)

`packages/common/test/hooks-find-engine.test.js`, for each of the three hooks:

- *a worktree with no node_modules finds the primary checkout's engine* —
  a real `git worktree add` sibling; asserts the primary's `.bin` entry.
- *on win32 a worktree finds the primary checkout's JS entry*
- *a project subfolder in a worktree maps onto the primary's subfolder*
- *the worktree's own install still wins over the primary's*
- *STAYS SILENT — SKITTERSPEC_BIN still wins in a worktree*
- *an unreachable engine allows, and says so on stderr* — runs the hook with
  an empty PATH; asserts exit 0, no stdout decision, one stderr line naming
  the hook and the dir tried.

Run: `cd packages/common && node --test test/hooks-find-engine.test.js`

```
✖ review-gate.cjs: a worktree with no node_modules finds the primary checkout's engine
  + actual - expected
  + 'skitterspec'
  - '…/repo/node_modules/.bin/skitterspec-azure-boards'
ℹ pass 22
ℹ fail 12
```

## Fix

- [x] `locateEngine` in all three hooks: walk up from the project, then from
      the primary checkout (`git rev-parse --show-toplevel --git-common-dir`
      → the common dir's parent, with the project's subfolder mapped across),
      then the bare PATH name. `SKITTERSPEC_BIN` still wins; `findEngine`
      keeps its signature.
- [x] An ENOENT spawn still allows, but writes one stderr line:
      `<hook>: no skitterspec engine found from <dirs> or on PATH — this guard is off here; set SKITTERSPEC_BIN to fix`.
- [x] `docs/review.html`: the "every cannot-tell exits 0 and says nothing"
      line now names the one exception.
- [x] Failing tests now pass (GREEN); `node --test` in `packages/common` —
      no regressions.

`skitterspec update` ships the fixed hooks from `assets/hooks/` unchanged in
name, so nothing else is needed to reach installs.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Hook | update | `main-guard.cjs`, `review-gate.cjs`, `project-guard.cjs` — engine lookup falls back to the primary checkout; unreachable engine prints one stderr line |
| Hook export | add | `locateEngine(projectDir, platform)` → `{ engine, tried }` |

## Changelog

- 2026-11-19 — Bug reproduced; failing tests added (red).
- 2026-11-19 — Fixed: hooks resolve the engine through the primary checkout and name an unreachable one on stderr; tests green.
- 2026-11-19 — Completed; fix in, tests green.
