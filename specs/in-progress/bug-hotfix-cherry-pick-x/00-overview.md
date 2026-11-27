---
github_identifier: "#352"
github_url: "https://github.com/SkitterByte/skitterspec/issues/352"
---

# Bug: hotfix land cherry-picks without -x

> **Type:** Bug
> **Name:** bug-hotfix-cherry-pick-x (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Raised:** 2026-11-27
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/352
> **Area:** packages/common/src/env/hotfix.js, packages/common/src/env/hotfixland.js, packages/*/assets/rules/commit-trailers.md
> **Severity:** 3 - Medium
> **Docs:** none: no page says how the carry cherry-picks; reference.html's "land by tag + cherry-pick" stays true

## Symptom

> `spec-env hotfix land` cherry-picks a hotfix onto the base branch without
> `-x`, so nothing records which hotfix a commit on main came from. Release
> tooling (skittership) then can't reliably tell a hotfixed fix from a new one
> if the patch changed on the way.

Repro in `~/code/ereqs`: `git log -1 --format=%B e303708a4` is the main copy
of hotfix commit `11421b3c0` and has no `(cherry picked from commit …)` line.
The same holds for every cherry-pick from `v37.23.2-hotfix.1..3`, so every
hotfix landed through `/spec-hotfix`. A patch-id match covers clean picks
only, so there is no local workaround.

## Root cause

Every cherry-pick the land runs or prints is built as a bare
`cherry-pick <shas>`:

- `packages/common/src/env/hotfix.js:324,337` — extra targets (`--also`),
  printed command and argv.
- `packages/common/src/env/hotfix.js:362-363` — the printed carry onto main.
- `packages/common/src/env/hotfixland.js:224` — the hand-run carry printed for
  a dirty base checkout.
- `packages/common/src/env/hotfixland.js:241` — the carry onto main, in place
  or through a throwaway worktree.
- `packages/common/src/env/hotfixland.js:275` — the carry under PR landing.

`--abort` is a sequencer verb and stays as it is.

## Failing test (red)

- `packages/common/test/cli-spec-env-hotfix-land.test.js` — *every commit
  carried onto main ends with (cherry picked from commit <hotfix sha>)*: a real
  land, then each new commit on main's message must end in that line, naming
  a `hotfix/login` commit with the same subject.
- `packages/common/test/env-hotfixland.test.js` — the carry (inplace,
  worktree), extra targets (argv and printed commands) and the dirty-base hint
  all say `cherry-pick -x`.

```
node --test packages/common/test/env-hotfixland.test.js packages/common/test/cli-spec-env-hotfix-land.test.js
```

Red: `actual: [ '-C', '/wt/login-onto-v36-4-0', 'cherry-pick', 'f1', 's1' ]`;
the e2e test's match on the landed body is `null`.

## Fix

- [x] Add `-x` to every cherry-pick in `hotfix.js` and `hotfixland.js`
      (targets, carry in place / worktree / PR, printed commands, the
      dirty-base hint); update the existing tests' expected argvs.
- [x] Note in every `commit-trailers.md` (the four provider assets and this
      repo's `.claude/rules/` copy) that a hotfix carry ends with
      `(cherry picked from commit <sha>)` after `Refs:`, and that it is
      expected.
- [x] Failing tests pass (GREEN); `pnpm build && pnpm test` green.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env hotfix land` — carry, `--also` targets and printed commands use `cherry-pick -x` |
| Skill/rule | update | `commit-trailers.md` — the cherry-picked line follows `Refs:` |

## Changelog

- 2026-11-27 — Bug reproduced; failing tests added (red).
- 2026-11-27 — Fixed: every hotfix land cherry-pick (carry, `--also` targets, printed commands) uses `-x`; commit-trailers.md notes the line after `Refs:`; test green
