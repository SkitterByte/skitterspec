---
linear_identifier: "SKS-65"
linear_url: "https://linear.app/skitterbyte/issue/SKS-65/bug-spec-planningmds-verb-list-is-stale-and-unguarded"
---

# Bug: spec-planning.md's verb list is stale and unguarded

> **Type:** Bug
> **Name:** bug-stale-rules-verb-list (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-09-04)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** packages/common/assets/rules/spec-planning.md, packages/common/test/assets-prose.test.js
> **Stack:** worktree

## Symptom

`spec-planning.md` — installed into every project as `.claude/rules/` and loaded
as a project instruction — shipped:

```
skitterspec spec-env <up|down|prune|dev|connect|integrate|hotfix>
```

Seven of the ten verbs the engine dispatches; `live`, `status` and `resolve` were
missing.

## Root cause

`assets-claude-md.test.js`, added yesterday in `bug-stale-claude-md`, guards
exactly this failure — but only for `claude-md-section.md`. The rules file makes
the same claims at greater length and was not in its list.

The guard was written for the one asset that had been found stale, rather than
for the class of asset it belongs to. Widening it to every shipped prose asset
found this within seconds.

## Failing test (red)

`packages/common/test/assets-prose.test.js` (renamed from `assets-claude-md`, now
that it covers more than one file). Before the fix:

```
✖ any spec-env verb list is complete, or absent
  AssertionError: spec-planning lists spec-env <up|down|prune|dev|connect|
  integrate|hotfix> but the engine also has: status, resolve, live
```

## A false positive fixed on the way

Widening the guard also fired on this sentence, which is **correct**:

> nine lifecycle skills (plus the `/spec-connect` and `/spec-live` **commands**
> when isolation is on)

The old check matched `skills … /spec-connect` by proximity and could not tell
prose that *labels* something a command from prose that miscategorises it.
Replaced with the precise invariant — **a command must not appear as a row in a
skills table** — which is checkable and cannot misread a parenthetical. A guard
that fires on correct text trains people to ignore it.

The "nine lifecycle skills" count was also checked and is accurate: the table has
exactly nine rows. An earlier report in this session called it stale; it was not.

## Fix

- [x] Generalise the guard to a `PROSE` list covering `claude-md-section.md` and
      `rules/spec-planning.md`, and rename the file to `assets-prose.test.js`.
- [x] Replace the proximity check with the skills-table-row invariant.
- [x] Join lines before matching a verb list — the rules file wraps it across a
      line break, which the single-file version never had to handle.
- [x] Complete the verb list in `spec-planning.md` and note the zero-arg
      behaviour.
- [x] `pnpm test` — **1280 green**.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `spec-planning.md` lists all ten `spec-env` verbs |
| Test | update | guard covers every shipped prose asset, not one file |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |
| 2026-09-04 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-04 — Bug reproduced; failing test added (red).
- 2026-09-04 — Completed; 1280 tests green.
- 2026-09-04 — Fixed: verb list completed, guard widened to all prose assets.
