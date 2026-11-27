---
github_issue_id: "#346"
---

# Phase 1 — Config and a snapshotting take ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a migrations branch under `refusedReach: "snapshot"` is offered a
snapshotting take, and the take runs the snapshot before it switches. Planner
and CLI tests prove it.

## Tasks

- [ ] `config.js`: parse `live.snapshot` and `live.restore` (strings, default
      null) and accept `refusedReach: "snapshot"`. When either command is
      missing, the reach reads as unset and the reason is carried for
      `live take` to print.
- [ ] `live.js` `planTake`: on `migrationsHit` with reach `snapshot` and no
      `--snapshot`, refuse with a `satisfy` offer (`Snapshot the database,
      then take it live` → `live take <spec> --snapshot`). With `--snapshot`,
      return a `snapshot` step `{ command, path }` ahead of the checkout
      commands, plus a warning that data written while live is lost on
      release.
- [ ] `migrationsRefusal`: name the snapshot reach. When reach is unset, list
      it alongside the existing three.
- [ ] `cli.js` `live take`: run the snapshot step in the primary checkout with
      `SPEC_ENV_SNAPSHOT` set before any git command. On failure, refuse with
      the tail of the output and switch nothing. On success, write the receipt
      with `snapshot: { path, at }`.
- [ ] Tests: the offer is declared on every take (not spent by the ledger),
      snapshot runs before checkout, a failed snapshot switches nothing, and
      `snapshot` with a missing command reads as unset. Add stays-silent
      tests: a branch with no migrations under reach `snapshot` takes no
      snapshot and prints no warning.
- [ ] Run `pnpm build` and `pnpm test` until green.
