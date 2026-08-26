# Reap orphaned per-spec test databases

> **Type:** Feature
> **Status:** Complete (2026-08-26)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-26
> **Area:** packages/common/src/env/prune.js (new), packages/common/src/cli.js, packages/common/src/env/registry.js, .claude/skills/spec-complete/SKILL.md, .claude/skills/spec-cancel/SKILL.md
> **Stack:** worktree

## Problem

Per-spec isolation gives each Docker-escalated spec its own compose stack
namespaced by `COMPOSE_PROJECT_NAME` (`{repoSlug}_{slug}`). The stack's Postgres
storage is a Docker **named volume** (`{repoSlug}_{slug}_<volname>`) — the
"test DB per worktree". `spec-env up` creates it; `spec-env down --volumes` drops
it. The only path that drops a volume is an **explicit, opt-in, single-spec**
`spec-env down <name>`. Volumes therefore leak whenever that path is skipped: a
declined `/spec-complete` teardown, a manual `git worktree remove`, a
guard-aborted teardown (dirty/unpushed), or `--keep-volumes`. Nothing ever
reconciles live volumes against live specs, so orphans accumulate silently — we
just hit an incident of 100+ orphaned worktree DBs eating disk.

## Decisions

1. **Reap orphans, don't just drop-on-complete.** `/spec-complete` already drops
   the *current* spec's volume; the real gap is orphans from specs whose
   worktree/branch is already gone. The feature is an **orphan reaper**, not a
   change to the single-spec teardown. Rejected: only "make complete's drop more
   reliable" — it wouldn't reclaim the existing backlog of orphans.

2. **New `skitterspec spec-env prune` subcommand.** A reusable engine command,
   consistent with the existing `up|down|dev|connect|integrate|live` family.
   Being standalone means it can run from `/spec-complete`, `/spec-cancel`, or by
   hand/cron after an incident. Rejected: inlining the logic only inside
   `/spec-complete` — not reusable, not runnable to clean up an existing mess.

