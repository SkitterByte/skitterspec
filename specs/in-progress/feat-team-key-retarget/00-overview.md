# Retarget a mirror after a Linear team-key rename

> **Type:** Feature
> **Name:** feat-team-key-retarget (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-09-02)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-02
> **Area:** packages/sync-core/src/retarget.js (new), packages/sync-core/index.js, packages/linear/src/cli-sync.js, packages/linear/src/api.js, packages/linear/assets/core/linear.config.md, packages/linear/assets/skills/spec-status/SKILL.md
> **Stack:** worktree

## Problem

Renaming a Linear team changes the key in every issue identifier (`SKI-7` →
`SKS-7`), and the repo stamps those identifiers in three places: spec
frontmatter, the `linear-base` snapshot filenames, and the sub-issue keys inside
those snapshots. Nothing in the toolchain rewrites them, so after a rename every
stamped spec is stale. `/spec-push` fails hard — `no Linear issue found for
SKI-7` — which is the right failure, but the only way out is a manual rewrite.

That rewrite was done by hand on 2026-09-02 across two repos: ~135 files
(skitterspec `SKI`→`SKS`, skitterload `SKI2`→`SKL`). It is mechanical,
error-prone in exactly the way a hand-edit is, and has now happened twice in one
day — teams get renamed as products get named.

## Decisions

1. **Detect the rename; don't take it as an argument.** `config.linear.teamId`
   is stable across a rename, so Linear can be asked for that team's *current*
   key and compared against the recorded `config.linear.teamKey`. A difference
   IS the rename. Rejected `retarget <old> <new>`: nothing stops a typo
   rewriting 135 files to a key that does not exist.
2. **`teamKey` becomes the recorded baseline.** Today it is written by
   `init-config` and **never read** — only `teamId` is operational, which is
   precisely why a stale key never failed loudly. This gives it a job.
3. **Fall back to the stamps when `teamKey` is empty.** It defaults to `""` and
   skitterload's was empty, so detection must derive the old prefix from the
   identifiers actually stamped in `specs/**`. Refuse when the stamps disagree
   with each other rather than guess.
4. **Spot-check one identifier against Linear before writing anything.** Resolve
   the first remapped identifier and compare its title to the spec's. This is
   what makes the number-preservation assumption safe (verified by hand on
   2026-09-02: `SKS-7` carried the exact title of the spec stamped `SKI-7`).
   Cheap, and it catches a wrong mapping before 135 files move.
5. **Rewrite machine-read fields only — never prose.** Frontmatter
   (`linear_identifier`, `linear_url`, `linear_issue_id`), snapshot filenames and
   their `subIssues` keys, and `config.linear.teamKey`. Prose mentions
   ("Probe SKI-28 falsified the reported hypothesis") are the historical record;
   `.claude/rules/spec-planning.md` says never delete historical notes. Doc
   placeholders (`SKI-123`) and test fixtures live outside `specs/` and are not
   in scope at all.
6. **Dry-run by default, `--yes` to apply.** Matches `spec-sync push`/`apply`
   and `scripts/release.js`, where a bare run changes nothing.
7. **`git mv` for snapshot renames**, so history follows the file.
8. **Pure planner in `sync-core`, Linear reads in the adapter.** The rewrite is
   provider-neutral — "old prefix → new prefix over stamps and snapshots" — so it
   belongs beside `legacy.js`. Only detection and the spot-check touch Linear.
9. **CLI-only; no `/spec-retarget` skill.** Every other rare verb (`projects`,
   `states`, `verify`, `linked`) is CLI-only. Discovery comes from `/spec-status`,
   which already reports drift, plus a line in `linear.config.md`.
10. **Supersedes the shipped `spec-sync doctor`.** `skitterspec-linear@10.4.0`
    shipped this feature under the wrong name, in the wrong package: the verb
    `doctor` and the file `packages/linear/src/doctor.js` both belong to
    `feat-setup-doctor`, which was already Ready in the backlog when it was
    written. This spec is the correct design and the shipped code is retrofitted
    onto it — renamed to `retarget`, `--write` → `--yes`, planner moved to
    `sync-core`. Freeing the name is the point, not a side effect.
11. **One title-matched spot-check, not a per-ref existence sweep.** `10.4.0`
    reads every drifted ref to confirm it exists. That is ~198 reads on a real
    repo, it forces an MCP refusal, and existence proves nothing about
    *identity* — `SKS-7` existing does not make it the issue that was `SKI-7`.
    Decision 4's single title comparison tests the actual assumption at one read,
    which is what keeps the MCP path viable. The sweep is dropped.

