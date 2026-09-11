---
linear_identifier: "SKS-148"
linear_url: "https://linear.app/skitterbyte/issue/SKS-148/start-a-spec-and-it-starts"
---

# Start a spec and it starts

> **Type:** Feature
> **Name:** feat-spec-start-kickoff (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-11
> **Area:** packages/common/assets/skills/spec-start/SKILL.md, packages/common/assets/skills/spec-next/SKILL.md, packages/common/src/cli.js, packages/common/src/env/resolve.js, packages/linear/assets/seams, packages/common/assets/rules/spec-planning.md, packages/common/README.md, packages/common/test
> **Stack:** worktree

## Problem

`/spec-start` finishes two different jobs depending on the mode, and neither
half is finished for the right reason.

**In `checkout` mode it carries straight on into `/spec-next`.** In `worktree`
mode it stops and tells you to run `/spec-next` from a session in the worktree.
That asymmetry was covered by machinery — first `/spec-live take` (removed by
`feat-spec-start-seamless`), then `EnterWorktree` (removed by
`feat-phase-review`, commit `33c6479`, because it breaks on a phone). Both
removals were right, and both left the gap standing: `mode` is supposed to decide
*where* work happens, not *what* the commands do.

**And the tracker is told nothing until `/spec-next` runs.** `/spec-start`
stamps `Developer`, moves the spec to `in-progress/` and records the assignee in
the repo — then explicitly does not push, on the reasoning that *"a push here
would send the same thing twice, one commit apart"*. That is only true in
`checkout` mode, where `/spec-next` follows immediately. In `worktree` mode the
refresh can be hours away or never come, and until it does Linear shows the old
workflow state with no assignee while the repo reads In Progress with a
Developer. `/spec-start` is the one lifecycle skill that changes state without
mirroring it.

## Decisions

1. **`/spec-start` pushes what it changed**, right after its own commit —
   the exception becomes the rule every other lifecycle skill already follows.
   This is not the duplicate the old rationale feared: this push carries the
   issue state and the assignee, while `/spec-next`'s refresh later carries
   phase 1 starting. They are different payloads one commit apart.
   *Rejected:* pushing only on the hand-off path — conditional logic that still
   leaves the half-state when a continued phase build fails or is interrupted.
2. **In `worktree` mode `/spec-start` offers phase 1; it does not assume it.**
   A "no" leaves exactly today's outcome — provisioned worktree, printed path.
   The offer keeps a consent point for the remote build below, and leaves room
   to choose a fresh session when the phase is large enough that context budget
   matters. *Rejected:* auto-continuing to match `checkout` mode (one yes would
   authorise both a reversible provision and an irreversible build); a
   `--build` flag (a third thing to remember, and the default still has to be
   chosen).
3. **The continuation is a remote build — the session does not move.** Every
   write uses an absolute path under the worktree; every command is prefixed
   `cd "<worktreePath>" &&`. This is the pattern `/spec-start` already uses for
   bootstrap and housekeeping, and the one `feat-phase-review` decision 5
   established for reading a worktree from wherever you are.
   *Rejected:* restoring a session move — `EnterWorktree` was stripped for a
   reason that has not changed.
4. **`/spec-next` gains an explicit `--worktree <path>`, and its refusal is
   otherwise untouched.** The refusal exists against *guessing* which spec to
   build, not against being told. A named path cannot be guessed, cannot be
   reached by typing a bare `/spec-next`, and is typable by a human who wants
   it. *Rejected:* duplicating the phase-build body into `/spec-start` — a
   second copy is a copy that drifts.
5. **The guard is detective and engine-side, not prose.** The primary checkout
   was clean at `/spec-start`'s gate, so uncommitted work appearing in it during
   a remote build is leaked writes — a positive signal established at a known
   point rather than an absence, per `.claude/rules/negative-checks.md` rule 1.
   *Rejected:* a `PreToolUse` hook (harness config, so it cannot ship with the
   package and every adopter would wire it themselves); prose instructions with
   no check (the exact failure mode `negative-checks.md` exists to fix).
6. **The assertion compares against a baseline, not against "clean".** The
   continuation records the primary checkout's dirty paths before the build
   starts; only paths that appear *after* that accuse. Someone editing something
   unrelated in another window is a healthy-but-unusual input, and a bare
   "must be clean" check would accuse them. A missing baseline means the check
   cannot tell, so it stays silent — rule 4, bias the unknown toward inaction.
7. **The check runs before the phase commit**, so leaked work is caught while it
   is still only leaked, never committed to the wrong branch.
8. **Scope is `/spec-start` and `/spec-next`.** `/spec-bug` and `/spec-hotfix`
   share this machinery and have the same gap, but they are test-first and begin
   work in their own flow; folding them in triples the surface. Noted as a
   follow-up.

## Solution overview

`/spec-start`, worktree mode, after provisioning and housekeeping:

1. Commit the spec move on the branch (unchanged), then **push** — the state
   change it made is mirrored by the skill that made it.
2. Offer phase 1:

   ```
   worktree ready: ../skitterspec-wt/feat-x
   Build phase 1 now from here, or hand off to a session in the worktree?
   ```

3. On yes — record the primary checkout's baseline, then run `/spec-next` with
   the worktree named explicitly:

   ```
   skitterspec spec-env resolve <spec> --record-primary
   /spec-next --worktree ../skitterspec-wt/feat-x
   ```

4. On no — today's message verbatim. Nothing else changes.

`/spec-next` with `--worktree` builds against that path: absolute writes,
`cd`-prefixed commands, and before its phase commit:

```
skitterspec spec-env resolve <spec> --assert-primary-clean
```

which exits non-zero and names the paths when work has landed in the wrong tree.
`checkout` mode is untouched throughout — it already carries straight on, and it
has no second tree to leak into.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env resolve` gains `--record-primary`, `--assert-primary-clean` |
| State file | add | `.spec-env/building.json` (gitignored baseline) |
| Skill | update | `spec-start` — push after commit; offer phase 1 in worktree mode |
| Skill | update | `spec-next` — `--worktree <path>`, remote build, pre-commit assertion |
| Seam | update | linear `spec-start` push seam |
| Rule/doc | update | `spec-planning.md`, `packages/common/README.md` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `/spec-start` pushes the state change it makes | ⬜ | [01-spec-start-pushes.md](01-spec-start-pushes.md) |
| 2 | Engine: primary-checkout baseline + assertion | ⬜ | [02-primary-checkout-guard.md](02-primary-checkout-guard.md) |
| 3 | `/spec-next` accepts an explicit worktree root | ⬜ | [03-spec-next-worktree-flag.md](03-spec-next-worktree-flag.md) |
| 4 | `/spec-start` offers to continue into phase 1 | ⬜ | [04-spec-start-offers-phase-one.md](04-spec-start-offers-phase-one.md) |
| 5 | Docs, compose and shipped-surface guards | ⬜ | [05-docs-and-surfaces.md](05-docs-and-surfaces.md) |

## Open questions

- [ ] `/spec-bug` and `/spec-hotfix` carry the same push gap and the same
      worktree hand-off (all three were touched by `33c6479`). Follow-up spec
      once this shape has been used in anger.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-11 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-11 — Spec created.
