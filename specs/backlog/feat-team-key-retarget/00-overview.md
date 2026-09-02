# Retarget a mirror after a Linear team-key rename

> **Type:** Feature
> **Name:** feat-team-key-retarget (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
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

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Pure rewrite planner over stamps, snapshots and config | ⬜ | [01-rewrite-planner.md](01-rewrite-planner.md) |
| 2 | Detect the rename and print the plan (read-only) | ⬜ | [02-detect-and-dry-run.md](02-detect-and-dry-run.md) |
| 3 | Apply it, guarded and spot-checked | ⬜ | [03-apply-guarded.md](03-apply-guarded.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-02 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-02 — Spec created, after renaming two teams by hand the same day.
