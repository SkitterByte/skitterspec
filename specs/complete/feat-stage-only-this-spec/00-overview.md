---
linear_identifier: "SKS-210"
linear_url: "https://linear.app/skitterbyte/issue/SKS-210/stage-only-this-specs-paths-and-stop-refusing-over-other-specs"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Stage only this spec's paths, and stop refusing over other specs'

> **Type:** Feature
> **Name:** feat-stage-only-this-spec (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-13)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-13
> **Area:** packages/common/src/env/classify.js, packages/common/src/env/provision.js, packages/common/src/cli.js, packages/common/assets/skills/{spec-complete,spec-cancel,spec-start}/SKILL.md, packages/common/assets/rules/spec-reports.md, packages/linear/assets/seams/spec-tracker-sync.md
> **Stack:** worktree

## Problem

Several `/spec` sessions run against this repo at once, and the lifecycle skills
are not written for that. Two failures follow from it.

**Commits sweep up another session's work.** `/spec-complete` and `/spec-cancel`
instruct `git add specs/ && git commit -m "…"` — staging a *directory*. On
2026-09-13 that put one session's in-progress `bug-review-server-unreachable`
spec into another session's commit, trailered with the wrong ticket. Naming the
paths is necessary but not sufficient: two sessions in the primary checkout
share one `.git/index`, so a bare `git commit` takes whatever the other session
has already staged, however carefully this one staged its own.

**`/spec-start` then refuses over dirt it cannot be harmed by.** `spec-env up`
classifies the uncommitted tree and refuses when any path is not the target
spec's. In `worktree` mode that refusal has no mechanism behind it —
`git worktree add` carries nothing and forks from a commit regardless — so the
commonest concurrent case (author spec B while spec A is uncommitted, then start
B) is blocked for no gain.

The two are one problem: the repo already computes "the paths belonging to this
spec" and nothing outside `spec-env up` can reach it.

## Decisions

1. **Expose the owned set as `skitterspec spec-env stage [<spec>] [--json]`.**
   `classifyDirtyTree` already answers this — the spec's folder across *all*
   buckets (so a tree mid-`git mv` is handled) plus `spec.companionPaths`, which
   in this repo resolves the Linear snapshot. It has one caller and no CLI
   surface. A dedicated verb, not a fold into `spec-env status`: the skills need
   a machine-readable path list, and `status` is a wide human report.
2. **The verb prints paths, not commands.** Rejected emitting a ready-made
   `git add … && git commit …` like `up`/`integrate` do, because each skill's
   message differs and a ticketing provider appends a `Refs:` trailer — coupling
   the verb to that makes it own something it cannot know.
3. **Every spec commit is pathspec-limited:**
   `git add -- <owned> && git commit -m "…" -- <owned>`. The `add` is what makes
   an untracked new spec folder known to the index; the `-- <paths>` on the
   *commit* is what makes the other session's staged entries stay staged rather
   than ride along. Verified: a `git commit -- mine/f.md` with `other/f.md`
   already in the index commits one file and leaves the other staged, untouched.
4. **In `worktree` mode, foreign dirt never blocks.** Report it, commit only the
   owned set, provision. Rejected the narrower "ignore other specs' folders but
   still refuse a dirty `packages/`" — nothing is carried either way, so that
   line fixes half the false positives and buys no safety. Rejected a
   confirm-prompt: a round trip on every start is the cost this removes.
5. **`checkout` mode is unchanged.** `git switch -c` genuinely carries
   uncommitted work onto the new branch, so the refusal there is still earning
   its keep. This is the asymmetry `provision.js` already documents for the
   unreadable-git case, extended to the case where git *was* readable.
6. **Proceeding with foreign dirt is `✅`, with an `Untouched` row** — not `⚠️`.
   Nothing went wrong; the dirt was never the run's business. Reserving `⚠️` for
   things needing attention is what keeps it meaning anything.
7. **Ordering is load-bearing.** Phase 2 (pathspec commits) must land before
   phase 3 (loosening the gate): the loosened gate is only safe once no commit
   this workflow issues can reach a path it does not own.
8. **Scope is skitterspec's own lifecycle skills.** `/commit` ships from
   `@skitterbyte/skittership` — a different product — so it is a follow-up to
   raise there, not work here. Rejected shipping a rule asset about concurrent
   staging: the fix belongs in the commands, not in prose asking humans to
   remember.

## Solution overview

`classifyDirtyTree` stays exactly as it is — it is already correct, and this
spec is about who can call it and what they do with the answer.

- **A verb.** `spec-env stage [<spec>] [--json]` resolves the spec the same way
  every other verb does (bare = the worktree you are standing in, else the sole
  provisioned spec), reads `git status --porcelain`, and prints the split:

  ```
  spec-env stage: feat-foo — 3 owned, 2 foreign

    owned (this spec's — safe to commit):
      specs/in-progress/feat-foo/00-overview.md
      specs/backlog/feat-foo
      specs/.core/linear-base/SKS-88.base.json

    foreign (someone else's — left alone):
      specs/backlog/feat-bar/00-overview.md
      packages/common/src/cli.js
  ```

  `--json` emits `{"spec":"feat-foo","owned":[…],"foreign":[…]}`.

