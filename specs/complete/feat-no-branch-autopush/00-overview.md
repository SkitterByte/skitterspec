---
linear_identifier: "SKS-162"
linear_url: "https://linear.app/skitterbyte/issue/SKS-162/publishing-a-branch-is-the-users-call"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Publishing a branch is the user's call

> **Type:** Feature
> **Name:** feat-no-branch-autopush (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-12)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-11
> **Area:** packages/common/assets/skills/spec-start/SKILL.md, packages/common/assets/skills/spec-cancel/SKILL.md, packages/linear/src/cli-sync.js, packages/linear/assets/skills/spec-push/SKILL.md, packages/linear/assets/skills/spec-sync/SKILL.md, packages/linear/assets/seams/spec-tracker-link.md, packages/linear/assets/core/SETUP.md, packages/common/assets/rules/spec-planning.md, docs/linear.html, MIGRATION.md
> **Stack:** worktree

## Problem

`/spec-start` runs `git push` on the branch it provisions, and nobody asked for
it. Provisioning a worktree and mirroring to the tracker are the tooling's job;
publishing to a shared remote is a decision, and one the user can make in a
single command without spending a model turn on it.

The stated justification does not survive reading. `spec-start/SKILL.md:148` says
the push "records the in-progress state for everyone and **fires the tracker's
automation**" — but `env.config.md` is explicit that tracker automation fires
only when `branch.pattern` contains `{identifier}`, and the shipped default is
`{type}/{slug}` with an empty `identifierField`. This repo sets
`identifierField: "linear_identifier"` but never uses `{identifier}` in the
pattern, so `feat/spec-start-kickoff` carries no issue id and Linear has nothing
to match. The automation half has never applied here or in any default install.

Nor is it an invariant: `/spec-bug` provisions a worktree exactly the same way
and does not push, and `/spec-hotfix` says explicitly not to.

**It also disables a safety guard.** `refuseTeardownIfUnpushed`
(`env/teardown.js:58`) blocks teardown when commits are `unpushed && !landed`.
At `/spec-complete` the branch is landed, so it never fires. At `/spec-cancel`
the spec is unlanded — exactly where it should fire — and it cannot, because
`/spec-start` already pushed. The guard has effectively never fired in normal
use, and an entire spec (`feat-teardown-remote-branch`) exists to build the
prompt that cleans up the branches this default leaves behind.

Separately, "push" now names three unrelated things — the branch push above,
`/spec-push`, and the `spec-sync push` CLI verb. The verb is the one that
*writes nothing*: it prints a plan with no network access, and `spec-sync apply`
does the writing.

## Decisions

1. **No lifecycle skill ever publishes a spec branch — at any point.** Not at
   provisioning, not after a phase commits, not on the way to cancelling. Pushing
   to a shared remote is the user's decision and stays theirs; the tooling may
   *print* the command, never run it. Removed rather than made configurable: a
   config key earns nothing over a command the user can already type, and it
   preserves the question rather than answering it. *Rejected:* a
   `branch.pushOnCreate` flag; and publishing after the first phase commits,
   which is the same reflex deferred by one step.
2. **The commit stays.** `/spec-start` still commits the spec's move to
   `in-progress/` on the branch; only the publish goes. The commit is
   housekeeping the skill performed, the push is distribution.
3. **`/spec-cancel` relays the refusal and offers to publish first.** With the
   auto-push gone the guard fires on a cancel with unpushed work, which is
   correct — that work really is about to be destroyed. The skill names both ways
   out: publish the branch so it stays reachable, or `--force` accepting the
   loss. *Rejected:* pushing automatically at cancel time (the same reflex,
   relocated, and it publishes abandoned work unasked); relaying only `--force`
   (leaves the user to think of the backup at the worst possible moment).
4. **The guard firing is a feature, not a regression.** Nothing about
   `refuseTeardownIfUnpushed` changes; it simply starts being reachable. Keep
   `guards.refuseTeardownIfUnpushed` as-is and do not relax it.
5. **The teardown remote-branch prompt stays.** It only triggers on a remote ref
   this clone can see, so after this change it appears exactly when the user
   published by hand — which is when it is genuinely wanted.
   `feat-teardown-remote-branch` decision 5 already says absence plans nothing
   and says nothing, so it degrades correctly with no edit.
6. **`spec-sync push` is renamed to `spec-sync plan`.** The verb computes a
   create/update plan and performs no network I/O; naming it `push` beside a
   `/spec-push` skill and a `git push` was the collision. `/spec-push` keeps its
   name — it runs `plan` then `apply`, so it is the thing that genuinely pushes.
7. **Clean break, with a pointed error.** `push` is removed rather than aliased,
   matching how `/spec-go` was retired — but the dispatcher recognises the old
   name and says it is now `plan`, rather than falling through to generic usage.
   A silent alias keeps the old name alive forever; a generic "unknown
   subcommand" throws away the migration hint.
