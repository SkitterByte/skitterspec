---
linear_identifier: "SKS-57"
linear_url: "https://linear.app/skitterbyte/issue/SKS-57/bug-the-docs-sites-quoted-cli-output-drifts-unchecked"
---

# Bug: the docs site's quoted CLI output drifts unchecked

> **Type:** Bug
> **Name:** bug-stale-docs-samples (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — fixed (test green)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** docs/index.html, docs/linear.html, scripts/docs-claims.test.js
> **Stack:** worktree

## Symptom

`docs/linear.html` showed two `spec-sync doctor` samples reading
`specs/ + 16 skills installed`. After `feat-script-only-commands` moved
`spec-connect` and `spec-live` out of `.claude/skills/`, a fresh
`skitterspec-linear` install ships **13 skills and 2 commands**.

Reproduce:

```
$ node packages/skitterspec-linear/bin/skitterspec-linear.js init /tmp/x --yes
$ ls /tmp/x/.claude/skills | wc -l   # 13
$ grep -c '16 skills installed' docs/linear.html   # 2
```

The whole suite stayed green throughout. A quoted sample of tool output is read
as fact, so a stale one is a claim the reader has no way to check.

## Root cause

`scripts/docs-claims.test.js` verifies that the site names **things that exist** —
in-page anchors, cross-page links, `spec-sync` verbs against the dispatch table,
and `/spec-…` against the shipped skills and commands. Every one of those checks
an **identifier**. None checks a **value**.

So the number in a `doctor` sample is unguarded by construction: nothing in the
repo relates it to the tree it describes. The file's own comment already names
this failure mode for identifiers — *"`spec-sync doctor` was documented for a
whole release after it had been renamed to `retarget`"* (`docs-claims.test.js:141`)
— and the same blind spot extends to everything the page quotes.

Two smaller drifts from the same release, found while checking:

- `docs/index.html` described `init` as writing "the spec skills into
  `.claude/`", which is now half the job — it writes `.claude/commands/` too.
- The table listed `/spec-live` and `/spec-connect` without saying they are
  commands rather than skills, which is what makes them user-typed.

## Failing test (red)

`scripts/docs-claims.test.js` — `every "N skills installed" the site quotes
matches the shipped count`. Run with `node --test scripts/docs-claims.test.js`.

Before the fix:

```
✖ every "N skills installed" the site quotes matches the shipped count
  AssertionError: docs/linear.html quotes "16 skills installed";
  the distribution ships 13
```

It counts from the **shipped assets**, not from an install: an installed
`.claude/skills/` also holds whatever other tools put there, so it is not a
figure the docs could ever state. A companion precondition test asserts the
catalogue is countable at all, so the guard can never silently measure nothing.

## Fix

- [x] Add the value-comparing test above to `scripts/docs-claims.test.js`, plus
      the precondition test and an assertion that the sample is still on the page
      (so the guard fails loudly if the sample moves rather than passing vacuously).
- [x] Correct both `doctor` samples in `docs/linear.html` to `13 skills installed`.
- [x] `docs/index.html`: say `init` writes skills **and slash commands**.
- [x] `docs/index.html`: mark `/spec-live` and `/spec-connect` as **commands** you
      type yourself.
- [x] `pnpm test` — **1259 green**; `pnpm build` composes both distributions.

## Deliberately not done

The site does not document the `spec-env` CLI **at all**, so this release's
zero-arg spec resolution (resolve from the worktree you are standing in) has no
home on it. That is a gap in coverage, not drift — the page makes no claim that
became false — so adding a section belongs to a docs feature, not this fix.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Docs | update | `docs/linear.html` doctor samples: 16 → 13 skills |
| Docs | update | `docs/index.html` scaffold blurb + the two command rows |
| Test | add | docs-claims: quoted counts must match the shipped catalogue |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-04 — Bug reproduced; failing test added (red).
- 2026-09-04 — Fixed: docs corrected and a value-comparing guard added; test green.