3. **Conservative orphan rule — liveness = an existing worktree, not the
   registry.** A volume is an orphan iff it belongs to the repo namespace
   (`{repoSlug}_…`) **and** does not belong to a spec that still has a git
   **worktree** (cross-checked against `specs/in-progress/`). We never parse a
   slug out of an orphan; instead we build a **protected-prefix set** from live
   slugs (`${repoSlug}_${slug}_`) and keep any volume matching one — everything
   else in the namespace is an orphan. The trailing `_` makes the match exact
   (`add` never protects `add-widget`, since slugs are kebab-case and `_` is the
   compose separator).

   Crucially, the **slot registry is NOT a liveness signal** — it is exactly what
   goes stale. A declined `/spec-complete` teardown never runs `spec-env down`,
   so the slot *and* the volume both linger; trusting the slot would protect the
   very orphan we mean to reap. So prune keys off worktree existence and treats
   the registry as advisory, optionally **freeing the stale slot** for any spec
   it reaps (via `freeSlot`). Rejected: "live = registry ∪ worktree" (stale slots
   shield orphans — the primary incident case) and blind age-only gating (could
   drop a live but idle spec's DB).

4. **List-then-confirm; the CLI only plans.** Following the existing pure-planner
   + CLI-IO seam (`planDown`/`specEnvDown`), `planPrune` is a pure function that
   returns the `docker volume rm` commands; the CLI prints the orphan report and
   the commands, and the **skill** shows them and requires explicit confirmation
   before executing. No volume is removed without the user seeing the list.

5. **No per-volume backup on prune.** Orphans are abandoned and have no running
   DB container to `pg_dump` from, so `docker.backupCommand` (which the live
   `spec-env down` still honours) is **not** run here. Documented as a deliberate
   choice: prune reclaims disk from already-dead specs. An optional
   `--older-than <days>` age guard is available for extra caution but defaults
   off (decision 3 already protects live specs).

## Solution overview

`planPrune(volumeNames, liveSlugs, config, flags)` — pure:

- `namespace = ${repoSlug}_` (repoSlug + `_`).
- `protected = liveSlugs.map(s => `${repoSlug}_${s}_`)`.
- `orphans = volumeNames.filter(v => v.startsWith(namespace) && !protected.some(p => v.startsWith(p)))`.
- Optional `flags.olderThanDays`: keep only orphans whose `createdAt` (supplied
  by the CLI via `docker volume inspect`) is older than the cutoff.
- Returns `{ orphans, commands: orphans.map(v => `docker volume rm ${v}`) }`.

`specEnvPrune(dir, config, flags)` — the IO seam:

- Enumerate volumes: `docker volume ls --format '{{.Name}}' --filter name=${repoSlug}_`.
- `liveSlugs` = slugs of specs that still have a git worktree
  (`git worktree list --porcelain`, branch → spec slug), cross-checked against
  `specs/in-progress/`. The registry is **not** consulted for liveness.
- `repoSlug` from `repoInfo(dir)` (`env/resolve.js`).
- Call `planPrune`, print a report (`N orphaned volume(s), ~reclaimable`) and the
  `docker volume rm` commands for the skill to run after confirmation. For each
  reaped slug that still holds a registry slot, also free it (`freeSlot` +
  `writeRegistry`). `--dir` supported like the other subcommands; no-op with a
  clear message when `env.config.json` is absent.

Wiring: `/spec-complete` and `/spec-cancel` call `spec-env prune` after the
current spec's `spec-env down`, surface the orphan list, and remove them on
confirmation.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Pure `planPrune` planner + tests | ✅ | [01-plan-prune.md](01-plan-prune.md) |
| 2 | `spec-env prune` CLI subcommand + tests | ✅ | [02-cli-subcommand.md](02-cli-subcommand.md) |
| 3 | Wire into `/spec-complete` & `/spec-cancel` | ✅ | [03-skill-wiring.md](03-skill-wiring.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-26 | Ready | backlog | Reuben Greaves |
| 2026-08-26 | In Progress | in-progress | Reuben Greaves |
| 2026-08-26 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-08-26 — Completed; all phases done, tests green (416/416).
- 2026-08-26 — Phase 3 done. Wired `spec-env prune` into `/spec-complete` (step
  7.4) and `/spec-cancel` (step 7.4), confirm-first + non-fatal; documented in
  `spec-planning.md` (engine list) and a new `env.config.md` "Pruning orphaned
  test-DB volumes" section. Verified the build vendors `prune.js` + the edited
  skills/docs into both dist packages. All three phases complete; 416/416.
- 2026-08-26 — Phase 2 done. `spec-env prune` CLI + dispatch/HELP/usage +
  `--older-than`. Liveness fix: an in-progress spec lives on its worktree branch,
  so liveness scans spec folders in the primary checkout **and every worktree**
  (via `resolveSpec` searchDirs) — a smoke test caught the active spec's own
  volume being misread as an orphan ("0 live specs"). Pure logic extracted to
  `liveSlugsForSpecs` + `reconcileRegistry` (both tested). Suite 416/416; real
  orphan-volume smoke test flagged only the orphan.
- 2026-08-26 — Phase 1 done. `planPrune(volumes, liveSlugs, opts)` — folded the
  planned `config`/`flags` params into one `opts` and take `repoSlug` directly
  (planner stays pure, no config-shape coupling). Volumes accept
  `string | {name, createdAt}`; unknown-age volumes are kept when age-gating.
  10 planner tests + full suite (407) green.
- 2026-08-26 — Spec created. Reframed from "drop DB on complete" (already done
  for the current spec) to "reap orphaned test-DB volumes", after confirming
  test DBs are Docker named volumes namespaced by compose project, with no
  orphan reconciliation anywhere in the engine.
