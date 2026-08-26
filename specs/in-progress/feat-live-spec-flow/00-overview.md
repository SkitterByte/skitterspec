# Live-overlay → continue → complete flow robustness

> **Type:** Feature
> **Status:** In Progress — Phase 1 (started 2026-08-26)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-26
> **Area:** packages/common/src/cli.js, packages/common/src/env/integrate.js, packages/common/src/env/provision.js, packages/common/src/env/resolve.js, packages/common/assets/skills/spec-go/SKILL.md, packages/common/assets/skills/spec-complete/SKILL.md
> **Stack:** worktree

## Problem

Taking a spec live (`/spec-live`) detaches its worktree (`git switch --detach`)
and hands the branch to the **primary checkout** — authority for "who's live" is
just which branch the primary checkout is on (`assertPrimaryOnMain`,
`resolve.js:205`). The design intends "commit while live, `/spec-complete` lands
them", but the middle of the flow doesn't honour that contract:

- **`/spec-go` is not live-aware.** It only checks "does a worktree exist?" — the
  detached worktree *does* exist, so it skips provisioning and directs work "into
  the worktree" (`spec-go/SKILL.md:55`). That worktree is on a **detached HEAD**,
  so commits there never advance the branch ref and are silently stranded.
- **`spec-env integrate` (run by `/spec-complete`) has silent no-op paths.** When
  commits are stranded, or the worktree is gone, it prints "already landed —
  nothing to integrate" / "has no worktree" (`cli.js:582–610`) and finalizes the
  spec **having landed nothing** — after it already ran `git checkout base` in the
  primary, ending the live session. This is the "spec-complete didn't tidy up /
  got confused it was on main" symptom, and it risks silent work loss.

## Decisions

1. **`/spec-go` becomes live-aware — work in the primary checkout, stay live.**
   When the spec's branch is checked out in the primary checkout (live), spec-go
   **skips worktree provisioning** and implements the phase directly on the branch
   in the primary checkout. Commits advance the branch; `integrate` already
   handles "commits on the branch in primary". Rejected: auto-releasing back to a
   worktree (defeats the point of live overlay — hot-reload on the running
   server) and refusing outright (needless manual `/spec-live main` round-trip).
2. **`integrate` detects work-loss risk and aborts loudly — never finalizes a
   spec having landed nothing.** Before the destructive `git checkout base` in the
   primary, verify the branch actually carries the work. If the worktree is
   missing, or is detached with commits ahead of the branch ref, **abort** with a
   diagnostic (path, sha, recovery hint) instead of silently no-op'ing. Only
   finalize once the branch is confirmed ahead and fast-forwards. Rejected:
   auto-recovering stranded detached-HEAD commits (too much magic; recovery is
   safer as an explicit, user-driven step surfaced by the diagnostic).
3. **`spec-env up` is live-safe.** When the spec is live, `up` no-ops with a clear
   "spec is live — work in the primary checkout (or `/spec-live main` first)"
   message rather than emitting a `git worktree add` that fails confusingly. The
   engine stays safe even though a live-aware spec-go won't call it while live.

## Solution overview

Three coordinated changes, engine-first so the safety net lands before the UX fix:

- **Engine (`integrate`):** reorder `specEnvIntegrate`'s live-aware block so
  detection precedes the primary `checkout base`. Add a guard: worktree missing,
  or detached with commits ahead of `<branch>`? → abort with diagnostic. Replace
  the silent "already landed / no worktree" returns in the live path with the
  abort; keep a genuine no-op only when the branch is truly at base with nothing
  stranded.
- **Engine (`up`):** `planUp`/`specEnvUp` consult `assertPrimaryOnMain`; when the
  spec's branch holds the primary checkout, print the live message and no-op.
- **Skills:** spec-go SKILL.md gains a live check before provisioning (skip →
  work in primary), distinguished from the existing stale/normal-worktree case;
  spec-complete SKILL.md documents the new abort-on-stranded-commits behaviour and
  recovery. Keep the `/.claude/skills` mirror in sync with the assets.

Detection of "live" reuses `assertPrimaryOnMain` (`resolve.js:205`); spec-go
consults it via a `spec-env` signal (extend `spec-env live status <name>` / `spec-env
status` to report "branch checked out in primary checkout").

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env integrate` — abort on stranded/missing-worktree before finalizing; drop silent no-op landing (`specEnvIntegrate`, `planIntegrate`) |
| CLI command | update | `spec-env up` — no-op with message when spec is live (`specEnvUp`, `planUp`) |
| CLI command | update | `spec-env live status` / `spec-env status` — expose "branch in primary checkout" live signal for spec-go |
| Business rule | update | spec-go: skip worktree provisioning when live; work in primary checkout on the branch |
| Skill/rule | update | `spec-go/SKILL.md` — live-aware step 2 |
| Skill/rule | update | `spec-complete/SKILL.md` — document integrate's abort-on-stranded behaviour |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine safety net: `integrate` abort + `up` live-guard | ✅ | [01-engine-safety-net.md](01-engine-safety-net.md) |
| 2 | Live-aware `/spec-go` + skill docs | ⬜ | [02-spec-go-live-aware.md](02-spec-go-live-aware.md) |

## Open questions

- [ ] None — decisions resolved during grilling.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-26 | Ready | backlog | Reuben Greaves |
| 2026-08-26 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-26 — Spec created. Root cause traced: `/spec-go` not live-aware +
  silent no-op paths in `spec-env integrate`. Decisions: spec-go works in primary
  while live; integrate aborts loudly on work-loss risk; `up` is live-safe.
- 2026-08-26 — Phase 1 done. Added the integrate work-loss guard (aborts on
  stranded detached-HEAD commits or a missing worktree, before the destructive
  `checkout base`) and the `spec-env up` live-safe guard. Guard kept in the CLI
  (`specEnvIntegrate`) — needs git IO — so `planIntegrate` stays a pure planner,
  unchanged. Verified via real-git CLI integration tests; full suite 423 pass.
