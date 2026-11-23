---
github_identifier: "#287"
github_url: "https://github.com/SkitterByte/skitterspec/issues/287"
---

# Bug: two hotfixes from one tag cannot ship in one release

> **Type:** Bug
> **Name:** bug-hotfix-shared-release
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/287
> **Author:** Reuben Greaves
> **Raised:** 2026-11-23
> **Area:** `packages/common/src/cli.js` (hotfix land/finish), `packages/common/src/env/hotfix.js`, `packages/common/src/env/hotfixland.js`, `spec-hotfix` and `spec-complete` skills
> **Docs:** reference

## Symptom

In ereqs on 2026-11-23, two `/spec-hotfix` specs forked from `v37.23.2`:
`hotfix-delap-limit-edit-strands-step` (A) and
`hotfix-order-false-rejection-email` (B). To ship both in one deploy, B was
rebased onto A. `hotfix land B --push` cut `v37.23.2-hotfix.1`, which holds
both fixes. That part worked. A then had no supported way to complete:

- `hotfix land A` reuses only a release recorded under A's own name, and only
  while HEAD carries its tag. A's completion commit moved HEAD, so the plan
  cut `v37.23.2-hotfix.2` holding only A's fix. That is a redundant prod
  deploy, and it would have dropped B's fix if B's tag were not live already.
- `hotfix finish A` refused: `no release tag at HEAD`, and it has no `--force`.

The workaround was to cherry-pick A's completion onto main by hand. A's
worktree is still standing.

Repro: tag `v1.0.0`, fork `hotfix/a` and `hotfix/b` from it, rebase b onto a,
`hotfix land hotfix-b --push`, commit A's completion, then
`hotfix land hotfix-a --plan`. That plans `release: git tag v1.0.0-hotfix.2`.

## Root cause

`specEnvHotfix` (`packages/common/src/cli.js`, `released` computed beside
`readHotfixRecord(dir, config, spec.folder)`) only knows one kind of "already
released": a release recorded under the spec's **own** name, at HEAD. Nothing
asks whether the branch's fix commits are already in a release some other land
cut. `planHotfixFinish` (`packages/common/src/env/hotfix.js`) requires a tag at
HEAD and the branch on the remote, so it has the same blind spot.

## Failing test (red)

`packages/common/test/cli-spec-env-hotfix-shared-release.test.js` builds the
repro end to end. The first test asserts that A's plan reads
`release: already shipped in v1.0.0-hotfix.1`. The second asserts that A's land
cuts no tag, carries only its completion, and that `finish` then removes the
worktree. Run it with
`node --test packages/common/test/cli-spec-env-hotfix-shared-release.test.js`.

```
actual: '…  1. release: git tag v1.0.0-hotfix.2\n  2. push: held — no consent to push to origin\n  3. carry: cherry-pick 1 commit onto main\n',
expected: /release: already shipped in v1\.0\.0-hotfix\.1/,
```

## Fix

- [x] `shippedCandidates(baseRef, tags)` in `hotfix.js` lists the later
      releases on the base's own line (`<root>-hotfix.N` and `X.Y.(Z+n)`),
      oldest first. Pre-releases and other minor lines are left out, and an
      unreadable list or base gives none.
- [x] `hotfixShipped` in `cli.js` takes the fix commits (`baseRef..branch`
      minus spec-document-only commits) and returns the first candidate that
      holds every one of them, by ancestry or by patch (`missingOn`). No fix
      commits, or anything git will not read, returns null, so a release is
      cut. The blind spot is named beside it.
- [x] `planHotfixLand` takes `shipped` and emits a `release` step
      `via: 'shipped'` that runs nothing. The push step asks the remote for
      that tag, and the carry takes only what main lacks.
- [x] `planHotfixFinish` takes `shipped`. That release on the remote, plus
      every commit of the branch on the base, replaces both the tag at HEAD and
      the branch on the remote. Each failing check is named.
- [x] `spec-hotfix` and `spec-complete` each get a paragraph on shipping two
      hotfixes in one release, and the `reference` page describes the new path.
- [x] Failing tests pass. `pnpm build` and `pnpm test` are green.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env hotfix land`: `release: already shipped in <tag>` when another land's release holds the fix |
| CLI command | update | `spec-env hotfix finish`: accepts a shipped release on origin plus a full carry in place of a tag at HEAD |
| Skill/rule | update | `spec-hotfix`, `spec-complete`: shipping two hotfixes in one release |

## Changelog

- 2026-11-23 — Bug reproduced from the ereqs handoff. Failing test added (red).
- 2026-11-23 — Fixed: land and finish recognise a release cut by another
  hotfix that holds every fix commit. Tests green.
- 2026-11-23 — Decided: `--with` is not built. Containment answers the same
  question with no extra flag, and it also covers a pair landed before this
  fix. The patch bump is covered as well as `hotfix-suffix`, because the
  default `patch` config hits the same bug (`tag v1.0.1 already exists`).
- 2026-11-23 — Follow-up surfaced: rendering a review from a worktree pinned
  at an old release tag restarted the shared review server on that tag's older
  engine (2.19.0 → 2.5.0). Not in scope here.
- 2026-11-23 — Completed; all tasks done, tests green.
