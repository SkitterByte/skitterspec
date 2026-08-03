# Live overlay — test a spec on the running instance by branch-switch

> **Type:** Feature
> **Status:** In Progress — Phase 1 (started 2026-08-03)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-03
> **Area:** packages/common/src/env/ (new `live.js`, `resolve.js`, `integrate`),
> packages/common/src/cli.js, packages/common/assets/skills/ (`spec-live`,
> `spec-complete`, `spec-connect`, `spec-go`), packages/common/assets/rules/spec-planning.md,
> dist copies (packages/skitterspec, packages/skitterspec-linear)
> **Stack:** worktree

## Problem

`/spec-connect` multiplexes the canonical dev URL **in space**: every spec you
want to test runs its own full dev stack (and maybe Docker) on its own port
block, and a reverse proxy (`env/proxy.js`) picks which one owns ports 3000/8080.
That's process-heavy — you pay a whole `pnpm dev` per spec, and connect refuses
unless you first stop main on those ports. For the common case — a code-only spec
on a hot-reload dev server — you already have one instance running; spinning a
second is pure waste.

Live overlay multiplexes the *same* running instance **in time**: keep the one
stack that's up and swap which spec's branch is checked out underneath it, so HMR
runs the feature directly. One process, tested at the normal URL.

## Decisions

1. **Time-multiplex by branch-switch, not a second stack.** The primary checkout
   is normally on the base branch; to go live we check the spec's branch out
   **in the primary checkout** so the running dev server (rooted there) hot-reloads
   the feature. *Rejected:* overlaying a `git diff` onto main — that needs a
   dirty working tree plus a "harvest fixes back" step; branch-switch makes the
   working tree *be* the branch, so fixes commit straight onto it.
