---
linear_identifier: "SKS-86"
linear_url: "https://linear.app/skitterbyte/issue/SKS-86/spec-start-spec-next-the-hand-off-that-finishes-itself"
---

# /spec-start + /spec-next — the hand-off that finishes itself

> **Type:** Feature
> **Name:** feat-spec-start-next (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 3 (started 2026-09-08)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-08
> **Area:** packages/common/assets/skills (spec-go split into spec-start/spec-next, + every skill naming /spec-go), packages/common/src (cli.js, env/config.js, init.js), packages/linear/assets/seams, packages/common/assets/rules, MIGRATION.md
> **Stack:** worktree

## Problem

`/spec-go` conflates provisioning with building, and every fix for the seam
between them has grown machinery: a hand-off session, an auto-opened Warp tab,
remote-control arming for the tab, teardown that must not strand the tab. The
design review of 2026-09-08 found the simpler invariant underneath: **one
workbench** — the checkout a session sits in — with exactly one spec in flight
on it, entered and left deliberately. Two commands express that; no surface
ever opens another.

## Decisions

1. **Split `/spec-go` into `/spec-start` and `/spec-next`.** `spec-start` puts a
   spec in flight on this checkout; `spec-next` builds the next phase of the
   spec in flight — the command you re-run per phase. Rejected: one skill with
   a flag — the conflation is the bug.
2. **`/spec-go` is removed, not aliased** — MIGRATION.md entry like the 3.0
   retirements; `init` update removes the installed skill; the retired-skill
   guard gains `spec-go`. Major version bump.
3. **`spec-start` refuses unless this checkout is on base with nothing in
   flight.** No auto-swap, no auto-park: the refusal names what is in flight
   and the ways out (`/spec-complete`, `/spec-cancel`, or `/spec-live main` to
   park it), and the operator restores the workbench deliberately. Rejected:
   swapping the in-flight spec out automatically — an uncommitted tree, a
   half-built phase, and a surprise rebase are all decisions, not side effects.
4. **In flight = the branch is in this checkout.** Worktree mode: `spec-start`
   provisions the worktree, then takes the branch live in the primary checkout
   (the existing `live take` engine — rebase, detach the worktree, switch);
   the worktree is a parking spot, not a workplace. Checkout mode: a plain
   `git switch`. Either way the spec move, headers and tracker refresh happen
   here, on the branch, committed normally — the parent-session housekeeping
   dance and the stub shuffle both dissolve.
5. **`spec-next` builds the spec in flight, and only that.** Resolution: the
   live spec of the checkout you are in, or the spec of the worktree you are
   standing in (the manual-parallel path below); on base with nothing in
   flight it refuses — "no spec in flight — `/spec-start <name>`".
6. **Parallelism is manual, and preserved.** Many provisioned worktrees may
   exist; the operator opens a terminal tab in one (their normal habit) and
   runs `/spec-next` there. Nothing ever opens a tab for them — the 2026-09-08
   review judged auto-opened tabs an annoyance to reach parity with a habit
   that already works, and unreachable from a phone besides. One spec per tab
   is the rule; the engine's live receipt guards the primary, and a worktree
   session is its own workbench.
7. **A live-refused spec (stateful stack, migrations) parks instead of
   swapping.** `spec-start` still provisions and does the housekeeping (via
   `git -C <worktree>`), then leaves the branch in its worktree, prints the
   path (running `open.command` when configured), and says to run `/spec-next`
   from a session there. The live engine's refusals stay exactly as they are —
   they protect the shared instance, and the manual-tab path needs no
   weakening of them.
8. **The tab and remote-control machinery is dropped entirely** — no
   `open.tab`, no `tabRemote`, no Warp toml generation, no `; exit` lifecycle.
   One session driving one workbench cures what they treated: the phone
   reaches the only session there is, and nothing strands on a deleted
   directory it wasn't standing in. Re-spec if a genuine
   two-sessions-building-at-once need ever appears.
9. **`feat-spec-diff` stays cancelled** (SKS-82); `--here` disappears with
   `spec-go` — `spec-start` IS here.

## Solution overview

Five passes: extract `/spec-next` (build half, in-flight resolution, refusal);
build `/spec-start` (refuse-unless-clean-base, provision + live-take or
`git switch`, housekeeping on the branch, flow straight into `/spec-next`);
engine glue — compose existing verbs (`spec-env up`, `live take`) rather than
new machinery, sharpening the in-flight refusal wording and giving `spec-next`'s
resolution a `spec-env` query; retire `/spec-go` across every surface naming it
(24 files at spec time — re-grep), including the `spec-go-start` seam rename;
and make `/spec-complete`·`/spec-cancel` safe when run from a manual worktree
session (relocate before teardown — the stranding risk survives exactly there).

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | add | spec-start, spec-next |
| Skill/rule | remove | spec-go (+ MIGRATION.md, retired-files removal, retired guard) |
| Skill/rule | update | every asset naming /spec-go; spec-complete/cancel relocate rule |
| CLI command | update | `spec-env live take` refusal wording; an in-flight query for spec-next |
| Seam | rename | `spec-go-start` → `spec-next-start` (common + linear, one commit) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Extract /spec-next | ✅ | [01-spec-next.md](01-spec-next.md) |
| 2 | Build /spec-start | ✅ | [02-spec-start.md](02-spec-start.md) |
| 3 | Engine glue | ⬜ | [03-engine-glue.md](03-engine-glue.md) |
| 4 | Retire /spec-go | ⬜ | [04-retire-spec-go.md](04-retire-spec-go.md) |
| 5 | Complete from a worktree session | ⬜ | [05-complete-from-worktree.md](05-complete-from-worktree.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-08 | Ready | backlog | Reuben Greaves |
| 2026-09-08 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-08 — Spec created; supersedes feat-spec-diff (cancelled, SKS-82).
  Design rests on verified Warp facts: Tab Configs run `commands` in a
  `directory` and open in the current window; existing tabs cannot be repointed.
- 2026-09-08 — Follow-up grilling: completing from inside the hand-off tab
  would tear down the session's own cwd. Added Decision 7 and Phase 5 —
  relocate before teardown, and the `; exit` chain makes quitting Claude close
  the tab, since Warp exposes no way to close it from outside.
- 2026-09-08 — Remote-control research: enabling RC at launch is scriptable
  (`claude --remote-control`, `CLAUDE_CODE_REMOTE_CONTROL=true`,
  `remoteControlAtStartup`), but no scriptable detection exists — sessions
  appear on the phone only once RC is explicitly activated. Added Decision 8:
  `--remote`/`--no-tab` builds inline; `open.tabRemote` arms the tab. Filing
  feedback for a detection signal is a task, and auto-detection replaces the
  flag if one ever ships.
- 2026-09-08 — **Design pivot before any phase began: the tab hand-off is out;
  the one-workbench model is in.** spec-start refuses unless the checkout is on
  base (no auto-swap, no auto-park); in flight means the branch is in this
  checkout (live-take in worktree mode, git switch in checkout mode);
  parallelism is the operator's own tabs into parked worktrees. Decisions 3, 7
  and 8 of the previous revision (Warp tab config, `; exit` lifecycle,
  remote-control arming) are dropped whole — one session driving one workbench
  cures what they treated. Warp/RC research stands recorded above for the
  archive.
- 2026-09-08 — Phase 1: the skill-count guards added this morning fired on the
  tenth skill — `spec-init`'s enumeration and two counts on the docs site were
  updated to ten/14. The count moves again in Phase 2 (spec-start) and Phase 4
  (spec-go removed); each phase ends green, so each updates it in turn. That
  churn is the guard working, not friction to route around.
- 2026-09-08 — Phase 1: `spec-next`'s intro deliberately does not reference
  `/spec-go`, so Phase 4's retirement needs no edit here — the only remaining
  reference is the `spec-go-start` seam, which Phase 4 renames as planned.
- 2026-09-08 — Phase 2: `/spec-start` carries **no** tracker seam, and the
  skill says why. My first draft copied `spec-tracker-intake`, `-link` and the
  project picker from `/spec`, which was wrong: those belong to skills that
  CREATE a spec and mint its issue. `spec-start` creates nothing, and the one
  state change it makes (spec → in-progress) is mirrored by the refresh
  `/spec-next` runs immediately after. Two pushes one commit apart would have
  sent the same thing twice.
- 2026-09-08 — Phase 2: `/spec-live` is user-only, so worktree mode's
  bring-the-branch-here step prints it and ends the turn rather than pretending
  the skill can run it. That is one hand-off remaining in worktree mode — but
  for a *branch swap the operator must authorise*, not for a terminal window,
  and it disappears entirely in checkout mode.
