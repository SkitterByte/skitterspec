---
github_identifier: "#139"
github_url: "https://github.com/SkitterByte/skitterspec/issues/139"
---

# Bug: a CRLF checkout reads every managed file as a user edit

> **Type:** Bug
> **Name:** bug-crlf-manifest-hash
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/139
> **Author:** Reuben Greaves
> **Raised:** 2026-11-09
> **Area:** `packages/common/src/init.js`
> **Docs:** none: `index` covers init.js but never describes manifest hashing or edit detection

## Symptom

On Windows checkouts with `core.autocrlf=true`, `skitterspec update` sees every
managed file as a user edit and never refreshes it.

Repro: install, commit, then make a fresh clone or worktree on Windows with
autocrlf=true. The files are checked out CRLF; `.skitterspec-manifest.json`
holds the hashes of the LF content; `update --check` reports "your edit — kept"
for every skill, command and rule. Every teammate's copy then stops receiving
updates, silently.

## Root cause

`managedState` (`packages/common/src/init.js:408`) calls a file `pristine` only
when its bytes equal the shipped asset or its `sha1` equals the manifest entry.
Both are exact compares, so a CRLF working-tree copy of LF content fails both
and falls through to `customized`. The pristine-but-current checks in
`checkSync` and `resyncManagedFile` are the same exact byte compare, so even
with the classification fixed a CRLF file would read "out of date" forever.

## Failing test (red)

`packages/common/test/init-crlf-checkout.test.js` — installs, rewrites every
managed file CRLF (what autocrlf does), and asserts `managedState` says
`pristine`, `update --check` reports nothing, an older CRLF copy is "out of
date" and gets updated, a current CRLF copy is skipped rather than rewritten,
and a genuine one-line edit on a CRLF file is still "your edit — kept".
`cd packages/common && node --test test/init-crlf-checkout.test.js`

```
✖ a current install checked out CRLF reports up to date
  AssertionError [ERR_ASSERTION]: .claude/skills/no-spec/SKILL.md
    actual: 'customized',
    expected: 'pristine',
```

## Fix

- [x] Compare content with line endings normalised (CRLF→LF) everywhere a
      managed file is judged: the `sha1` that writes and checks the manifest,
      and the byte compares in `managedState`, `checkSync` and
      `resyncManagedFile` — one helper, so the four cannot drift apart
- [x] Failing test now passes (GREEN); run the project's typecheck and test
      commands — confirm no regressions.
- [x] None

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `skitterspec update` / `update --check` ignore line-ending-only differences |
| Business rule | update | manifest hash is of LF-normalised content (unchanged for LF files, so existing manifests stay valid) |

## Decisions

1. **Normalise in the engine, not in git.** `init` does not write a
   `.gitattributes`: it is the project's file, an `eol=lf` rule changes how git
   treats those paths for every contributor, and once the comparison ignores
   line endings it buys nothing for this bug.
2. **The manifest format does not change.** Assets ship LF, so the hash of
   normalised content equals the hash already recorded. No migration is needed.

## Changelog

- 2026-11-09 — Bug reproduced; failing test added (red).
- 2026-11-09 — Fixed: `normalizeEol` behind `sha1` and a `sameContent`
  compare in `init.js`; 4 new tests green, 4558 pass.
