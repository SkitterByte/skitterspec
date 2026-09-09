---
linear_issue_id: "SKS-105"
---

# Phase 1 — `/spec-start` enters the worktree in-session ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** in `worktree` mode `/spec-start` ends with this session standing in the
provisioned worktree, so `/spec-next` runs in the same tab — proven by prose tests
over the skill.

## Tasks

- [x] Rewrite step 3 of `packages/common/assets/skills/spec-start/SKILL.md` so
      the branch is chosen from cwd **before** any tool call: cwd already inside a
      worktree (or no `EnterWorktree` available) → hand off as today; otherwise
      call `EnterWorktree` with the worktree path.
- [x] Put the entry **immediately after `git worktree add`**, before bootstrap and
      housekeeping, and say why: bootstrap then runs in place and the housekeeping
      is plain `git`, retiring the `cd` and the `git -C <worktreePath>` prefix on
      that path.
- [x] Warn that the skill must not `cd` into the worktree before entering —
      `EnterWorktree` errors with `is the current working directory`, which is how
      late entry fails rather than merely wasting a step.
- [x] Say why the worktree→worktree case degrades (target must be under
      `.claude/worktrees/`; this project's root is `../{repo}-wt`), so the next
      reader does not "fix" it by removing the branch.
- [x] Leave `open.command` and the `/add-dir` note on the degrade branch where the
      restructure puts them, but leave their wording, the `env.config.md` doc and
      this repo's config value to phase 2 — this phase is the branch structure.
- [x] Keep the "do not move the branch into this checkout" rule and the
      `/spec-live` warning intact — entering the worktree is the opposite of
      moving the branch out of it, and the confusion is worth pre-empting.
- [x] Restate that `/spec-next`'s resolution is unchanged and that rule 2 is what
      now answers, so nobody loosens it later believing this spec required it.
- [x] Update the `checkout` mode section only if it references the hand-off; it
      has no worktree to enter and must otherwise stay as-is.
- [x] Update the hand-off sentence in
      `packages/common/assets/rules/spec-planning.md:48-50` — "one terminal
      session per spec, which `/spec-start` sets up for you" is no longer the
      default path.
- [x] Add prose tests in `packages/common/test/` following
      `assets-spec-start-gate.test.js`: assert the skill names `EnterWorktree`,
      names the already-in-a-worktree degrade branch, and **does not** claim the
      operator must open or switch to another session in the non-degraded path.
- [x] Add the stays-silent test required by `.claude/rules/negative-checks.md` §3:
      assert the degrade branch is described as a *condition checked first*, not
      as a recovery from a failed call — the check must not accuse a healthy
      primary-checkout start.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`EnterWorktree` is gated on being told to work in a worktree by the user or by
project instructions. A lifecycle skill instructing it is project instruction, so
the call is in-contract — worth a line in the skill so it does not read as a
tool used out of turn.

Two existing assertions in `assets.test.js` pinned wording this phase rewrote and
were re-pointed, not relaxed: `branch stays in its worktree` →
`the branch never leaves` (same invariant, and the skill now states it more
strongly), and `Do this before any hand-off` → `Do this before you report
anything` (the hand-off is now only the degraded path, so the deadline had to
become the end of the skill on every path).

The repo's own `.claude/skills/` symlinks into the **built** distribution under
`packages/skitterspec-linear/assets/`, which is gitignored. `pnpm build` was run
so this checkout dogfoods the change; there is nothing to commit from it.
