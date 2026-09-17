---
linear_issue_id: "SKS-341"
---

# Phase 2 — `/spec` authors in its worktree and lands on the verdict ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `main` is never dirty during spec authoring. `/spec` provisions after
grilling, writes and renders from the worktree, and the committing verdict commits
on the branch then fast-forwards `main` — so the backlog still lands on `main`, as
one commit, with nothing in anyone's way in between.

## Tasks

- [ ] `/spec` Phase B: after grilling and **before** writing the folder, run
      `spec-env up <name> --docs` and move the session into the worktree with a
      plain `cd` (never `EnterWorktree`). Grilling puts nothing on disk, so there
      is no window to protect and no chicken-and-egg on the slug.
- [ ] Rewrite Phase B's "Write it from the base branch" section. Its warning —
      a spec authored inside **another** spec's worktree lives on that branch and
      is cancelled with it — is still correct and still needed; what changes is
      that a spec authored in **its own** worktree is now the normal path.
- [ ] Phase C2: drop "it never wants a worktree — a backlog spec has none". The
      render reads the worktree it just provisioned. Keep the `spec-env stage`
      `owned` split — the worktree holds only this spec's documents, so it is
      cheap and still correct.
- [ ] Phase C2: keep **arm nothing**, and replace its justification with the
      stronger one — walking away now leaves an unlanded branch rather than a
      dirty `main`. A `/spec` run must still leave `review gate --check` exiting 0.
- [ ] Route `commit-start`: hand `docs.paths` to `review.commitWith`, then
      `spec-env integrate <name>` (rebase onto base + `merge --ff-only`), then
      **keep** the worktree and run `/spec-start <name>`.
- [ ] Route `commit`: the same commit and the same land, then **tear down** the
      worktree and finish with the spec `Ready` in `backlog`.
- [ ] Make `/spec-start` reuse an existing docs worktree rather than refusing or
      re-provisioning it, and run the `setup` commands docs mode skipped. After the
      fast-forward the branch equals base and the spec is in the commit the
      worktree forked from — which is the healthy case `/spec-start` already
      checks for, so verify it reads as healthy rather than as the clean-tree
      refusal it already makes there.
- [ ] Report the land in the block: a `Landed` row, per
      `.claude/rules/spec-reports.md`'s field vocabulary.
- [ ] Handle the land failing. A rebase conflict on a documents-only branch is
      unlikely but not impossible (two specs editing `specs/.core/`). Abort the
      rebase, leave the commit on the branch, and report `❌` with the conflict —
      there is a standing worktree to clear, which is what separates `❌` from `⏸`.
- [ ] Update `.claude/rules/spec-planning.md`: the `/spec` row's folder column, and
      the "author backlog specs from the base branch" advice, which this inverts.
      `commit-trailers.md` carries the same advice and wants the same edit — the
      trailer is resolved from the branch, and now the branch is the spec's own,
      so the bare `spec-sync ref` becomes correct where it used to be wrong.
- [ ] Tests: `commit-start` keeps the worktree and `commit` tears it down; the
      integrate plan is the rebase + ff pair; a conflicting rebase aborts and
      leaves the branch committed; `/spec-start` over a landed docs worktree runs
      setup and does not re-fork.
- [ ] Tests (stays-silent): a project with isolation **off** skips C2 entirely and
      `/spec` behaves exactly as today — no worktree, no land, no page.
- [ ] Run `pnpm typecheck` and `pnpm test` — green before this phase is done.

## Notes

`planIntegrate` (`integrate.js:27`) already produces `git -C <worktree> rebase
<base>` + `git -C <main> merge --ff-only <branch>` and refuses on a dirty tree, so
the land hop is an existing verb called from a new place. The dirty guard is right
here too: the commit runs first, so a dirty tree at this point means something
else is uncommitted and the land should not proceed.

**This phase must ship whole.** Authoring into a worktree without the land hop
would leave every new spec on an unlanded branch, invisible to `ls
specs/backlog/` — worse than the problem it fixes.
