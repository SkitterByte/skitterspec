# Integrate-to-main on `/spec-complete` + clean teardown

> **Type:** Feature
> **Status:** Complete (2026-07-10)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-09
> **Area:** assets/skills/spec-complete/SKILL.md, assets/skills/spec-env-down/SKILL.md, src/env/teardown.js, src/env/integrate.js (new), src/env/resolve.js, src/env/config.js, src/cli.js, assets/core/env.config.json.example, assets/core/env.config.md, README.md
> **Stack:** worktree

## Problem

Finishing an isolated spec has a hand-driven tail. `/spec-complete` verifies,
archives, and offers teardown — but the branch is still stranded on its worktree.
Landing it on `main` (rebase → fast-forward → re-test) is done by hand every time,
and then two rough edges bite: the teardown guard treats a fully-*merged* branch
as "unpushed" whenever there's no remote (so local-only repos always need
`--force`), and teardown removes the worktree but leaves the merged branch behind.
The last mile of the lifecycle should be one guarded flow, not manual git.

## Decisions

1. **Integrate lives in `/spec-complete`, opt-in and isolation-only.** After the
   archive move, `/spec-complete` optionally integrates the spec's branch into the
   base branch, then offers teardown — one coherent finish flow. Only active when
   `specs/.core/env.config.json` exists and the spec has a worktree; otherwise
   `/spec-complete` behaves exactly as today. Rejected a separate `/spec-land`
   skill — completion already owns "finalise + archive + offer teardown", and
   landing is the missing middle, not a separate ceremony.
2. **Rebase + fast-forward (linear history).** Rebase the branch onto base in the
   worktree, then `merge --ff-only` base to it. On a rebase conflict: `git rebase
   --abort`, report, and hand back to the user — never leave a half-done rebase.
   Rejected merge-commits (non-linear graph) and a per-run rebase/merge prompt
   (extra friction in the finish flow).
3. **Teardown treats "merged into base" as safe, and deletes the merged branch.**
   Relax the unpushed guard to block only when `unpushed && !mergedToBase`, so a
   completed+integrated spec tears down without `--force`. Add a safe
   `git branch -d <branch>` (merged-only — never `-D`) to the teardown plan.
4. **Base branch is resolved, not hardcoded.** Precedence:
   `config.baseBranch ?? origin/HEAD ?? main ?? master`. Shared by both the
   integrate step and the teardown "merged" check. Adds an optional `baseBranch`
   field to `env.config.json`. Rejected hardcoding `main` (breaks `master`/`trunk`
   repos and repos with no remote HEAD).
5. **Never auto-push; require a clean worktree.** Integrate stays local — it does
   not push `main` (the skill may *mention* pushing). It refuses to run on a dirty
   worktree: the completion edits must be committed first, preserving
   `/spec-complete`'s "don't `git commit` unless asked" rule (it offers `/commit`).
6. **Same engine pattern.** Pure planners (`planIntegrate`, extended `planDown`)
   take git facts + config and emit the exact command sequence; the CLI queries
   git for those facts (base resolution, clean/merged/divergence, conflict
   handling); the skills execute the printed commands. No `Date.now()`/live git in
   the planners — keeps them unit-testable, matching `src/env/*`.
7. **`mainRepoPath` = `dirname(abspath(git rev-parse --git-common-dir))`.**
   Verified: from the primary checkout `--git-common-dir` is `.git` (parent = repo
   root); from a linked worktree it is the absolute `<main>/.git` (parent = the
   same root). Robust regardless of where the CLI is invoked — the ff step always
   targets the primary checkout. (Resolved open question.)
8. **Conflict handling: attempt-and-abort, in the skill.** The `/spec-complete`
   skill runs the rebase and, on a non-zero exit, runs `git rebase --abort` and
   hands back — the planner stays pure (emits the command sequence only). A
   side-effect-free `git merge-tree --write-tree` pre-check is a possible later
   enhancement, not needed now. (Resolved open question.)

## Solution overview

**Base resolution (`src/env/resolve.js`).** `resolveBaseBranch(config, gitQuery)`
returns the base branch by the Decision-4 precedence. Consumed by the teardown
guard and the integrate planner.

