---
linear_identifier: "SKS-391"
linear_url: "https://linear.app/skitterbyte/issue/SKS-391/afterland-commands-run-in-the-primary-checkout-after-a-land"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# afterLand — commands run in the primary checkout after a land

> **Type:** Feature
> **Name:** feat-after-land-hook (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-10-20)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-20
> **Area:** packages/common/src/env/config.js, env/integrate.js, env/hotfix.js, src/cli.js, assets/core/env.config.md, assets/skills/{spec-complete,spec-to-main,no-spec}
> **Stack:** worktree

## Problem

`env.config.json` can run commands at provisioning (`setup`) and nothing after a
land. ereqs's deploy runs imperative data migrations (`pnpm db:data-migration`),
but nothing runs them on a developer's dev DB: on 2026-10-19 it had **4 pending**
migrations already on `main`. Its workaround is a "project deviation" paragraph
hand-inserted into `/spec-complete` and `/spec-to-main`, which marks both
`customized` in the manifest, so `skitterspec update` stops delivering upstream
changes to them.

Raised by the ereqs maintainers (handoff, 2026-10-19).

## Decisions

1. **New top-level key `afterLand: ["cmd", …]`, default `[]`** — normalised by
   the same rule as `setup` (trimmed non-empty strings; anything else dropped,
   never thrown). Absent ⇒ every plan prints exactly what it prints today.
2. **Literal, no token expansion.** They run on the base branch in the primary
   checkout, where a spec's `{slug}`/`{port}` mean nothing. Rejected: reusing
   `setup`'s tokens for symmetry — the values would be misleading.
3. **The engine plans, the skill runs** — same split as the land commands.
   `integrate` and `hotfix land` print the commands in a separate section after
   the land commands, with the directory they run in (primary checkout; the
   checkout itself in `checkout` mode, after the `switch` to base).
4. **`integrate`'s no-op still prints them.** "Already landed" is often a land
   from another machine or an earlier session, which leaves them pending here.
   A **blocked** plan prints none — nothing landed.
5. **`hotfix land` prints them only when main is cherry-picked.** With
   `hotfix.cherryPickMain: false`, or on its no-op (no commits beyond the base
   tag), main gained nothing. Rejected: always, like integrate.
6. **Who runs them: the code lands.** `/spec-complete` (6-feature/bug and
   6-hotfix), `/spec-to-main` and `/no-spec`. `/spec`'s authoring land skips them
   — a documents-only land changes no code. Rejected: only the two skills in the
   handoff (a `/no-spec` lockfile refresh is exactly a land that needs an
   install); every caller (a migration on every spec document landed).
7. **Stop at the first failure.** Later commands may depend on earlier ones, as
   `setup` assumes. The run is `⚠️`, naming the failed command and the ones that
   did not run. It **never undoes the land and never blocks teardown** — the
   land is correct and the follow-up is the operator's.
8. **Reported in `Notes`** — what ran and where. With the key absent the run
   says nothing about it.

## Solution overview

`config.js` gains `afterLand` beside `setup`. `planIntegrate`,
`planIntegrateCheckout` and `planHotfixLand` return `afterLand: { cwd, commands }`
(empty commands when unconfigured or not applicable); the noop branch of the two
integrate planners carries it too. The CLI appends, only when non-empty:

```
  then, in the primary checkout (/path/to/repo), run:
    pnpm db:data-migration
```

— after the land commands, or after the "already landed" line. The three skills
run them after the land succeeds (and, in `/spec-to-main`, before the re-test on
base), stop on the first non-zero exit, and carry the outcome into `Notes`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `env.config.json` → `afterLand: string[]` (default `[]`) |
| CLI command | update | `spec-env integrate` — after-land section (worktree, checkout, no-op) |
| CLI command | update | `spec-env hotfix land` — after-land section when `cherryPickMain` |
| Skill/rule | update | `/spec-complete` 6-feature/bug + 6-hotfix, `/spec-to-main` §4–5, `/no-spec` land |
| Docs | update | `assets/core/env.config.md` field reference |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Parse `afterLand` and print it in the land plans | ✅ | [01-engine.md](01-engine.md) |
| 2 | Skills run it and report it | ✅ | [02-skills.md](02-skills.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-20 | Ready | backlog | Reuben Greaves |
| 2026-10-20 | In Progress | in-progress | Reuben Greaves |
| 2026-10-20 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-20 — Spec created from the ereqs handoff.
- 2026-10-20 — Added `Notes` to `/spec-complete` and `/spec-to-main` report fields (neither had one) so the after-land outcome has a row.
- 2026-10-20 — Completed; all phases done, tests green.
