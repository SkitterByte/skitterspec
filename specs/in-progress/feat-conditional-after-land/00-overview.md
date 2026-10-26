---
github_identifier: "#35"
github_url: "https://github.com/SkitterByte/skitterspec/issues/35"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Conditional afterLand entries

> **Type:** Feature
> **Name:** feat-conditional-after-land (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-10-26)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-26
> **Area:** packages/common/src/env/{config,integrate,hotfix}.js, packages/common/src/cli.js, packages/common/assets/core/env.config.md, assets/skills/{spec-complete,spec-to-main,no-spec}
> **Stack:** worktree

## Problem

`spec-env integrate` fast-forwards the base branch in the primary checkout, but
the primary's generated artefacts were built for the old tree and nothing
rebuilds them. `setup` runs only when a worktree is provisioned, and `afterLand`
is a flat list of unconditional commands — so "regenerate the Prisma client when
the schema changed" means regenerating on every land or never.

Reported from ereqs (skitterspec-linear 18.0.0, worktree mode): a branch added
two Prisma models; its worktree suite was green (6,110 tests); after
`/spec-to-main` landed it, the primary checkout's suite had **25 failures, all
500s** — `prisma.dbSandboxScenario` was undefined because the primary's
generated client dated from 22 Oct. `pnpm run db:generate` fixed it. The same
holds for `pnpm-lock.yaml` and `pnpm install`. The failure reads as a code bug,
not stale codegen, and `/spec-complete`'s re-test on base hits it too.

## Decisions

1. **`afterLand` entries may be `{ "run": "<cmd>", "when": [<globs>] }`.** A
   plain string still means "always run", so every existing config behaves
   exactly as today. `when` accepts a string or an array.
2. **`when` is evaluated against the files the land changes in the primary
   checkout**, computed at plan time as `git diff --name-only <base>...<branch>`
   (merge-base to branch tip) — what the fast-forward will bring in. The plan is
   printed before the rebase runs, so the post-rebase tip does not exist yet; a
   rebase that conflicts aborts the land, so the two cannot diverge on a land
   that completes. For `hotfix land` the range is the union of files in the
   carried commits.
3. **Unknown range → run every conditional entry, and say so.** The
   already-landed no-op (a land made elsewhere) and any git read that fails are
   *cannot tell*; they route to the harmless branch
   (`.claude/rules/negative-checks.md` rule 4). Rejected: recording the base at
   which this checkout last ran `afterLand` — the skill runs the commands, not
   the engine, so the engine would need telling they succeeded: a new verb and a
   new way to be wrong, to save a redundant generate on a rare path.
4. **An empty known range skips every conditional entry and accuses nothing.**
   A land whose commits touch no files is healthy; it plans plain strings only.
5. **The plan prints why.** Each conditional entry is listed as run with the
   path that matched (`db:generate — prisma/schema.prisma changed`), or under a
   `skipped:` heading with its globs, or as run because the range is unknown.
   Skipped lines are informational — the skills run only the run list.
6. **A setup entry can be reused from `afterLand`** so the two lists don't
   drift. `setup` entries may also be `{ run, when }`; `when` is **ignored at
   bootstrap** (a fresh worktree always runs all setup), and an `afterLand`
   entry `{ "setup": true }` expands, in place, to every setup entry that
   declares `when`. Expansion happens at config load, so planners only ever see
   `{ run, when }`. Plain setup strings carry no trigger and are never pulled in.
   Normalised `config.setup` stays `string[]`, so bootstrap and every other
   consumer are untouched.
7. **Glob matching reuses `globToRegExp`** from `src/env/live.js` (moved to a
   shared helper), not a new dependency.
8. **`/spec`'s own documents-only land still skips the after-land section**,
   unchanged.

## Solution overview

```json
"setup": [
  { "run": "pnpm install --frozen-lockfile", "when": ["pnpm-lock.yaml", "**/package.json"] },
  { "run": "pnpm run db:generate", "when": ["prisma/schema.prisma"] }
],
"afterLand": [
  { "setup": true },
  "pnpm db:data-migration"
]
```

A land touching only `src/` prints:

```
  then, in the primary checkout (/repo), run (stop at the first failure):
    pnpm db:data-migration
  skipped (nothing in the land matched):
    pnpm install --frozen-lockfile   — when pnpm-lock.yaml, **/package.json
    pnpm run db:generate             — when prisma/schema.prisma
```

The plan object's `afterLand` grows from `{ cwd, commands }` to
`{ cwd, commands, entries, range }`, where `commands` stays the run list (so
existing callers and tests read the same field) and `entries` carries
`{ run, when, decision: 'always'|'matched'|'skipped'|'unknown', matched }`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | update | `afterLand[]`: string \| `{ run, when }` \| `{ setup: true }` |
| Config key | update | `setup[]`: string \| `{ run, when }` (when ignored at bootstrap) |
| CLI command | update | `spec-env integrate` (both modes, incl. no-op) prints matched / skipped / unknown |
| CLI command | update | `spec-env hotfix land` after-land section, range = carried commits |
| Domain object | update | plan `afterLand`: + `entries`, `range` |
| Skill/rule | update | `/spec-complete`, `/spec-to-main`, `/no-spec`: run the run list, skipped lines are informational |
| Docs | update | `env.config.md`: conditional entries, Prisma + lockfile example |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Config: conditional entries and the setup shorthand | ✅ | [01-config.md](01-config.md) |
| 2 | Planners and CLI: decide per entry against the land's range | ⬜ | [02-plan-and-print.md](02-plan-and-print.md) |
| 3 | Docs and skills | ⬜ | [03-docs-and-skills.md](03-docs-and-skills.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-26 | Ready | backlog | Reuben Greaves |
| 2026-10-26 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-26 — Spec created from the ereqs handoff (stale Prisma client after a land).
- 2026-10-26 — Phase 1: a `{ run, when }` whose `when` is unusable is dropped,
  not demoted to always-run. `{ run }` with no `when` is always-run, and setup
  objects (dropped before) are now kept. `{ setup: true }` copies `run`
  literally, so a setup step with `{slug}` tokens is not expanded after a land
  (phase 3 documents this).
