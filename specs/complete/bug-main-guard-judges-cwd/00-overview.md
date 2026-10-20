---
linear_identifier: "SKS-399"
linear_url: "https://linear.app/skitterbyte/issue/SKS-399/bug-main-guard-judges-the-sessions-cwd-not-the-file-being-written"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: main-guard judges the session's cwd, not the file being written

> **Type:** Bug
> **Name:** bug-main-guard-judges-cwd (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-10-20)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-20
> **Area:** packages/common/assets/hooks/main-guard.cjs, packages/common/src/env/mainguard.js, packages/common/src/cli.js
> **Stack:** worktree

## Symptom

With the primary checkout on `main`, `main-guard.cjs` refuses a `Write` to a
path outside the repo — the Claude scratchpad under `/private/tmp/…` — with
the "landing zone" refusal. The reverse case also happens: a session standing in a
worktree can `Write` into the primary checkout on `main` and is never refused.

Repro: a session with cwd = the primary checkout on `main`, isolation
configured, `Write` to `/tmp/x/notes.md` → denied.

## Root cause

The hook passes only `payload.cwd` to the engine
(`main-guard.cjs`: `['spec-env', 'main', 'check', '--dir', cwd]`), and
`checkMainWrite` (`env/mainguard.js`) decides `isPrimary` by comparing that
directory with the primary checkout. The write's own `tool_input.file_path` is
never read, so the guard answers "is the session standing on main?" when the
question is "does this write land on main?".

## Failing test (red)

`packages/common/test/main-guard-hook.test.js`, run with
`node --test packages/common/test/main-guard-hook.test.js`:

```
✖ STAYS SILENT: a write outside the repo, from the primary checkout on main
✖ STAYS SILENT: a write into a worktree, from the primary checkout on main
✖ a write into the primary checkout on main is denied, wherever the session stands
```

## Fix

- [x] Hook sends the write's path (`file_path`, or `notebook_path`) as
      `--path`; no path → the engine judges `cwd` as before
- [x] `checkMainWrite` takes `target`: the checkout is the `--show-toplevel` of
      the target's nearest existing ancestor, and only the primary checkout is
      guarded; "on base" is read from the primary checkout's HEAD
- [x] `spec-env main check --path <file>`
- [x] The hook test now runs the source engine, not the composed
      `node_modules/.bin` build, so it tests the diff
- [x] Failing tests now pass (GREEN); full suite green (3641)

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env main check --path <file>` |
| Skill/rule | update | `main-guard.cjs` passes the write's path |
| Business rule | update | the guard judges where a write lands, not where the session stands |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-20 | In Progress | in-progress | Reuben Greaves |
| 2026-10-20 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-20 — Bug reproduced; failing test added (red).
- 2026-10-20 — Fixed: the hook passes the write's path and the engine judges
  that path's checkout; test green. This reads a write's location, never its
  name, so it is not the exception list `judgeMainWrite` rejects. A target in
  a different configured repo is allowed, since that repo's guard belongs to
  its own sessions.
- 2026-10-20 — Consumer projects get the fixed hook on `skitterspec update`.
  Until then they keep the old cwd-based check.
- 2026-10-20 — Completed; all phases done, tests green.
