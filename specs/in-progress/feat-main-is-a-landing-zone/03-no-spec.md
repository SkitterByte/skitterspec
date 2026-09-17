---
linear_issue_id: "SKS-342"
---

# Phase 3 — `/no-spec`, the lane for work with no spec ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/no-spec <name>` gives mechanical work a branch, a worktree, a review
page and a landing — with no spec document anywhere — so the guard in phase 4 is
a push rather than a wall.

## Tasks

- [ ] Add the `nospec` button set to `BUTTON_SETS` in
      `packages/common/src/env/review.js`: `commit-land`, `commit`, `changes`,
      `discuss`.
- [ ] Add `commit-land` to `VERDICTS` and to the `COMMITTING` list — it commits, so
      it must be blocked by an open comment like every other committing verdict.
      Document at its definition why it is a distinct word rather than a reuse of
      `commit`: a verdict must mean one thing independently of which page sent it.
- [ ] Teach the registry's consumers a name with no spec folder. `resolve.js`,
      `teardown.js` and `spec-env status` currently assume name → spec folder; each
      needs the cannot-tell branch to be the harmless one — report the worktree,
      say there is no spec, never accuse the repo of being broken.
- [ ] Write `packages/common/assets/skills/no-spec/SKILL.md`. Shape:
      1. Take a kebab name (ask if none given — it is the branch and the folder).
      2. `spec-env up <name> --docs` on the `chore/{slug}` branch, `cd` into it.
      3. Do the work.
      4. `spec-env review <name> --buttons nospec`, then `spec-env review arm
         <name>` — finished code owes a verdict, unlike a written spec.
      5. `spec-env review wait <name> --since <timestamp>`, end the turn.
      6. Route: `commit-land` → `/commit`, `spec-env integrate`, teardown.
         `commit` → `/commit` only, branch stands. `changes` → work them, resolve,
         re-render, wait again. `discuss` → report and talk.
- [ ] Give it the report block from `.claude/rules/spec-reports.md`: verdicts
      `✅` landed · `⚠️` committed but not landed · `❌` land failed part-way ·
      `⏸` refused. Fields `Branch` · `Built` · `Tests` · `Landed` · `Follow-ups` ·
      `Next`. No `Tracker` and no `Spec` — there is neither.
- [ ] Mark it model-invocable. The guard's refusal points at it, so Claude must be
      able to take that route without the user typing anything — which is the
      opposite of `/allow-main` in phase 4, and the distinction is deliberate:
      Claude may move the work *off* `main`, never lift the guard *on* it.
- [ ] Register `/no-spec` in `.claude/rules/spec-planning.md`'s skill table, with
      an explicit note that it is the one entry that writes no spec and moves
      nothing through the lifecycle.
- [ ] Ship it through `init.js` alongside the other skills so `skitterspec init`
      and `update` install it.
- [ ] Tests: `nospec` renders four buttons; `commit-land` is refused while a
      comment is open; a registry entry with no spec folder resolves, reports and
      tears down; `spec-env status` lists it without claiming the spec is missing.
- [ ] Tests (stays-silent): a specless registry entry makes no verb exit non-zero
      and produces no "spec not found" accusation anywhere.
- [ ] Run `pnpm typecheck` and `pnpm test` — green before this phase is done.

## Notes

`refresh` (`review.js:725`) is nearly this set and was rejected for it: reusing
plain `commit` to mean "commit, land and tear down" is exactly the one-word-two-
meanings problem the file already refuses at `:486`.

The branch is `chore/{slug}` — `branch.pattern` already carries `{type}`, so no
config change is needed.