2. **The checked-out branch of the primary checkout IS the lock.** On the base
   branch → free; on a feature branch → that spec is in control and everyone else
   is locked out. Git's one-branch-one-worktree rule enforces exclusivity and it's
   crash-safe (state = what's checked out). *Rejected:* a TTL lease file as the
   authority. A `.spec-env/live.json` **receipt** (`spec, branch, holder,
   heldSince, baseMainCommit`) is kept only as advisory metadata for `status` and
   `abort`, never as the lock.
3. **Reusable guard.** `assertPrimaryOnMain(dir)` — any `spec-env` op can assert
   the primary checkout is on the base branch; not-on-base means a feature has the
   wheel. This is the coordination primitive the rest builds on.
4. **Contention = fail-fast (v1).** `take` refuses when the primary checkout isn't
   on the base branch, naming the holder from the receipt. No queue.
5. **`take` sequence:** rebase base into the branch (front-loads the `integrate`
   rebase) → **detach** the spec's worktree to free the branch
   (`git -C <wt> switch --detach`) → checkout the branch in the primary checkout →
   write receipt → verify health. *Rejected:* remove+recreate the worktree — detach
   is lighter and reversible.
6. **v1 is code-only; refuse stateful.** `take` refuses `Stack: worktree + docker`
   specs and (when config declares a migrations glob) any branch whose diff touches
   migrations, pointing them at `/spec-connect`. No shared-DB rollback in v1;
   migrations become a later phase with `migrate`/`rollback` hooks.
7. **Verify-only dev process.** `take` checks a server is healthy on the canonical
   ports and switches under it — it never starts a cold server (that stays
   `pnpm dev` / `spec-env dev up`). If the diff changes the lockfile/manifest, it
   **warns** "restart your dev server"; no auto-restart in v1.
8. **`release` vs `abort`.** `release` ends an unfinished session — checkout base in
   the primary checkout, re-attach the branch to its worktree, clear the receipt.
   `abort` is the crash-recovery form — force the primary checkout back to
   `base@baseMainCommit` from the receipt, re-isolate, clear.
9. **Completion folds into `/spec-complete`.** No separate merge verb — because
   `take` already rebased, `integrate` is a fast-forward; make `integrate` /
   `/spec-complete` **live-aware** (commit outstanding, fast-forward base, clear
   receipt, remove worktree).
10. **Naming.** `skitterspec spec-env live <take|release|status|abort>`; skill
    `/spec-live <spec>` takes control, `/spec-live main` releases (mirrors
    `/spec-connect main`).
11. **Engine + distribution.** Follow the existing pure-planner + CLI-seam pattern;
    land changes in `packages/common` (canonical) and propagate to the dist packages
    via `pnpm build` (`scripts/build-dist.js`). Overlay **coexists** with
    spec-connect — it's the light default for code-only specs; connect and
    `worktree + docker` stay for stateful or genuinely-parallel testing.

## Solution overview

A new `spec-env live` verb group backed by a pure planner `env/live.js` and the
`assertPrimaryOnMain` guard in `env/resolve.js`, wired through `cli.js` in the
established planner→CLI-seam style. Lifecycle:

```
live take <spec>     guard: primary on base + clean + spec has branch/worktree
                     + not stateful + dev server healthy on canonical ports
                   → rebase base into branch (in worktree)
                   → git -C <worktree> switch --detach     (free the branch)
                   → git -C <primary>  checkout <branch>   (HMR reloads)
                   → write .spec-env/live.json receipt; warn if restart needed
   … test & fix in the primary checkout; commits land on the feature branch …
live release <spec>  checkout base in primary → re-attach branch to worktree
                   → clear receipt                         (unfinished session)
live abort           force primary to base@baseMainCommit from receipt
                   → re-isolate → clear receipt            (crash recovery)
live status          print primary's current branch + receipt
/spec-complete       live-aware: commit → fast-forward base → clear receipt
                   → remove worktree                       (finish + merge)
```

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Coordination primitive: guard + receipt + `live status` | ✅ | [01-coordination-primitive.md](01-coordination-primitive.md) |
| 2 | `live take` + `/spec-live` (take/status) | ✅ | [02-live-take.md](02-live-take.md) |
| 3 | `live release` + `live abort` + `/spec-live main` | ✅ | [03-live-release-abort.md](03-live-release-abort.md) |
| 4 | Live-aware completion (`integrate` / `/spec-complete`) | ⬜ | [04-complete-integration.md](04-complete-integration.md) |
| 5 | Docs, cross-skill wiring, dist build, end-to-end verify | ⬜ | [05-docs-wiring-verify.md](05-docs-wiring-verify.md) |

## Open questions

- [ ] None. (Stateful/Docker specs and migration handling are explicitly deferred
  out of v1 — decision 6, a future phase — not open.)

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-03 | Ready | backlog | Reuben Greaves |
| 2026-08-03 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-03 — Spec created. Chose branch-switch over diff-overlay (branch is the
  lock); v1 code-only (refuse stateful); verify-only dev process; completion folds
  into `/spec-complete`; named `spec-env live` / `/spec-live`.
- 2026-08-03 — Phase 1 done. `env/live.js` (receipt) + `assertPrimaryOnMain` guard
  in `env/resolve.js` + `spec-env live status`. **Deviation:** kept the receipt
  IO (`read/write/clear`) in `env/live.js` as a thin seam, mirroring
  `env/registry.js`, rather than in `cli.js` as the phase note suggested — the
  registry pattern was the stated north star and this matches it. Receipt path
  derives from the configured registry dir (`.spec-env/live.json`). 345 tests pass.
- 2026-08-03 — Phase 2 done. `planTake` + `spec-env live take` + `/spec-live`
  skill. Added a `live.migrations` config field (glob list) and a dependency-free
  `globToRegExp`/`migrationsHit` matcher for the stateful refusal. Verify-only:
  probes declared `frontPort`s (`serverUp` = true/false/**null** when none are
  configured → warn-and-proceed). `take` executes the switch in the CLI (rebase →
  detach → checkout) and writes the receipt only after checkout succeeds; rebase
  conflict aborts and bails untouched. 358 tests pass.
- 2026-08-03 — Phase 3 done. `planRelease`/`planAbort` + `spec-env live
  release|abort` + `/spec-live main`. **Course-correction:** dropped the planned
  `reset --hard baseMainCommit` from abort — in the branch-switch model `take`
  never moves the base ref, so recovery is just `checkout base` + re-isolate;
  resetting base to the recorded commit would discard legitimate advances of base.
  `baseMainCommit` stays an informational record. Both refuse on a dirty primary
  checkout (never discard fixes). 371 tests pass.
