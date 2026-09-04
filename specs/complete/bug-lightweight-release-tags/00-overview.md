---
linear_identifier: "SKS-64"
linear_url: "https://linear.app/skitterbyte/issue/SKS-64/bug-release-tags-are-lightweight-so-pushes-silently-skip-them"
---

# Bug: release tags are lightweight, so pushes silently skip them

> **Type:** Bug
> **Name:** bug-lightweight-release-tags (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-09-04)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** scripts/release.js, scripts/release.test.js, RELEASING.md
> **Stack:** worktree

## Symptom

Seven release tags for **published** versions had never reached the remote:

```
skitterspec@16.6.0  16.7.0  16.8.0
skitterspec-linear@10.5.0  10.5.2  10.6.0  10.7.0
```

Five releases' worth. Found only because someone asked whether their push alias
sent tags — the pushes had all reported success.

Reproduce:

```
$ git tag -l --format='%(objecttype)' skitterspec@16.8.0
commit          # a bare ref: lightweight, no tag object
$ git push --follow-tags origin main
Everything up-to-date          # the tag is not sent, and nothing says so
```

## Root cause

`scripts/release.js:191` cut the tag with `git tag ${tag}` — no `-a`, so a
**lightweight** tag: a ref pointing straight at the commit, with no tag object.

`git push --follow-tags` sends *annotated* tags reachable from the pushed commits
and nothing else. It is the idiom for carrying a tag along with its branch, and
what most push aliases wrap. Against a lightweight tag it does nothing and says
nothing — the push succeeds, the tag stays local.

The failure is silent in both directions: `git tag --list` shows lightweight and
annotated tags identically, so nothing about the local repo looks wrong either.

This is the mirror of the failure `RELEASING.md` already documents. The tool cuts
the tag *after* a successful publish precisely so the tag list never claims a
release that did not reach npm (`skitterspec@16.3.1` was tagged and never
published, and was found from outside). This bug is the same asymmetry the other
way: npm has the version, but the remote has no tag pointing at the commit it was
built from.

## Failing test (red)

`scripts/release.test.js` — run with `node --test scripts/release.test.js`.
Before the fix:

```
✖ the release tag is annotated, so --follow-tags will send it
  AssertionError: tag step is lightweight: git tag skitterspec@2.0.1
  — --follow-tags would skip it
✖ the tag message names the release, not just the tag
✖ the printed tag command matches the argv it would run
✖ a --yes run cuts the same annotated tag
```

The last two are there because the step carries *two* representations — a printed
`cmd` a reader may copy, and the `argv` the tool runs — and because a local-only
`--yes` run tags as well, so the annotation must not be conditional on publishing.

## Fix

- [x] Cut the tag with `git tag -a <tag> -m "<name> <version>"` in
      `scripts/release.js`, updating both the `argv` and the printed `cmd`.
- [x] Name the blind spot in a comment: `--follow-tags` sends annotated tags only,
      and a lightweight one stays local while the push reports success.
- [x] Update the two existing tests that pinned the exact command string — the
      behaviour changed deliberately, so their expectations move with it.
- [x] Document it in `RELEASING.md` under **Tag scheme**: annotated is
      load-bearing, not cosmetic, and why.
- [x] Failing tests now pass (GREEN); `pnpm test` — **1280 green**.

## Deliberately not done

**The seven existing tags stay lightweight.** Re-cutting them would rewrite
history for tags that are already correct where it matters — they point at the
right commits, and six of the seven are now on the remote. Only tags cut from
here on are annotated.

The printed follow-up commands (`git push`, `git push origin <tag>`) are
unchanged: they name the tag explicitly and so always worked. The fix is about
the *idioms that do not*.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `release.js` cuts `git tag -a … -m …` |
| Docs | update | `RELEASING.md` — Tag scheme states why annotation matters |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |
| 2026-09-04 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-04 — Bug reproduced; failing test added (red).
- 2026-09-04 — Completed; 1280 tests green.
- 2026-09-04 — Fixed: release tags are annotated; docs and pinned tests updated.
