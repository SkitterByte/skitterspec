# Upgrade and update safety — say what was skipped, warn on a legacy mirror, gate push on validated states

> **Type:** Feature
> **Name:** feat-upgrade-and-update-safety (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-08-27)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-27
> **Area:** packages/common/src/init.js, packages/linear/src/cli-sync.js, packages/sync-core/src/normalize.js, packages/linear/assets/skills/spec-push, packages/linear/assets/core/SETUP.md, packages/skitterspec-linear/package.json
> **Stack:** worktree

## Problem

Three findings from the skitterspec-linear 9.2.0 field report share one shape:
**the tool knows something the user needs and does not say it.** Each cost the
reporter manual work or a near-miss on a destructive push.

**`update` does not say what it skipped.** `customized (kept)` prints a filename
and nothing else, so there is no way to learn *which* upstream changes you just
declined without diffing each file against `node_modules` by hand. The reporter
discovered that 9.x had added self-committing behaviour to `/spec-complete` and
`/spec-cancel` — a real behavioural change — only by diffing manually. The safe
path today is "clobber and re-apply your edits by hand", which is what they did
for three files.

**The 9.0.0 remodel silently orphans an existing mirror.** Specs carrying
`linear_project_id` / `linear_milestone_id` read as unlinked under 9.x, which
looks for `linear_identifier` / `linear_issue_id`. `push` produces an
**all-creates** plan with no indication that a prior mirror ever existed. For the
reporter that would have minted 17 fresh objects and abandoned 2 projects, 15
milestones and 145 task issues. They caught it only because an all-creates plan
looked wrong for specs synced an hour earlier. A thorough `MIGRATION.md` exists
in this repo — but `packages/skitterspec-linear/package.json` ships
`files: ["bin", "src", "assets"]`, so it is **not in the published tarball**. The
reporter could not have found it.

**`push` does not validate workspace state names.** `/spec-push` step 3 tells the
agent to run `spec-sync status --workspace-states` first, and that check is
correct — but it is advisory. Skip it and `push` sends a state name Linear
silently ignores. The 8→9 switch makes this easy to trip because the correct
value inverts: project status `Completed` becomes issue state `Done`.

## Decisions

1. **`update` reports a change summary per skipped file** — `+34 −13` beside each
   `customized (kept)` entry, computed against the current package asset — and a
   `--diff` flag dumps the unified diffs. Enough to decide, cheap enough to be
   the default.
2. **Ship our own minimal line diff** rather than adding a dependency or shelling
   out to `diff(1)`. `packages/common` is deliberately zero-dependency and
   `diff(1)` is not a portable guarantee. A small LCS over lines is bounded work.
3. **No three-way merge.** The reporter names it as the ideal; it is a large
   feature with its own failure modes. The diff summary plus
   `bug-update-pins-stale-manifest` covers the real need: know what you declined,
   and never be pinned by accident.
4. **A legacy mirror is reported in the plan itself, not as a warning.**
   `/spec-push` consumes `push --json`, and `--json` sends warnings to
   **stderr** — the agent may never surface them. So the plan JSON carries a
   `legacy` field naming the pre-9.0 keys found and how many objects the
   all-creates plan would orphan, and `/spec-push` **stops and asks** when it is
   present. A warning the consumer can miss is not a fix for a near-miss.
5. **Detection is by frontmatter and snapshot shape** — `linear_project_id` on
   the overview, `linear_milestone_id` on a phase file, or a last-pushed snapshot
   with `{project, milestones, issues}`. All three are unambiguous 8.x markers.
6. **`MIGRATION.md` ships with the package** and `SETUP.md` links it. The guide
   was already written and already correct; it simply never reached anyone.
7. **`push` refuses without validated states.** The CLI is offline — `mcp.js` is
   the *skill's* adapter and the engine has no Linear access — so `push` cannot
   validate by itself. It therefore requires `--workspace-states <file>`, which
   `/spec-push` step 3 already produces, with `--skip-state-check` as the
   deliberate escape hatch. Making the existing advisory step mandatory is
   cheaper and more honest than inventing a cache of last-validated names.

## Solution overview

**Diff summary.** A small `linesDiff(a, b) → {added, removed, hunks}` helper in
`packages/common/src`. `report.customized` carries the counts; `printReport`
renders them inline; `--diff` prints the hunks after the report.

**Legacy detection.** A pure `detectLegacyMirror(snapshotDir, dir, config)` in
`sync-core`, returning `null` or `{ keys, orphanCount }`. `push` attaches it to
the plan as `plan.legacy`; human output prints it as a loud block; `/spec-push`
gains a step that halts on it.

