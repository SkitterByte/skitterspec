---
linear_issue_id: "SKS-178"
---

# Phase 1 — `/spec-start` lands the session in the worktree ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** after a bare `/spec-start`, a bare `/spec-next` resolves the spec and
builds its phase — no flag, no second session, no tool that prompts.

## Tasks

- [x] In `packages/common/assets/skills/spec-start/SKILL.md` step 3, state that
      the bootstrap `cd "<worktreePath>" && …` **moves this session** and is
      meant to. The command itself does not change; what changes is that the
      skill stops describing it as "one call, no session move".
- [x] Add the positive check from decision 5 straight after it: run
      `skitterspec spec-env resolve` with no argument and confirm it names this
      spec. If it does not, say so and fall back to the documented hand-off
      rather than building — three states, not two
      (`.claude/rules/negative-checks.md` rule 4).
- [x] Keep the `git -C <worktreePath>` prefix on the step 4 housekeeping
      (decision 4). Add a one-line comment saying why it is kept rather than
      simplified, so the next reader does not tidy it away.
- [x] Replace the step 6 offer with the simplified form: the session is already
      in the worktree, so **yes** carries on into a bare `/spec-next` and **no**
      leaves the operator standing there. Drop "or hand off to a session in the
      worktree" — there is no longer a session to hand off to.
- [x] Remove the `**The session does not move, and nothing opens a window.**`
      paragraph and the `/spec-diff` justification attached to it. Keep the
      neighbouring claim that nothing opens a *window* — that part is still true
      and is what stops `open.command` coming back.
- [x] Keep the worktree **trust** step and its `/add-dir` note untouched — it is
      not part of this, and `spec-env up` still writes the trusted root.
- [x] Invert the assertions in
      `packages/common/test/assets-spec-start-one-path.test.js` that pin the old
      shape: `The session does not move` becomes an assertion that the skill
      says the session **is** moved, and the "one path" framing stays (there is
      still exactly one path — it now ends in the worktree).
- [x] **Keep `no shipped surface mentions EnterWorktree` exactly as it is**, and
      extend its comment to say what it now guards: not the dead tab machinery,
      but the mobile constraint from decision 2. This is the assertion that stops
      the fix regressing into a tool call.
- [x] Update `packages/common/test/assets-spec-start-offer.test.js` for the new
      step 6 wording, including line 87's `doesNotMatch` on step 3.
- [x] Add a test asserting the skill **verifies** the move rather than assuming
      it — the bare `spec-env resolve` check and its failure branch are both
      present.
- [x] **Discovered:** three tests outside this phase's list pinned the same
      prose and had to move with it — `assets.test.js`'s
      `never routes a start through the live overlay` (it asserted the deleted
      "builds a branch and tells you where it is") and
      `builds every worktree-mode spec the same way`, plus
      `assets-kickoff-surfaces.test.js`'s composition test, which pins the step 6
      offer wording in both distributions.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

**The engine needs no change, and that is established rather than assumed.**
`provisionedSpecChoice(dir, config, cwd = process.cwd())`
(`packages/common/src/cli.js:899`) resolves from cwd and documents it: "Standing
inside a spec's worktree names it outright." Verified live — a bare
`spec-env resolve` run from inside a worktree names that spec, and the cwd
survives between separate Bash calls.

**Nothing scatters `.spec-env/` by running verbs from the worktree.**
`bug-spec-env-cwd-anchor` already fixed that: `resolve.js:228` records that
identity and coordinate tokens — the registry, worktree paths, the docker project
name — expand against the primary checkout "in every case", so the review pages
and the slot registry stay in one place wherever the session stands.

**Why the check in decision 5 is worth its line.** A `cd` that failed leaves the
session in the primary checkout on the base branch, where the very next thing
`/spec-next` does is write a phase's worth of code. Nothing about that looks
wrong at the time; `--assert-primary-clean` only catches it afterwards, on a run
that was given `--worktree` — which this path is not.
