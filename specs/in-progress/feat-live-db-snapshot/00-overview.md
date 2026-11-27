---
github_identifier: "#345"
github_url: "https://github.com/SkitterByte/skitterspec/issues/345"
---

# Snapshot the database when a migrations branch goes live

> **Type:** Feature
> **Name:** feat-live-db-snapshot (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Raised:** 2026-11-27
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/345
> **Area:** packages/common/src/env/live.js, packages/common/src/env/config.js, packages/common/src/env/integrate.js, packages/common/src/cli.js, packages/common/assets/core/env.config.md, packages/common/assets/commands/spec-live.md, packages/common/assets/skills/spec-start/isolation.md, packages/common/assets/skills/spec-next/SKILL.md, docs/reference.html
> **Stack:** worktree
> **Epic:** epic-live-workbench
> **Waits on:** feat-drop-docker-stacks
> **Docs:** reference

## Summary

A project can let `/spec-live` take a branch that changes migrations. Before
the switch, skitterspec snapshots the dev database with a command the project
supplies. When the spec is handed back, it restores that snapshot, so the
database is left as it was before the take.

## Problem

`/spec-live` refuses any branch that touches `live.migrations`, and under PR
landing there is no `/spec-land` to put such a branch somewhere testable. The
only way through today is `live.refusedReach: "live-confirm"`. That runs the
migrations against the shared dev database and leaves it migrated after
`/spec-live off`, with base's code now running against the branch's schema.
Developers are willing to run a branch's migrations to test it. What they need
is to get the database back afterwards.

## Acceptance criteria

- With `refusedReach: "snapshot"` and both `live.snapshot` and `live.restore`
  set, `/spec-live <spec>` on a migrations branch refuses with a `satisfy`
  offer, "Snapshot the database, then take it live". Accepting it takes the
  branch live after the snapshot command succeeds.
- `/spec-live off` switches back to base, runs the restore, and reports it.
  The database then holds no data written while the spec was live.
- When the snapshot fails, nothing switches.
- When the restore fails, the switch stands and the snapshot file is kept.
  `live status` warns until `spec-env live restore` succeeds.
- `refusedReach: "snapshot"` with either command missing reads as unset and
  says so.

## Decisions

1. **A new reach value, `refusedReach: "snapshot"`.** It keeps one key as the
   answer to "how are migration branches reached". It is valid only when both
   `live.snapshot` and `live.restore` are set. Otherwise it reads as unset
   and says why, never as `live-confirm`. Rejected alternatives: letting the
   keys alone enable it (two keys would answer one question), and nesting it
   under `live-confirm`.
2. **A `satisfy` offer on every take, not a once-per-HEAD bypass.** Restore
   undoes the change, so nothing is weakened and nothing goes in the bypass
   ledger. The confirm stays so the reader sees that data written while live
   is lost on release. The command is `live take <spec> --snapshot`.
3. **The snapshot runs before the checkout.** A dev server that auto-migrates
   on reload would otherwise migrate before the snapshot. If the snapshot
   fails, the take is refused and nothing has switched.
4. **The engine owns the snapshot path.** It passes
   `SPEC_ENV_SNAPSHOT=<abs path>` (under `.spec-env/snapshots/<spec>-<stamp>`)
   to both commands, records the path in the live receipt, and deletes it only
   after the restore exits 0. That exit is the positive signal
   (`.claude/rules/negative-checks.md`).
5. **Restore runs on release, abort and the live-aware `integrate`, before
   `afterSwitch`.** "Released" means handing the workbench back, not the
   product release. Tying the restore to the PR merge would leave the shared
   database diverged for as long as review takes. After the merge,
   migrate-on-pull catches the database up.
6. **A failed restore never undoes the switch.** This matches `afterSwitch`.
   The pending restore is recorded in `.spec-env/live-restore.json`,
   `live status` warns about it, and `spec-env live restore` retries. An
   unreadable record counts as a restore still pending, so the snapshot is
   kept.
7. **Commands are strings, not `afterSwitch` entries.** A snapshot is never
   conditional on which files changed, so `when` would mean nothing.

## Solution overview

```jsonc
"live": {
  "migrations": ["**/Migrations/**"],
  "refusedReach": "snapshot",
  "snapshot": "pg_dump -Fc appdb > \"$SPEC_ENV_SNAPSHOT\"",
  "restore":  "pg_restore --clean -d appdb \"$SPEC_ENV_SNAPSHOT\""
}
```

Take: refuse with an offer → `--snapshot` → run snapshot → rebase, detach,
checkout → write the receipt with `snapshot` → `afterSwitch`. Release:
checkout base → restore → delete the snapshot and clear the receipt, or record
a pending restore → `afterSwitch`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `live.snapshot`, `live.restore` |
| Config key | update | `live.refusedReach` (+`"snapshot"`) |
| CLI command | update | `spec-env live take --snapshot`, `release`, `abort`, `status` |
| CLI command | add | `spec-env live restore` |
| CLI command | update | `spec-env integrate` (restores when ending a live take) |
| File | add | `.spec-env/snapshots/`, `.spec-env/live-restore.json` |
| Skill/rule | update | `/spec-live` command text, isolation.md, `/spec-next` manual-steps `Next` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done · ➖ cancelled.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Config and a snapshotting take | ✅ | [01-snapshot-take.md](01-snapshot-take.md) |
| 2 | Restore on release, abort and integrate, plus `live restore` | ⬜ | [02-restore.md](02-restore.md) |

## Open questions

- None

## Changelog

- 2026-11-27 — Spec created as member 2 of epic-live-workbench.
- 2026-11-27 — Phase 1: a git failure after a successful snapshot (rebase,
  detach or checkout) removes the snapshot file, since nothing switched and
  the database it copied was never changed.
