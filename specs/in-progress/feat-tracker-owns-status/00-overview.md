---
github_identifier: "#93"
github_url: "https://github.com/SkitterByte/skitterspec/issues/93"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# The tracker owns status — the repo owns the spec

> **Type:** Feature
> **Name:** feat-tracker-owns-status (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-11-03)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-11-03
> **Area:** packages/sync-core/src (normalize.js, compare.js, push.js), packages/provider-kit/src (assignment.js, list-rows.js, config.js), packages/{github,linear,jira,azure-boards}/src/config.js, packages/{github,linear,jira,azure-boards}/assets/skills (spec-claim, spec-list, spec-status), packages/common/assets/skills (spec, spec-bug, spec-hotfix, spec-start, spec-next, spec-complete, spec-cancel), packages/common/assets/rules/spec-planning.md, packages/common/src/env (provision.js, resolve.js), docs/*.html
> **Stack:** worktree
> **Docs:** reference, github, linear, jira, azure-boards

## Problem

With a ticketing provider attached, a team runs its work from the board:
assignment, Ready, Blocked, Cancelled and Done all happen there. The repo also
keeps its own copy of that status (header `Status:`, `Developer:`, the State
log, and what the folder buckets mean), so whenever the board moves, one dev has
to notice and sync the repo by hand. That is pure toil. The repo copy is also
already wrong where everyone looks: on the base branch, a spec in flight still
reads `Ready — not started` in `specs/backlog/` (see `feat-in-flight-status`).
The repo is the right home for the spec's **content**, because content follows
branches, lands in the same commit as its code, and can be read offline.
Status, which belongs to the team, can't follow branches the same way.

## Decisions

1. **Split by what each side knows.** The repo owns content: Problem, Decisions,
   phases, checkboxes, Changelog. The tracker owns status, assignee, ready/blocked
   and the transition history. Rejected: tracker-only specs (they lose
   branch-scoping, atomic phase progress and offline agent reads); a two-way status
   sync (that keeps the manual chore and adds a conflict model).
2. **`pull` becomes real in `sync.fieldOwnership`.** The enum already lists
   `both|pull|push|none`, and `pull` was never implemented. `pull` means *the
   tracker owns this field*: the repo reads it live for display, never stores it
   in a file, and never pushes it except on its own code transitions (decision 4).
   It applies to `workflowState` and `assignee`. `description` and `subIssues`
   stay `push`.
3. **Buckets become code facts only.** `backlog` = not started · `in-progress` =
   `/spec-start` ran · `complete` = landed · `cancelled` = torn down. Only skills
   that act on code move them. (Reworded 2026-11-06 from "no branch" / "a branch
   exists": under `land.specDocs: "branch"` a backlog spec already has its
   authoring branch, so a branch is no longer the signal — the transition is.
   "Landed" is the host-aware check `feat-pr-landing` added, so under
   `land.strategy: "pr"` it means *merged on the host*, not *ancestor of local
   base*.) Ready, Blocked, In Review and the assignee exist
   only on the board. Rejected: a flat `specs/<name>/` (rewrites every skill and
   the finding convention for no gain); buckets unchanged (keeps the folder name
   claiming a planning status it can't keep current).
4. **The repo writes status only when it acts on code.** `/spec-start` →
   in-progress, `/spec-complete` → complete, `/spec-cancel` → cancelled, and
   creation by `/spec` / `/spec-bug` / `/spec-hotfix`. Under PR landing,
   completion is two runs: run 1 (push, PR ready) writes **no** state; run 2
   (the host merged) pushes complete — the same point `feat-pr-landing` already
   holds Done for. This is also why the tracker's own merge automations are not
   a substitute: in an rc-flow a merge into the rc is not a release, so Azure's
   complete-on-merge must stay off and these transition pushes stay the status
   engine. Phase moves no longer touch
   the parent's state, but sub-issues (phases) stay `push`, because they are
   content. Board-only states (Ready, Blocked, In Review) are never overwritten
   except by one of these transitions.
5. **When the board and the repo disagree, the repo reports and warns, and never
   refuses.** `spec-list` / `/spec-status` show the mismatch (board Cancelled or
   Done against a repo bucket that hasn't caught up) and offer the repo-side
   cleanup (`/spec-cancel` tears down) to whoever holds the branch.
   `/spec-start` and `/spec-next` print a one-line warning and carry on. Nobody is
   obliged to sync, because nothing reads the bucket as planning truth any more.
   Every cannot-tell (no credential, network failure, an unmapped state) says
   nothing (`negative-checks.md`).
6. **The board owns the assignee.** The `Developer:` header and the assignee
   frontmatter are no longer written. `/spec-start` assigns the operator **only
   when the ticket is unassigned**, and never reassigns anyone. `/spec-claim`
   writes the tracker directly (take, release, hand to a teammate) and stamps
   nothing into the repo.
7. **Under `pull`, new specs drop `Status:`, `Developer:` and the State log.** The
   header carries `> **Tracker:** <link>` instead. "Draft" is read from a
   non-empty Open questions section rather than from a header. Existing specs keep
   their headers and State logs untouched, as history. Nothing rewrites them.
8. **The default is everywhere, so this is a major release of every provider.**
   The shipped `fieldOwnership` flips `workflowState` and `assignee` to `pull`.
   An install that wants the old behaviour sets them back to `push`. The release
   notes say so under *Action required*.
9. **Without a provider, nothing changes.** The base stays tracker-free: header
   status, State log and buckets keep their current meaning. Every skill decides
   by asking `ownsField` / an ownership helper, never by checking which
   provider is present.
10. **The rule is rewritten, not amended.** *"It tells, it doesn't track"* in
    `spec-planning.md` becomes *"the tracker owns status, the repo owns the
    spec"*, with this spec's reasoning. The one-way content rule (repo wins,
    loudly) is unchanged.

## Solution overview

- **Engine (sync-core / provider-kit):** an ownership helper that answers `push` /
  `pull` / `none` per field. Under `pull`, the projection omits the field from
  routine pushes, and a transition push carries it explicitly. A `readStatus`
  adapter call returns `{ state, bucket, assignee }` or `cannot-tell`.
- **Skills:** lifecycle skills ask the helper before writing header status,
  `Developer:` or State-log rows. `/spec-start` assigns-if-unassigned.
  `/spec-claim` becomes a tracker write.
- **Disagreement:** `spec-list`'s existing `≠` column (`list-rows.js`
  `specColumn`) is reworded around code facts and gains a cleanup offer.
  `/spec-start` and `/spec-next` warn in pre-flight.
- **Follow-ups ride as the last two phases** (decisions are recorded in each
  phase file), so they can be built straight after without another `/spec`.

## Related specs

Recorded 2026-11-06 so neither side is designed blind:

- **`feat-tracker-held-specs` (#123, Draft)** — holds *dormant* specs in the
  tracker. It revisits Decision 1 (which rejected tracker-only specs *in flight*)
  and replaces Decision 3's `backlog` bucket in tracker mode. Its
  materialise-at-`/spec-start` changes what `spec-env up` forks from, as phase 5's
  resume does — design them together. It waits for phases 1–4 here.
- **`feat-rolling-base` (#113)** — adds a fetch to `spec-env up`
  (`provision.js`); phase 5 here adds `origin/<branch>` detection to the same
  path. Whichever lands second builds on the other.
- **`feat-hotfix-to-master` (#118)** — edits `/spec-hotfix` (fork from a release
  branch, `Base version: <branch>@<sha>`); phase 2 here edits its header writes.
  Same skill file, independent changes.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | update | `sync.fieldOwnership.workflowState`, `.assignee` default `push` → `pull` (all four providers) |
| Config key | update | `pull` value implemented (was accepted, unused) |
| Business rule | update | buckets = code facts; repo writes state on start/complete/cancel/create only |
| Business rule | update | assignee: board-owned; `/spec-start` assigns only if unassigned |
| Spec header | remove | `Status:`, `Developer:`, State log on new specs under `pull` |
| Spec header | add | `> **Tracker:** <link>` under `pull` |
| CLI command | update | `spec-sync list` / `status`: board-vs-code mismatch + cleanup offer |
| CLI command | update | `spec-sync assign` / `/spec-claim`: writes the tracker, stamps nothing |
| Skill/rule | update | spec, spec-bug, spec-hotfix, spec-start, spec-next, spec-complete, spec-cancel, spec-claim; `spec-planning.md` rule rewrite |
| CLI command | update | `spec-env up` resumes from `origin/<branch>` (phase 5) |
| Tracker field | add | branch · last-pushed sha · phase on the ticket, native link where available (phase 5) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine: `pull` ownership, transition-only state writes, live status read | ✅ | [01-pull-ownership-engine.md](01-pull-ownership-engine.md) |
| 2 | Skills stop storing status; buckets as code facts; board-owned assignee | ✅ | [02-skills-stop-storing-status.md](02-skills-stop-storing-status.md) |
| 3 | Disagreement: report, warn, offer cleanup | ✅ | [03-disagreement-report-warn.md](03-disagreement-report-warn.md) |
| 4 | Default flip, rule rewrite, docs, major-release notes | ⬜ | [04-default-flip-and-docs.md](04-default-flip-and-docs.md) |
| 5 | Follow-up: branch handoff (push, mirror, resume) | ⬜ | [05-branch-handoff.md](05-branch-handoff.md) |
| 6 | Follow-up: skitterspec service as an always-on projection (design) | ⬜ | [06-service-projection-design.md](06-service-projection-design.md) |

## Open questions

- None. Phase 6 is a design phase by intent, and its own questions live in its
  file.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-11-03 | Ready | backlog | Reuben Greaves |
| 2026-11-03 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-11-03 — Spec created. Grew out of a devil's-advocate review of whether
  specs belong in the repo once a tracker is attached. Outcome: content stays in
  the repo, and status moves to the tracker.
- 2026-11-03 — `feat-in-flight-status` (backlog) rejected tracker reads in its
  Decision 1. Once this lands, `/spec-review` it: under `pull`, "what is in
  flight" is partly the board's answer.
- 2026-11-06 — Reviewed vs codebase after `feat-pr-landing` landed (branch
  rebased onto main; every code reference still resolves, no task already done).
  Decision 3 reworded — buckets follow transitions, not branch existence,
  because `land.specDocs: "branch"` gives backlog specs a branch, and
  "landed" is now host-aware. Decision 4 and phase 2: under PR landing the
  complete transition rides run 2 only. Phase 5: reuse the PR-landing push
  path. Phase 6: native automations fail rc-flows. Added Related specs for
  #123, #113, #118.
- 2026-11-07 — Phase 1: no `--transition` flag. The state's split hash already
  changes only on a bucket move, so under `pull` the engine sends a state on that
  positive signal (or on a create) and never on a cannot-tell. A pulled assignee
  is not projected, so complete/cancel no longer release it (phase 2's task is
  updated to match). `readStatus` is a single kit function over every adapter's
  `readIssue`. Its CLI surface moves to phase 3.
- 2026-11-07 — Phase 2: the skills learn ownership from a new
  `spec-sync ownership` verb and a `spec-status-owner` seam (empty in the base
  distribution). `/spec-incident` and `/spec-review` joined the list. The PR
  run-2 rule for the complete transition is in every provider's sync seam.
- 2026-11-07 — Phase 3: disagreement narrowed to "the board finished what the
  repo has not" in both ownership modes. A new `spec-sync board` verb is read by
  the `/spec-start` and `/spec-next` pre-flights and by `/spec-status`. The
  cleanup is named and never offered.
