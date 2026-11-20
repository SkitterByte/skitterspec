---
github_identifier: "#275"
github_url: "https://github.com/SkitterByte/skitterspec/issues/275"
---

# Re-open a completed spec from /spec-resume

> **Type:** Feature
> **Name:** feat-resume-reopen (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/275
> **Author:** Reuben Greaves
> **Raised:** 2026-11-20
> **Area:** packages/common/src/env/resume.js, packages/common/src/cli.js (spec-env resume), packages/common/assets/skills/spec-resume, packages/common/assets/rules/spec-planning.md, docs/reference.html
> **Stack:** worktree
> **Docs:** reference

## Summary

When `/spec-resume` is pointed at a completed spec, it warns and offers to
re-open it. You don't get a dead-end refusal any more. Re-opening forks a
fresh branch and worktree from the base branch as it is now, moves the spec
back to in-progress and sets its ticket back to In Progress. You can then add
phases and carry on.

## Problem

`/spec-complete` is sometimes used to get a phase's DB changes onto main when
`/spec-to-main` was the right tool, and then more phases turn out to be
needed. `/spec-resume` on that spec gives a plain refusal (`is in complete —
there is nothing left to resume`). The only routes back are hand-editing
buckets and branches, or starting a new spec for what is really the same work.
The completed spec's branch was deleted at teardown, so nothing exists to
re-attach to. The only "current state" is the base branch, which already holds
the landed work.

## Acceptance criteria

- `/spec-resume feat-x` on a spec in `complete/` relays the refusal, then
  offers **Re-open feat-x** or Cancel. Cancel changes nothing.
- On Re-open, the session ends in a new worktree for `feat-x`, on a branch
  forked from the current base. The spec sits in `specs/in-progress/feat-x/`,
  its re-open is committed (`docs(spec): reopen feat-x`), and its ticket is
  In Progress again.
- The spec's Changelog carries a dated re-open line with the reason. Without
  tracker `pull`, its State log also carries an In Progress row.
- A message given with the command (`/spec-resume feat-x add a phase for the
  backfill`) becomes a new phase file after the re-open, as it does for an
  in-flight spec.
- Specs in `cancelled/` and `backlog/`, completed hotfixes and completed
  epics still refuse with no offer.

## Decisions

1. **Amends feat-spec-resume Decision 1 for `complete` only.** That decision
   refused every bucket but in-progress, because "finished specs have no work
   left". This spec covers the case where they do. Cancelled specs still
   refuse: their code never landed, so "from the current state" would mean
   rebuilding from the text alone, and that is a new spec. Hotfixes refuse
   because they land by tag and cherry-pick, so a re-opened one has no landing
   path. Epics refuse because they hold no phases.
2. **The engine declares the offer; the skill relays it.** The `complete`
   refusal carries
   `offer: { kind: 'satisfy', label: 'Re-open <spec>', command: 'skitterspec spec-env resume <spec> --reopen' }`.
   The skill follows `.claude/rules/offered-unblocks.md`: refusal first, then
   a two-option picker, label verbatim, nothing pre-selected. It is `satisfy`,
   not `bypass`, because no guard is stepped past and the re-open is recorded
   on the spec itself. A skill that decided on its own that `complete` is
   offerable would be inferring an offer, which that rule forbids.
3. **Re-opening is a fresh fork from the base branch as it stands.** The
   branch was deleted at teardown, and the landed work is already on base.
   `--reopen` plans the same `spec-env up <spec>` (full, not `--docs`) plus
   `bootstrap` that `/spec-start` runs, so ports, Docker and the registry
   behave identically. Under PR landing that base is the fetched remote base,
   as `up` already does.
4. **A leftover branch or worktree is resolved conservatively.** If the
   spec's branch still exists and is fully merged into base, it is reset to
   base, because it carries nothing to lose. If it has unmerged commits, or a
   worktree still exists, the re-open refuses with no offer and names what was
   found. That isn't "the current state", and choosing between them is the
   operator's call (`.claude/rules/negative-checks.md` rule 4).
5. **The bucket move and the record happen on the new branch, before any
   build.** The skill runs `git mv specs/complete/<spec> specs/in-progress/<spec>`.
   It adds a dated Changelog line with the reason, taken from the message or
   asked once. Without tracker `pull` it also writes an `In Progress` State log
   row and resets the `Status:` header. All of this is committed
   pathspec-bounded as `docs(spec): reopen <spec>` with the `Refs:` trailer, so
   `/spec-next` §2 finds a clean tree.
6. **The tracker goes back to In Progress, through `/spec-start`'s seam.**
   Re-opening is a bucket move, the same code fact `/spec-start` reports, so
   it calls the same `spec-tracker-start` seam: the status moves, and a closed
   issue is re-opened. Assignment follows `assign --if-unassigned`, also as
   start does. Leaving the ticket Done would make the board wrong for as long
   as the work runs.
7. **After the re-open, the flow is resume's own.** The skill continues at
   resume step 3: show where the spec stands, then act on the message. Every
   phase is `✅`, so feedback or new work becomes a new phase file and index
   row, then a hand-off to `/spec-next`. With no message, it reports and asks
   for the new phase rather than inventing one.

## Solution overview

`planResume` keeps refusing for `complete` but attaches the offer (Decision
2) when the spec's `Type` is not Hotfix or Epic. `spec-env resume <spec>
--reopen` is a separate plan: it checks for a leftover branch or worktree
(Decision 4), then prints the `up` + `bootstrap` commands and the `git mv`.
Text output carries an `offer:` line. `--json` carries `offer` and, under
`--reopen`, `reopen: { commands, then, move }`.

The skill's step 1 gains a branch: `ok: false` with an `offer` → relay, then
picker. On Re-open it runs the plan, `cd`s in, confirms with `spec-env
resolve`, does the move and record (Decision 5), calls the tracker seam,
commits, and joins step 3.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env resume <spec>` — `offer` on a `complete` refusal |
| CLI command | add | `spec-env resume <spec> --reopen` — fork-from-base plan + bucket move |
| Business rule | update | `complete` is re-openable; `cancelled`, hotfix, epic are not |
| Skill/rule | update | `/spec-resume` re-open branch; `spec-planning.md` table row |
| Tracker | update | re-open moves the ticket back to In Progress via the start seam |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine: offer on `complete`, `--reopen` plan | ✅ | [01-engine-reopen.md](01-engine-reopen.md) |
| 2 | Skill: re-open flow in `/spec-resume`, docs | ✅ | [02-skill-reopen.md](02-skill-reopen.md) |

## Open questions

- [ ] None

## Changelog

- 2026-11-20 — Spec created.
- 2026-11-20 — Phase 1: `--reopen` always plans `git branch -f <branch> <base>`
  before `up`, not only over a merged leftover. Otherwise `up` would carry on
  from a leftover remote branch, which is older than the base it landed on;
  with a local branch at the base, `up` takes its attach path. `up` itself
  needed no change and forks a spec found in `complete/` fine.