**State gate.** `specSyncPush` takes the same `--workspace-states` flag
`specSyncStatus` already has, runs the existing `validateStates`, and exits
non-zero on a bad name — reusing the exit-code plumbing fixed in
`feat-linear-mirror-fidelity` Phase 4.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `update` prints `+N −M` per `customized (kept)` file |
| CLI command | add | `update --diff` dumps the declined upstream changes |
| CLI command | update | `spec-sync push` requires `--workspace-states` (or `--skip-state-check`) |
| CLI command | update | `spec-sync push` refuses on a bad state name (non-zero exit) |
| Engine | add | `linesDiff` helper in `packages/common/src` |
| Engine | add | `detectLegacyMirror` in `sync-core`; `plan.legacy` field |
| Skill/rule | update | `/spec-push` — halt on `plan.legacy`; states check is now enforced |
| Docs | update | `SETUP.md` links `MIGRATION.md`; package `files` ships it |
| Packaging | update | `packages/skitterspec-linear/package.json` → `files` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `update` says what it skipped | ✅ | [01-update-reports-skipped.md](01-update-reports-skipped.md) |
| 2 | Detect and report a pre-9.0 mirror | ✅ | [02-legacy-mirror-warning.md](02-legacy-mirror-warning.md) |
| 3 | `push` refuses without validated states | ✅ | [03-push-state-gate.md](03-push-state-gate.md) |

## Open questions

- [x] **Resolved:** refuse in **both** cases now — a missing states file and a
      bad state name both exit non-zero, with `--skip-state-check` as the
      deliberate escape hatch. This is a breaking CLI change, so
      `@skitterbyte/skitterspec-linear` needs a **major** bump (9.x → 10.0.0) when
      released; the commit carries the `!` marker so the release notes file it
      under *Action required*.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-27 | Ready | backlog | Reuben Greaves |
| 2026-08-27 | In Progress | in-progress | Reuben Greaves |
| 2026-08-27 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-08-27 — Captured from the skitterspec-linear 9.2.0 field report. Grouped
  three findings into one spec because they share a cause — the tool withholding
  what it knows — and touch the same two CLIs.
- 2026-08-27 — Found while triaging: `MIGRATION.md` is complete and correct but
  absent from the published tarball (`files: ["bin", "src", "assets"]`), so the
  reporter's "no migration path" is partly a packaging bug, not a docs gap.
- 2026-08-27 — Decided `plan.legacy` must be a plan **field**, not a warning:
  `--json` routes warnings to stderr, which is exactly the channel the consuming
  skill can miss.
- 2026-08-27 — Confirmed the sync CLI is offline, so "validate inline" is
  impossible as literally requested; enforcing the existing `--workspace-states`
  handoff is the workable form (Decision 7).
- 2026-08-27 — Phase 1: neither published README had a section on `update` at
  all, so "update the README section" became "write one" — both distributions now
  carry an **Upgrading** section showing the `+added −removed` summary and
  `--diff`. The gap explains the field report: nothing outward-facing told anyone
  what `customized (kept)` withheld.
- 2026-08-27 — Phase 1: without `--diff`, a run that kept files now prints a
  one-line pointer to it. A summary nobody knows how to expand is only half the
  fix.
- 2026-08-27 — Phase 2: `detectLegacyMirror` takes an options object
  (`{dir, snapshotDir, identifier, config}`), not the positional signature the
  plan named — it has to read the last-pushed snapshot, which is keyed by
  identifier. Matches `push`'s own shape.
- 2026-08-27 — Phase 2: a legacy **snapshot alone** flags the spec, even when the
  frontmatter is clean. A half-migrated spec whose keys were hand-removed still
  has a live mirror to orphan, and that is the case least likely to be noticed.
- 2026-08-27 — Phase 2: `MIGRATION.md` now ships with **both** distributions, not
  just the Linear one — the single root guide documents the base's v1→v2 and
  v2→v3 moves as well. `build-dist` copies it and a test asserts the shipped copy
  is byte-identical to the root source and listed in `files`.
- 2026-08-27 — Phase 3: the refusal now says what IS available, not just what is
  wrong. Added `stateSuggestions` to the engine: it maps each failing bucket onto
  a workspace state by lifecycle keyword, which is the only thing that solves the
  actual 8→9 case — the workspace's `Completed` and the v9 default `Done` are
  nowhere near each other by string distance, so a "did you mean" built on edit
  distance would have been silent exactly where it was needed. Where no bucket
  match exists it suggests nothing and lists the real states instead of guessing.
- 2026-08-27 — Phase 3: `/spec-push` now offers to apply the suggested fix to
  `linear.config.json`, with explicit consent. A refusal the agent can only relay
  leaves the user doing the lookup the tool already did.
- 2026-08-27 — Phase 3: the five existing `push` tests now pass
  `--skip-state-check`. They assert other behaviour and predate the gate; making
  them satisfy it would have tested the gate five times and their own subject
  never.
- 2026-08-27 — Completed; all three phases done, 566 tests green (530 before).
  Nothing deferred. **Action required at release:**
  `@skitterbyte/skitterspec-linear` takes a **major** bump — `spec-sync push` now
  refuses without `--workspace-states`.