- **Pathspec commits.** The staging blocks in `spec-complete`, `spec-cancel` and
  the `spec-tracker-sync` seam stop saying `git add specs/` and start asking the
  verb for the paths, then committing with them as a pathspec. The commands
  `planSpecCommit` emits gain the same `--` limiter.

- **A gate that matches the mechanism.** `planSpecCommit` keeps refusing foreign
  dirt when `carriesChanges` is set (checkout mode) and stops refusing otherwise,
  returning the foreign paths so the planner and the CLI can report them.
  `/spec-start` reports them in an `Untouched` row.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env stage [<spec>] [--json]` |
| CLI command | update | `spec-env up` usage line + worktree-mode output gains `untouched` |
| Domain object | update | `planSpecCommit` → returns `foreign`; blocks only when `carriesChanges` |
| Domain object | update | `planUp` → surfaces `foreign` instead of blocking on it |
| Skill/rule | update | `spec-complete`, `spec-cancel`, `spec-start` staging + Fields |
| Skill/rule | update | `spec-reports.md` field vocabulary gains `Untouched` |
| Skill/rule | update | `spec-tracker-sync` seam (Linear) staging rationale |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Expose the owned set as `spec-env stage` | ✅ | [01-stage-verb.md](01-stage-verb.md) |
| 2 | Pathspec-limit every spec commit | ✅ | [02-pathspec-commits.md](02-pathspec-commits.md) |
| 3 | Stop refusing foreign dirt in worktree mode | ✅ | [03-loosen-the-gate.md](03-loosen-the-gate.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-13 | Ready | backlog | Reuben Greaves |
| 2026-09-13 | In Progress | in-progress | Reuben Greaves |
| 2026-09-13 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-13 — Spec created.
- 2026-09-13 — Follow-up recorded: `/commit` in `@skitterbyte/skittership` has
  the same directory-staging instruction and is out of this repo's reach; raise
  it there.
- 2026-09-13 — Phase 1: read the tree with the existing `dirtyPaths()` helper
  rather than `git status --porcelain` as the phase file said. Porcelain was
  tried and rejected in this codebase for two reasons already recorded above it:
  the shared git reader trims its output, so a fixed-offset parse eats the first
  path's leading character, and porcelain collapses untracked files into their
  topmost directory — reporting a brand-new spec as `specs/backlog/`, an
  ancestor belonging to no single spec.
- 2026-09-13 — Phase 1: `--json` gained a `tree` field, and `owned`/`foreign` are
  `null` (never `[]`) when git cannot be read. An empty owned set is something a
  caller stages happily; a null is something it trips over.
- 2026-09-13 — Phase 1: the verb reads **the tree the caller is standing in**,
  not the primary checkout. Every other `spec-env` subcommand re-anchors on the
  primary so worktree paths resolve identically; this one must not, because
  `/spec-complete` and `/spec-cancel` run inside the worktree and are asking
  about that tree. The tree read is printed rather than assumed.
- 2026-09-13 — Phase 1: `scripts/docs-claims.test.js` requires every dispatched
  verb to appear in `docs/index.html`, which the phase file had not anticipated.
  Documented there too.
- 2026-09-13 — Phase 2: the "state why once" task resolved to the full account
  living once in `spec-planning.md`, with a short pointer in each skill, rather
  than the same paragraph twice.
- 2026-09-13 — Phase 2: the assets guard reads **fenced commands only**. Both
  skills now say "Never `git add specs/`" in prose, and a test banning the string
  outright would fail on the sentence that prevents the regression — the version
  of the check that gets deleted rather than fixed.
- 2026-09-13 — Phase 2: `assets.test.js` located the commit step by the literal
  `git add specs/ && git commit` when asserting the tracker seam sits between the
  move and the commit. Re-anchored on the commit's subject line, which is the
  half that does not change when staging does.
- 2026-09-13 — Phase 3: the planner surfaces the foreign paths as `untouched`,
  and `specCommitLines` stops claiming "all of it is <spec>'s" when some of the
  tree is not — that sentence was a claim about the whole tree and would have
  become false in exactly the case this phase introduces.
- 2026-09-13 — Phase 3: three existing assets tests asserted the old gate prose.
  Two failed only on a cosmetic rename of the heading sentence, which was
  reverted rather than churning them; the third asserted the uniform refusal and
  was rewritten to the new invariant — reports in worktree mode, refuses in
  checkout — with the reason for the asymmetry asserted alongside, so prose that
  drops either half fails.
- 2026-09-13 — Phase 3: verified end-to-end in a scratch repo — with a second
  spec's file already staged in the shared index, the planned commit took only
  the target spec's path and left the other staged and uncommitted.
- 2026-09-13 — Completed; all three phases done, tests green (2117).
