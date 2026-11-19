---
github_identifier: "#241"
github_url: "https://github.com/SkitterByte/skitterspec/issues/241"
---

# /spec-resume and parked specs

> **Type:** Feature
> **Name:** feat-spec-resume (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/241
> **Author:** Reuben Greaves
> **Raised:** 2026-11-19
> **Area:** packages/common/src/env (resolve, specstate, new resume verb), packages/common/assets/skills (spec-resume, spec-park, spec, spec-bug, spec-hotfix, spec-next, spec-complete, spec-todo), packages/common/src/tada/todo.js, packages/sync-core/src/summary.js, packages/{github,linear,jira,azure-boards}/src/cli-sync.js (linked), packages/common/assets/rules/spec-planning.md
> **Stack:** worktree
> **Docs:** reference, github, linear, jira, azure-boards

## Summary

`/spec-resume <name|#N> [message]` takes you back into an in-progress spec.
It rebuilds the worktree if it's missing, moves the session there, and acts
on the message you gave it. It never starts the spec, moves its bucket or
reassigns it. Specs can also be **parked** on a recorded blocker
(`Blocked on:`). The blocker is shown on resume, in `/spec-todo` and on the
ticket.

## Problem

Some specs stall for reasons outside the repo: a deploy has to go out,
another project has to release, or a phase has to run in prod for a few days.
Getting back into one later has no direct route. The doors that exist try to
*start* something. In one real case `/spec 999 - <feedback on the deployed
upload>` began a new spec, and only partway through found that #999 already
had one. `/spec-start` re-attaches, but it runs the whole start sequence.
`/spec-next` takes no name and builds straight away. Nothing records *why* a
spec is waiting either, so a parked spec looks the same as an abandoned one.

## Acceptance criteria

- `/spec-resume feat-x` and `/spec-resume #999` land the session in that spec's
  worktree and report the current phase and any blocker. No bucket move, no
  assignee change, no tracker status transition.
- On a machine with no worktree for that spec, `/spec-resume` provisions one
  from the existing branch (local or remote) and lands in it.
- Resuming a spec in `backlog`, `complete` or `cancelled` is refused, and the
  refusal says where the spec is.
- `/spec-resume #999 - the toast shows the error but the row stays…` ends with
  the reported defect handled inside spec #999. `/spec-resume #999 - LSC is
  released, what do we test` ends with an answer drawn from the spec's own
  phases. Neither starts a new spec.
- `/spec 999 …` on a ticket that already has a spec offers `/spec-resume #999`
  and carries the message across.
- `/spec-park "waiting on LSC release"` writes a `Blocked on:` line. A phase
  file can carry a planned one. `/spec-next` stops before a blocked phase, and
  `/spec-todo` and the ticket's summary block both show the blocker.

## Decisions

1. **Resume refuses anything not in `in-progress`.** Resuming something
   never started *is* starting it, and finished or cancelled specs have no
   work left to re-enter. The refusal names the spec's bucket, plus
   `/spec-start` when that bucket is backlog.
2. **Rebuilding the worktree is the expected path, not an edge case.** The
   spec may have been started on another machine, or its worktree pruned.
   Resume runs `spec-env up` + `bootstrap` (full, not `--docs`). The engine
   already attaches an existing local branch, or tracks the remote one,
   without forking (`provision.js` attach path). Resume never creates a
   branch. A spec with no branch anywhere is refused, because inventing one
   would be `/spec-start`'s job.
3. **The message is interpreted, not templated.** It can be a defect report
   against the shipped work, a "the deploy is out, what now?", a test plan to
   follow or a question. Resume reads the spec, then the message, and does what
   the message asks *within this spec*. New work becomes tasks plus a
   Changelog line before it is built. Building follows `/spec-next`'s rules:
   the review gate is honoured, and the run ends on the review page. A message
   that is plainly outside the spec gets the usual kind-routing proposal
   (`/spec-bug`, `/spec`). Without a message, resume reports and stops.
4. **A `#N` lookup reads spec branches too.** Under `land.specDocs: "branch"`
   (this repo's default with a tracker) an in-progress spec exists only on its
   branch, so `spec-sync linked` on base would miss it. It reads local, then
   remote-tracking, spec branches, the same way `gating check` does, and
   never fetches. A `#N` that matches nothing is refused and never
   approximated.
5. **The doors hand off.** `/spec`, `/spec-bug` and `/spec-hotfix` already
   stop on a `#N` that has a spec. They now *offer* `/spec-resume #N`, carrying
   the rest of the message, under the confirm-first kind-routing rules. They
   never switch silently.
6. **`Blocked on:` is free text, and separate from `Waits on:`.** `Waits on:`
   is an epic wait the engine can observe, met only on base. `Blocked on:` is
   an outside condition only a person can judge (a deploy, another project, a
   soak period). It is advisory: it stops `/spec-next` *proposing* to build
   past it, and nothing else. An optional trailing `(until YYYY-MM-DD)` is the
   one part the engine reads, so `/spec-todo` can say a time-boxed wait has
   run out.
7. **Two places, two writers.** The overview header carries an ad-hoc
   blocker, written by `/spec-park`. A phase file header carries a *planned*
   one, written by `/spec` when a phase can only follow a deploy or a soak, or
   by hand. `/spec-complete` reports an uncleared blocker and never refuses
   over it.
8. **Parking keeps the worktree.** Deploy waits are days, and resume only
   rebuilds what is actually missing. Parking commits the header on the branch
   and touches nothing else.
9. **Resume clears a blocker by asking once.** It shows the blocker first.
   If the message says the condition is met ("LSC is released"), it clears the
   line and writes a dated Changelog entry. If it cannot tell, it asks once.
   It never clears in silence.
10. **The tracker shows the blocker and leaves Status alone.** The summary
    block gains a `Blocked on` line. Board status stays the tracker's
    (`fieldOwnership` pull), so no Blocked column is set from the repo.

## Solution overview

- **Engine.** `skitterspec spec-env resume <name|#N> [--json]` resolves the
  spec (name, or `#N` through the provider's `linked`, which now includes spec
  branches), checks it is in-progress, reports whether the worktree exists,
  and prints the `up`/`bootstrap` plan when it does not. It also reports any
  blockers. A shared `blockers(specDir)` reads `Blocked on:` from the overview
  and phase headers, including the optional `until` date. resume, next, todo,
  complete and the summary projection all use it.
- **`/spec-resume`.** Bring up the review server from the primary checkout,
  as `/spec-start` 2b does. Provision if needed, `cd` in, and confirm with
  `spec-env resolve`. Show the blocker. Interpret the message
  (Decisions 3, 9). End on the spec-reports block, or on the review banner
  when it built something.
- **`/spec-park "<reason>" [--until <date>] [--phase N]`.** Write the header,
  commit it on the branch (pathspec-bounded), and report `Next: /spec-resume
  <name>`.
- **Planned blockers.** `/spec` grills for "does any phase wait on something
  outside the repo?" and writes the phase header. `/spec-next` refuses (`⏸`)
  to build a phase whose blocker is uncleared, with `Next: /spec-resume`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env resume <name\|#N> [--json]` |
| CLI command | update | `spec-sync linked` (all providers) reads spec branches |
| Skill/rule | add | `/spec-resume`, `/spec-park` |
| Skill/rule | update | `/spec`, `/spec-bug`, `/spec-hotfix` (linked `#N` → offer resume); `/spec` (planned blockers); `/spec-next` (stop at blocked phase); `/spec-complete` (report blockers); `/spec-todo` (parked) |
| Skill/rule | update | `spec-planning.md` skill table + header fields; `CLAUDE.md` workflow |
| Business rule | add | `> **Blocked on:** <text> [(until YYYY-MM-DD)]` header, overview or phase |
| Schema/model | update | tracker summary block: `Blocked on` line |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine: `Blocked on:` reader, `#N` across branches, `spec-env resume` | ✅ | [01-engine-resume.md](01-engine-resume.md) |
| 2 | `/spec-resume` skill and the doors' hand-off | ✅ | [02-resume-skill.md](02-resume-skill.md) |
| 3 | Parking: `/spec-park`, planned blockers, `/spec-next` and `/spec-complete` | ⬜ | [03-parking.md](03-parking.md) |
| 4 | Surfacing: `/spec-todo` and the tracker summary block | ⬜ | [04-surfacing.md](04-surfacing.md) |

## Open questions

- None

## Changelog

- 2026-11-19 — Spec created. Prompted by `/spec 999 - <deployed upload
  feedback>` routing into a start before finding #999's existing spec.
- 2026-11-19 — Phase 1: resume plans its own worktree attach rather than calling
  `spec-env up`, which cannot resolve a spec that exists only on its branch. `#N`
  is read through `branch.identifierField` in the base engine. `linked` is
  extended in github, linear and azure-boards; jira ships no `linked`. It keeps
  the base listing and appends branch-only rows, so existing JSON consumers see
  the same rows plus new ones. The `spec-env resume` row in
  `docs/reference.html` landed in phase 1, because the docs-claims test requires
  every dispatched verb to be documented.
- 2026-11-19 — Phase 2: resume builds by committing its spec edits and handing
  off to a bare `/spec-next`, not by building itself. The doors' change sits in
  the four provider intake seams. Follow-up surfaced: Jira's intake seam runs
  `spec-sync linked`, which Jira does not ship; not in scope here.
