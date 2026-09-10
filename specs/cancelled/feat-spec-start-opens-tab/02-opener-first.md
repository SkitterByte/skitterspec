---
linear_issue_id: "SKS-123"
---

# Phase 2 — `/spec-start` opens a tab when `open.command` is set ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** in `worktree` mode `/spec-start` runs `open.command` and leaves the
session where it is; with `open.command` empty it calls `EnterWorktree` exactly as
today — proven by the skill-asset tests.

## Tasks

- [ ] Rewrite `spec-start/SKILL.md` step 3.2 as a **three-way branch, decided
      before acting** (never by calling and catching, per the existing decision 5):
      1. `open.command` non-empty → run it, do **not** call `EnterWorktree`,
         print the worktree path, say to run `claude` then `/spec-next` there.
      2. `open.command` empty and `EnterWorktree` available and cwd is not already
         inside a worktree → enter, as today.
      3. Otherwise → today's hand-off (print the path).
- [ ] State decision 3 explicitly in the skill: the opener and `EnterWorktree` are
      **mutually exclusive**. Both would leave the original session inside a
      worktree that no shell is in.
- [ ] Replace the skill's step 4 housekeeping prose with a single
      `spec-env promote <name>` call (phase 1), and delete the `git -C` / `/add-dir`
      guidance it replaces. Keep the ordering guarantee: housekeeping and the
      commit happen **before** the skill reports, on every branch.
- [ ] Update step 6 so the `worktree`-mode finish-up matches the branch taken —
      "run `claude` then `/spec-next` in the new tab" vs today's "run `/spec-next`
      here" — rather than assuming the session moved.
- [ ] Update `spec-planning.md`'s description of `worktree` mode: `/spec-start` no
      longer always "moves the session you typed into" — it opens a tab when the
      project configures an opener.
- [ ] Update `env.config.md`'s `open.command` comment: it is no longer described
      as "the FALLBACK for reaching a worktree" but as the entry mechanism, with
      the empty default meaning "move the session instead".
- [ ] Extend `packages/common/test/assets-spec-start-enter.test.js` (and add cases
      alongside it) to assert the skill text carries all three branches, that it
      never instructs both the opener and `EnterWorktree`, and that it calls
      `spec-env promote` rather than describing hand-rolled `git mv` steps.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

`/spec-next`'s resolution rules stay untouched, exactly as SKS-104 decision 3 had
it. Under the opener branch, rule 2 ("the worktree you are standing in") answers
because the **new session** is genuinely in the worktree — the refusal that keeps
the wrong branch from being built is unchanged and must stay.

The `checkout` mode path is unaffected: there is no worktree, so there is nothing
to open and nothing to enter.