**Teardown (`src/env/teardown.js`).** `planDown` gains a `mergedToBase` input on
`ctx.worktreeState`; the unpushed guard becomes `unpushed && !mergedToBase`. The
command list gains `git branch -d <branch>` after `git worktree remove`. The CLI's
`worktreeGitState` computes `merged` via `git merge-base --is-ancestor HEAD <base>`.

**Integrate (`src/env/integrate.js`, new).** `planIntegrate(spec, config, ctx)`
resolves base, blocks on a dirty worktree, no-ops when the branch is already merged
/ not ahead, else emits:

```
git -C <worktreePath> rebase <base>
git -C <mainRepoPath> merge --ff-only <branch>
```

The `/spec-complete` skill runs these; on a rebase non-zero exit it runs
`git -C <worktreePath> rebase --abort`, reports the conflict, and stops (teardown
is not offered). On success it re-runs the project's test command against the base
checkout before reporting.

**CLI.** New `skitterspec spec-env integrate <spec>` subcommand — queries git,
prints the plan (or the guard block / no-op). `spec-env down` output additionally
lists the `git branch -d` step.

**`/spec-complete` flow (isolated + config present):** verify green → update spec
→ archive move → **[new] commit gate + integrate to base + re-test** → offer
teardown (now `--force`-free for a merged spec, and it deletes the branch).

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Base resolution + teardown (branch delete, merged-safe guard) | ✅ | [01-teardown-and-base.md](01-teardown-and-base.md) |
| 2 | Integrate planner + CLI + /spec-complete wiring | ✅ | [02-integrate-step.md](02-integrate-step.md) |

## Open questions

- None — both resolved into Decisions 7 (`mainRepoPath`) and 8 (conflict
  handling) during grooming.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-09 | Draft | backlog | Reuben Greaves |
| 2026-07-09 | Ready | backlog | Reuben Greaves |
| 2026-07-09 | In Progress | in-progress | Reuben Greaves |
| 2026-07-10 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-07-10 — Completed; both phases done, tests green (201 pass, 0 fail). No
  deferred items. Note: this spec is self-hosting — its own new `spec-env
  integrate` step / merged-safe teardown are used to land this branch on `main`
  and reclaim the worktree.
- 2026-07-10 — Phase 2 complete (both phases done). Shipped the pure
  `planIntegrate` planner, the `spec-env integrate` CLI subcommand, and the
  `/spec-complete` wiring (new step 6 Integrate → rebase+ff+re-test, opt-in and
  isolation-only; teardown renumbered to step 7 with no-`--force` + branch-delete
  wording). README isolation note added. Deviation worth recording: `spec-env
  integrate` resolves the spec/base against the **primary checkout** (parent of
  `git rev-parse --git-common-dir`), not cwd — the skill runs it from inside the
  worktree, where `resolveSpec` would otherwise mis-expand `{repo}`. 201 tests
  green (+4). Smoke-tested: help, dirty-block, and resolution from both locations.
- 2026-07-10 — Phase 1 complete. Shipped `resolveBaseBranch` (config → origin/HEAD
  → main → master), the optional `baseBranch` env-config field (+ docs/example),
  and the teardown changes: `planDown` now deletes the merged branch (`git branch
  -d`, never `-D`) and blocks only on `unpushed && !merged`, so a landed spec tears
  down without `--force`. `worktreeGitState` computes `merged` via
  `merge-base --is-ancestor` behind a shared `gitReader` helper; `/spec-env-down`
  skill updated. 197 tests green (+10). `baseBranch` merged as `'string'` (blank =
  auto-detect, so blank must not override).
- 2026-07-09 — Groomed to Ready. Resolved both open questions into Decisions 7
  (`mainRepoPath = dirname(abspath(git rev-parse --git-common-dir))`, verified from
  both a worktree and the primary checkout) and 8 (conflict handling is
  attempt-and-abort in the skill; `git merge-tree` pre-check deferred as an
  enhancement). No structural changes.
- 2026-07-09 — Spec created. Grilled to: integrate step folded into
  `/spec-complete` (opt-in, isolation-only); rebase+ff with abort-on-conflict;
  teardown treats merged-into-base as safe and deletes the merged branch; base
  branch resolved (`baseBranch ?? origin/HEAD ?? main ?? master`); never auto-push,
  clean-worktree precondition. Two phases: teardown/base infra, then integrate.
