# Linear mirror fidelity — phase-status lint, richer sub-issues, id stamping

> **Type:** Feature
> **Name:** feat-linear-mirror-fidelity (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-08-27
> **Area:** packages/sync-core/src/normalize.js, packages/sync-core/src/write.js, packages/linear/src/cli-sync.js, packages/linear/src/config.js, packages/common/assets/skills/spec-review, packages/linear/assets/skills/spec-push, packages/linear/assets/seams, packages/linear/assets/core/linear.config.md
> **Stack:** worktree

## Problem

The first real-world `/spec-push` on v9 pushed four specs correctly, but surfaced
one silent-corruption path and two ergonomic gaps.

A phase's Linear state comes from **one** signal: the `⬜`/`🔄`/`✅` emoji in the
phase file's H1 (`normalize.js` `phaseStateBucket`). Every way of getting that
wrong is invisible — `EMOJI_STATUS[emoji] || 'backlog'` conflates "author marked
it not-started" with "author used a format I don't parse", so a wrong state
pushes cleanly and `record` then commits the wrong value as *intended*. In the
field this hit three specs migrated under `/spec-review`, which is the common
path to authoring phase files from scratch and is the one lifecycle skill that
never mentions the convention. Four genuinely-complete phases projected as
`backlog` and nothing looked wrong — the overview index table was right the whole
time.

Separately: with tasks no longer synced (the correct call), a sub-issue in Linear
is title + one `**Goal:**` line — too thin to act on. And `/spec-push` has the
agent hand-stamp `linear_identifier` / `linear_issue_id` across N files before
calling `record`; one mistyped id re-mints a duplicate issue on the next push.

## Decisions

1. **The H1 emoji stays the single load-bearing signal.** No `**Status:**`-line
   fallback in `phaseStateBucket`. One convention beats two; the fix is to make
   breaking it *loud*, not to accept more shapes. (Rejected: lenient parsing —
   it doubles the surface and still leaves a third shape unhandled.)
2. **`/spec-review` states the convention** in its "Update the spec" section, the
   way `/spec-go` already does. Cheapest fix, and it closes the exact authoring
   path that failed.
3. **A three-way status lint warns on inconsistency.** The phase-file template
   already carries three status signals — the H1 emoji (load-bearing), the
   `> **Status:**` line, and the overview phase-index row — and `/spec-go`
   updates all three. The lint warns when the H1 emoji is **absent**, and when
   the three **disagree**. Either check alone would have caught the field
   failure, since the index row and the `Status:` line were both correct.
4. **Warn everywhere, never block.** `normalize`, `push` and `status` all emit
   warnings; exit code stays 0 and a legacy spec still pushes. Human output gets
   them inline, `--json` sends them to **stderr** so the plan stays clean JSON for
   the skill to parse. (Rejected: non-zero exit on `push` — it forces a stop on
   every legacy spec to fix a problem that is now visible anyway.)
5. **The `Status:` line is cross-checked leniently.** Read an emoji from it if
   present, else map words (`not started`/`todo` → not-started, `in progress`/
   `doing` → in-progress, `done`/`complete` → done). An unrecognised value is
   **skipped, not warned** — the line is free prose and false positives would
   train the warning away.
6. **`mapping.tasks` gates the task checklist, defaulting to `"checklist"`.** The
   key is already documented and loaded by `config.js` but consumed by nothing —
   this gives it its job. `"checklist"` projects the phase's tasks as a read-only
   markdown checklist under the Goal; `"none"` keeps today's one-line sub-issue.
   Inline `(KEY-123)` suffixes on legacy task lines are stripped (via
   `parseTaskLine`) so the mirror stays clean.
7. **Accept the one-time re-push churn.** Tasks join `subIssueHash`, so every
   already-pushed spec reports its sub-issues as `update` on the next push. One
   push reconciles it; cheaper than a snapshot migration, and it carries a
   release note.
8. **`spec-sync stamp` validates before it writes.** `stamp <spec> --issue KEY-N
   [--url URL] --sub <ref>=KEY-M …` resolves every `--sub` ref to a real phase
   file and checks every id against `KEY-123` **before** touching a file, so a
   typo fails clean rather than half-stamping. `record` stays a separate call —
   single responsibility, and the skill already sequences the two.
9. **Both stamping call-sites move to the helper** — `/spec-push` step 4 and the
   `spec-tracker-link` seam fragment (which `/spec` uses to stamp ids at
   creation time).

## Solution overview

**Lint.** `readPhaseFiles` already parses each phase H1; extend it to keep the
raw emoji (`null` when absent) and the `> **Status:**` line. Add a pure
`lintPhases(snapshotDir, config)` in `normalize.js` returning
`[{ file, code, message }]` with codes `missing-status-emoji` and
`status-disagreement`; the overview side reuses the existing `parsePhaseIndex`.
`cli-sync.js` prints them under a `warnings:` block (or to stderr under `--json`).

```
spec-sync push: SKI2-11
  warning 03-projection.md: no ⬜/🔄/✅ in the heading — defaulting to backlog
  warning 02-engine.md: heading says ✅ but the overview index row says 🔄
  issue: description/state
```

**Checklist.** In `normalizeLocal`, when `config.mapping.tasks === 'checklist'`,
append a `## Tasks` block of `- [ ]`/`- [x]` lines (indentation preserved) to the
sub-issue `goal`. It flows through `subIssueHash` → plan → `save_issue`
description with no changes downstream.

**Stamp.** A new `specSyncStamp` in `cli-sync.js` over the existing
`writeFrontmatter` / `stampSubIssueId` writers in `write.js`. Parse `--issue`,
`--url` and repeatable `--sub ref=ID`; validate all; then write.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-sync stamp <spec> --issue --url --sub ref=ID` |
| CLI command | update | `spec-sync normalize\|push\|status` emit warnings |
| Config key | update | `mapping.tasks` now consumed; default `none` → `checklist` |
| Domain object | update | sub-issue `goal` gains a `## Tasks` checklist |
| Domain object | update | `subIssueHash` covers tasks (one-time re-push) |
| Skill/rule | update | `/spec-review` §4 states the H1 emoji convention |
| Skill/rule | update | `/spec-push` §4–5 use `spec-sync stamp` |
| Skill/rule | update | `spec-tracker-link` seam uses `spec-sync stamp` |
| Docs | update | `linear.config.md` — tasks-as-checklist, lint warnings |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Document the H1 status convention in `/spec-review` | ⬜ | [01-spec-review-convention.md](01-spec-review-convention.md) |
| 2 | Three-way phase-status lint, surfaced by the CLI | ⬜ | [02-status-lint.md](02-status-lint.md) |
| 3 | Project phase tasks as a sub-issue checklist | ⬜ | [03-task-checklist.md](03-task-checklist.md) |
| 4 | `spec-sync stamp` helper + move both call-sites | ⬜ | [04-stamp-helper.md](04-stamp-helper.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-27 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-08-27 — Spec created from the v9 `/spec-push` field report (first
  real-world push, skitterload repo, 4 specs / 13 sub-issues).
- 2026-08-27 — Decided against a `**Status:**`-line fallback in
  `phaseStateBucket`; the lint warns instead, keeping one convention.
