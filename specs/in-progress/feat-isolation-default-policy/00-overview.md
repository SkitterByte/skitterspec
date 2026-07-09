# Per-spec isolation as the default policy

> **Type:** Feature
> **Status:** In Progress — Phase 1 (started 2026-07-09)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-09
> **Area:** src/env/resolve.js, src/env/provision.js, src/env/registry.js, src/cli.js, src/init.js, assets/skills/spec{,-go,-complete,-cancel,-env,-env-down}/SKILL.md, assets/core/env.config.{json.example,md}, assets/rules/spec-planning.md, assets/claude-md-section.md, README.md

## Problem

The `feat-spec-env-isolation` engine made per-spec isolation possible but
**optional at every step** — the docs say each in-progress spec *can* get a
worktree, and a spec only becomes isolated if someone remembers to run
`/spec-env`. In practice that means specs still collide on one working tree, and
the heavyweight part (a Docker stack) is provisioned wholesale even for specs
that never touch a database. We want the cheap, always-safe isolation (a git
worktree) to be **automatic** for every in-progress spec, and the expensive part
(Docker) to be a **deliberate per-spec escalation** decided when the spec is
written and acted on when work starts.

## Decisions

1. **Worktree is automatic once isolation is adopted; adoption is an opt-in
   prompt at `init`.** `npx skitterspec init` asks whether to enable per-spec
   isolation and, on yes, writes `specs/.core/env.config.json`. From then on
   `/spec-go` provisions a git worktree for **every** in-progress spec
   automatically — no per-spec opt-in. Projects that decline at init (no config)
   are unchanged — no surprise worktrees for consumers. Rejected: default-on for
   all consumers (too invasive for a distributed package); the old per-spec
   manual `/spec-env` opt-in (the friction this spec removes).
2. **Docker is a per-spec escalation** recorded in the spec header as
   `> **Stack:** worktree` (default) or `> **Stack:** worktree + docker`. `/spec`
   sets it (default `worktree`, escalating only when the spec touches the DB /
   stateful services); `/spec-go` reads it and brings up the stack only when it
   says `docker`. The field is greppable and escalatable later. Rejected: a
   global `docker.enabled` meaning "always Docker" (too coarse — that's what
   forced every spec into a stack).
3. **All spec housekeeping happens on the spec's branch; `main` changes only via
   merges.** `/spec-go` forks the worktree branch from `main`, then the
   backlog→in-progress move, header/State-log edits, and the code + evolving spec
   *content* all happen on the branch in the worktree — so the spec's evolution
   travels with the code it describes and lands in the same PR. Pushing the branch
   fires Linear's in-progress automation. `/spec-complete` does the
   in-progress→complete move on the branch, then merges. `main` is never committed
   to directly (protected-main / PR-only friendly; non-Linear devs still see
   everything at merge time). Rejected: doing the moves on `main` (breaks
   protected-main repos — its only edge, Linear-independent visibility, is already
   provided by the merge); pure model A (spec on main / code on branch — splits the
   spec's evolution from the code that motivates it). **Depends on Decision 7.**
4. **Slot + port block are allocated lazily — only for Docker-escalated specs.**
   A `worktree`-only spec takes **no** registry slot, writes **no** `.env`, and
   runs **no** `docker compose`. Slots (and their `PORT_OFFSET`) are handed out
   only when a spec's stack is `docker`, so worktree-only specs never consume the
   port space. Rejected: allocating a slot per worktree (wastes the port block on
   specs that will never publish a port).
5. **`docker.enabled` is repurposed** from "always provision Docker" to a
   project-level **"Docker escalation available"** master switch. Back-compatible:
   an existing `true` means specs *may* escalate to Docker; the default stack is
   still `worktree`. `false` forces every spec worktree-only and hides the
   escalation prompt.
6. **Manual `/spec-env` stays** as the escape hatch and the reusable engine path.
   `/spec-go`'s automatic provisioning delegates to the same `spec-env up`
   engine; `/spec-env` remains for escalating Docker on an existing spec,
   re-attaching, or manual re-provision. Teardown stays an *offer* at
   `/spec-complete` / `/spec-cancel` (the worktree now always exists, so the offer
   always fires).
7. **The cross-spec index files are retired.** `specs/backlog/00-index.md` and
   `specs/complete/00-index.md` are denormalised caches of state that already
   lives in the folder buckets, spec headers, per-spec State logs, git history and
   Linear — and they can't be maintained per-branch (a branch sees only its own
   spec), which makes them merge-conflict hotspots under parallel work (worst: the
   append-only complete log, where concurrent completions both prepend). Removing
   them is what lets Decision 3's branch-based housekeeping be conflict-free.
   **Done** — landed as the standalone prerequisite spec `feat-retire-spec-indexes`
   (complete), which stripped the index files from init (+ a migration to clean up
   existing installs), all eight skills, the rule and README. This spec no longer
   carries that work. Rejected: regenerating a derived index (still overhead for a
   view AI/Linear already provide on demand).