8. **`fieldOwnership` values are NOT renamed.** `assignee: "push"`,
   `description: "push"`, `workflowState: "push"` in `linear.config.json` are a
   different vocabulary — direction of ownership, not a subcommand. Touching them
   would break every adopter's config to fix a problem they do not have.
9. **Both changes ride the pending majors.** `@skitterbyte/skitterspec` v18 → v19
   and `@skitterbyte/skitterspec-linear` v12 → v13 are written but unreleased, so
   the CLI break costs nothing extra now and a major later.

## Solution overview

`/spec-start` step 4 loses one clause:

```
- **Commit it.** One commit, the spec's own — it records the in-progress state
  on the branch. Publishing the branch is yours to do, whenever you want it
  somewhere other than this machine: `git -C <worktree> push -u origin <branch>`.
```

`/spec-cancel` gains the refusal path, which the engine already produces:

```
spec-env down refuses: worktree has unpushed commits not yet merged
  publish it first (keeps the work reachable):
    git -C <worktree> push -u origin <branch>    then re-run /spec-cancel
  or accept the loss:
    skitterspec spec-env down <name> --force
```

And the verb is renamed throughout:

```
skitterspec spec-sync plan <spec> --workspace-states <file> --json > plan.json
skitterspec spec-sync apply <spec> --plan plan.json
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill | update | `/spec-start` — drop the branch push, keep the commit |
| Skill | update | `/spec-cancel` — relay the unpushed refusal, offer to publish |
| CLI command | rename | `spec-sync push` → `spec-sync plan` |
| CLI command | add | `spec-sync push` → retired-name error naming `plan` |
| Skill | update | `/spec-push`, `/spec-sync` — invoke `plan` |
| Seam | update | `spec-tracker-link` — invoke `plan` |
| Rule/doc | update | `spec-planning.md`, `SETUP.md`, `docs/linear.html`, `MIGRATION.md` |
| Config key | none | `fieldOwnership: "push"` values are untouched (decision 8) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `/spec-cancel` handles the unpushed refusal | ✅ | [01-cancel-unpushed-path.md](01-cancel-unpushed-path.md) |
| 2 | `/spec-start` stops pushing the branch | ✅ | [02-stop-pushing.md](02-stop-pushing.md) |
| 3 | Rename `spec-sync push` to `spec-sync plan` | ✅ | [03-rename-push-to-plan.md](03-rename-push-to-plan.md) |
| 4 | Docs, migration and shipped-surface guards | ✅ | [04-docs-and-surfaces.md](04-docs-and-surfaces.md) |

## Open questions

- [ ] None. Publishing after the first phase commits was considered and
      **rejected** — see decision 1. The backup argument is real, and the answer
      to it is a command the user runs when they want it, not a push they did not
      ask for.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-11 | Ready | backlog | Reuben Greaves |
| 2026-09-12 | In Progress | in-progress | Reuben Greaves |
| 2026-09-12 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-11 — Spec created.
- 2026-09-11 — Scope hardened before any work started: the rule is **never**
  auto-publish, at any lifecycle point, rather than "not at provisioning". The
  open question about pushing after the first phase commits is closed as
  rejected, and decision 1 now carries the invariant the phase 2 guard test
  asserts.
- 2026-09-12 — Phase 1 done. The `/spec-complete` check (task 4) confirmed the
  unpushed guard is unreachable there — step 6 lands the branch, so `merged` is
  true and `planDown` skips the check — so the finding was written into
  `/spec-complete` step 3 and pinned with a stays-silent test, rather than left
  implied.
- 2026-09-12 — Phase 2 done. Scope grew by four claims the change falsified
  (`/spec-complete`'s remote-delete prose, two `env/teardown.js` comments, one
  test comment) plus two ordering tests anchored on the removed literal. The
  `-D`-over-`-d` comment gained an explicit do-not-simplify note: its stated
  reason was the provision-time push, and the flag is still right without it.
- 2026-09-12 — Phase 3 done. `docs/linear.html`'s command row moved here from
  phase 4: `docs-claims.test.js` demands every dispatched verb appear on that
  page, so the rename cannot land green without it. The retired `push` case is
  dispatched and therefore also demanded — allowlisted with a reason rather than
  documented, since a docs row would advertise a retired name as available.
- 2026-09-12 — Phase 4 done, and with it all four phases. `spec-planning.md` and
  `docs/index.html` turned out to need no edit — checked and recorded rather than
  ticked blind. The cross-surface claim guard added here caught two more places
  (`env.config.md`, `src/env/config.js`) still explaining the remote-delete
  prompt in terms of a branch `/spec-start` had pushed, which the phase 2 grep
  had missed.
- 2026-09-12 — Completed; all four phases done, tests green (1883). Nothing
  deferred. Scope grew twice beyond the plan, both recorded in the phase files:
  six shipped surfaces still claimed provisioning published the branch (four
  found by grep in phase 2, two by the new guard in phase 4), and phase 3 pulled
  `docs/linear.html` forward because `docs-claims.test.js` will not go green on a
  renamed verb the docs do not carry.