## Solution overview

One new verb:

```
skitterspec spec-sync retarget [--yes]
```

Read-only by default. It resolves the recorded key (config `teamKey`, else the
prefix observed in `specs/**` stamps), asks Linear for the team's current key,
and if they differ builds a plan:

```
  team 2bb9baee (Skitterspec)
  config teamKey: SKI
  linear  key:    SKS   <- renamed

  would rewrite:
    22 frontmatter stamps   (linear_identifier, linear_url, linear_issue_id)
     6 base snapshots       (rename + re-key subIssues)
     1 config key           (linear.teamKey)

  spot-check: SKS-7 resolves, title matches the spec
  dry-run — re-run with --yes to apply.
```

`--yes` applies it, refusing first if any file the plan would touch is already
dirty — so the rewrite lands as one reviewable, revertable change.

Detection needs `key` added to the existing `team(id:)` GraphQL query. On the
MCP path `get_team` does **not** return the key (observed 2026-09-02), so that
path reports what it can and asks the operator to confirm rather than guessing.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-sync retarget [--yes]` |
| Module | add | `sync-core/src/retarget.js` — `planRetarget`, `applyRetarget` |
| API adapter | update | `team(id:)` query gains `key` |
| Config key | update | `linear.teamKey` — now read, not just written |
| Spec frontmatter | update | `linear_identifier`, `linear_url`, `linear_issue_id` |
| Snapshot files | update | `{sync.baseDir}/<id>.base.json` renamed + `subIssues` re-keyed |
| Skill/rule | update | `/spec-status` points at `retarget` on a key mismatch |
| CLI command | remove | `spec-sync doctor` — renamed to `retarget`, freeing the verb |
| Module | remove | `packages/linear/src/doctor.js` — moved to `sync-core/src/retarget.js` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Pure rewrite planner over stamps, snapshots and config | ✅ | [01-rewrite-planner.md](01-rewrite-planner.md) |
| 2 | Detect the rename and print the plan (read-only) | ✅ | [02-detect-and-dry-run.md](02-detect-and-dry-run.md) |
| 3 | Apply it, guarded and spot-checked | ⬜ | [03-apply-guarded.md](03-apply-guarded.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-02 | Ready | backlog | Reuben Greaves |
| 2026-09-02 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-02 — Spec created, after renaming two teams by hand the same day.
- 2026-09-02 — Reviewed vs codebase after `skitterspec-linear@10.4.0` shipped
  this feature as `spec-sync doctor`, built without reading the backlog. Ticked
  what already exists (`readTeam`, the frontmatter-scoped rewrite, snapshot
  rename + re-key, prose left alone, the dirty-tree guard, `git mv`); retargeted
  the remaining tasks onto renaming and moving that code rather than writing it
  fresh. Added decisions 10 and 11.
- 2026-09-02 — Dropped the per-ref existence sweep in favour of decision 4's
  single title-matched spot-check: cheaper, tests identity rather than mere
  existence, and keeps the MCP path workable.
- 2026-09-02 — Phase 1 done. Validating the planner against `~/code/ereqs`
  exposed something the fixtures could not: `linear_url` carries the
  identifier **lowercased** in its path, so the uppercase-only rule skipped
  29 of 33 real urls — the same ones the hand-repair missed, because they do
  not look like stamps. Matching is now case-insensitive and preserves the
  case written. A `REU`→`ERQ` plan over ereqs now fixes 29 files, prose
  byte-identical.
- 2026-09-02 — `doctor.js` stays until phase 2 repoints `cli-sync.js` at
  `sync-core`; deleting it in phase 1 would break a green build mid-move.
- 2026-09-02 — Phase 2 done. `spec-sync doctor` is gone: the verb is now
  `retarget`, `--write` is `--yes`, `doctor.js` and `cli-doctor.test.js` are
  deleted, and `cli-sync.js` imports the planner from `sync-core`. The
  `/spec-sync` skill was repointed in the same phase rather than phase 3, so
  no phase ships a skill documenting a command that does not exist.
- 2026-09-02 — The per-ref sweep and its MCP refusal are gone with it; the
  MCP path now reports that `get_team` returns no key and asks the operator
  to confirm, as decision 9 intended.