## Solution overview

- **Header field.** `resolveSpec` parses `> **Stack:** …` from `00-overview.md`
  into `spec.stack` (`'worktree'` | `'docker'`) — a legacy spec with no field
  falls back to the project default (Decision 5).
- **Planner.** `planUp` sources its "bring up Docker?" boolean from
  `spec.stack === 'docker'` (gated by the project master switch), not the global
  flag. When Docker isn't wanted it omits the `docker compose` command, the slot,
  the `PORT_OFFSET`, and the `.env` render.
- **Registry.** Slot allocation happens only on the Docker path, so worktree-only
  specs don't appear in `registry.json`.
- **Adoption at init.** `init` gains an isolation prompt (`--isolation` /
  `--no-isolation` flag to drive it non-interactively) that writes
  `env.config.json` from the template when accepted — a one-question opt-in
  instead of a manual file copy.
- **Skills.** `/spec` grills "does this touch the DB/stateful services?" and
  writes the `Stack` field. `/spec-go` auto-runs `spec-env up` after moving a
  spec in-progress (worktree always; Docker iff escalated), prints the worktree
  path + opener, and documents the primary-specs / worktree-code split.
- **Config/docs.** `env.config.md`, the example, the spec-planning rule, the
  CLAUDE.md section and README are updated to describe worktree-default /
  Docker-on-escalation.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Per-spec `Stack` field + planner sources Docker from it | ✅ | [01-stack-field.md](01-stack-field.md) |
| 2 | Lazy slot/port/.env — worktree-only skips them | ⬜ | [02-lazy-docker-allocation.md](02-lazy-docker-allocation.md) |
| 3 | `init` isolation opt-in prompt writes env.config.json | ⬜ | [03-init-opt-in.md](03-init-opt-in.md) |
| 4 | Automatic provisioning wiring + config semantics + docs | ⬜ | [04-default-policy-wiring.md](04-default-policy-wiring.md) |

## Open questions

- None. (Index-retirement sequencing resolved: it landed first as the standalone
  `feat-retire-spec-indexes` spec — now complete. See Decision 7.)

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-09 | Draft | backlog | Reuben Greaves |
| 2026-07-09 | Ready | backlog | Reuben Greaves |
| 2026-07-09 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-07-09 — Spec created. Builds on completed `feat-spec-env-isolation`.
- 2026-07-09 — Corrected Decision 1: worktree adoption is an opt-in prompt at
  `init` (writes `env.config.json`), not a manual file copy; once adopted,
  worktrees are automatic. Added Phase 3 (init opt-in); renumbered wiring to
  Phase 4.
- 2026-07-09 — Replaced pure model A with branch-based housekeeping (Decision 3):
  all folder moves + spec content evolve on the spec's branch, `main` only via
  merges (Linear fires on branch push). Added Decision 7 — retire the cross-spec
  index files (they can't be maintained per-branch); sequencing is an open
  question.
- 2026-07-09 — Groomed to Ready. Decision 7 resolved: index retirement landed as
  the standalone `feat-retire-spec-indexes` spec (complete), so it's out of scope
  here; last open question closed.
- 2026-07-09 — Phase 1 done. Added `readStackField` + `spec.stack` in `resolve.js`
  and gated `planUp`'s docker command on `wantsDocker`. Minor deviation: `planUp`
  defaults an absent `spec.stack` to the master switch (`config.docker.enabled`)
  so legacy callers/tests without the field keep prior behaviour. 118/118 green.
