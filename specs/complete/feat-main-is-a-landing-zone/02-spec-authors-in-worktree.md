---
linear_issue_id: "SKS-341"
---

# Phase 2 — `/spec` authors in its worktree and lands on the verdict ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `main` is never dirty during spec authoring. `/spec` provisions after
grilling, writes and renders from the worktree, and the committing verdict commits
on the branch then fast-forwards `main` — so the backlog still lands on `main`, as
one commit, with nothing in anyone's way in between.

## Tasks

- [x] `/spec` Phase B: after grilling and **before** writing the folder, run
      `spec-env up <name> --docs` and move the session into the worktree with a
      plain `cd` (never `EnterWorktree`). Grilling puts nothing on disk, so there
      is no window to protect and no chicken-and-egg on the slug. The `cd` is
      confirmed with a bare `spec-env resolve`, and a `cd` that did not take
      writes the spec where the session stands rather than guessing.
- [x] Rewrite Phase B's "Write it from the base branch" section → **"Write it in
      its own worktree"**. Its warning — a spec authored inside **another**
      spec's worktree lives on that branch and is cancelled with it — is kept
      verbatim in substance; what changed is the remedy, which is now the
      provision itself rather than "author from the base branch".
- [x] Phase C2: drop "it never wants a worktree — a backlog spec has none". The
      render reads the worktree it just provisioned.
- [x] Keep the `spec-env stage` `owned` split, with a **replaced** justification.
      Its original reason (several specs in one `specs/` folder) is gone; what
      stands in its place is `spec.companionPaths`, a hand-edited `specs/.core/`
      and the tracker snapshot, which all land in the same tree as the spec.
- [x] Phase C2: keep **arm nothing**, and replace its justification with the
      stronger one — walking away now leaves an unlanded branch rather than a
      dirty `main`. A `/spec` run must still leave `review gate --check` exiting 0.
- [x] Route `commit-start`: hand `docs.paths` to `review.commitWith`, then
      `spec-env integrate <name>` (rebase onto base + `merge --ff-only`), then
      **keep** the worktree and run `/spec-start <name>`.
- [x] Route `commit`: the same commit and the same land, then **tear down** the
      worktree and finish with the spec `Ready` in `backlog`.
- [x] Make `/spec-start` reuse an existing docs worktree rather than refusing or
      re-provisioning it, and run the `setup` commands docs mode skipped. The
      engine already does this (phase 1 pinned it); what this phase adds is the
      skill saying a landed spec is the **healthy** case of its clean-tree check,
      so "nothing to commit" is not read as a skipped step.
- [x] Report the land in the block: `Landed` and `Worktree` added to `/spec`'s
      declared fields, both stated as appearing only once a verdict has been
      acted on.
- [x] Handle the land failing: abort the rebase, leave the commit on the branch,
      report `❌` — plus a new `❌` verdict in `/spec`'s Report section, since it
      had none.
- [x] Update `.claude/rules/spec-planning.md`: the `/spec` skill-table row, a new
      authoring paragraph carrying the landing-zone rule, and the `stage`
      justification. `commit-trailers.md` inverted: with isolation on the **bare**
      `spec-sync ref` is now correct for a new spec, because the branch and the
      commit's subject are the same spec.
- [x] Also `spec-reports.md`: the follow-up offer's "say where the spec would be
      written" caveat is dropped, since `/spec` now provisions the follow-up's own
      worktree.
- [x] Tests (`assets-spec-authors-in-worktree.test.js`, 26): provisioning and its
      timing, the confirmed `cd`, both landing verdicts, the dirty-tree refusal,
      the conflict path, the worktree-lifetime asymmetry with both rejected
      alternatives, `/spec-start`'s re-attach, the two new report fields and the
      `❌` verdict, and every rule edit.
- [x] Tests (stays-silent): no isolation means no worktree, no land and no
      mention; the report omits `Landed`/`Worktree` where nothing was
      provisioned; all three rules say the old behaviour is unchanged without
      isolation; and the spec-in-another-worktree warning is asserted to survive.
- [x] Updated four assertions in `assets-spec-authoring-review.test.js` that
      pinned sentences this phase inverted — including two `doesNotMatch` checks
      so the old claims are provably **gone**, not merely contradicted elsewhere.
- [x] Run the project's test command — **3105 pass, 0 fail** (`node --test`).

## Notes

`planIntegrate` (`integrate.js:27`) already produces `git -C <worktree> rebase
<base>` + `git -C <main> merge --ff-only <branch>` and refuses on a dirty tree, so
the land hop is an existing verb called from a new place. The dirty guard is right
here too: the commit runs first, so a dirty tree at this point means something
else is uncommitted and the land should not proceed.

**This phase shipped whole.** Authoring into a worktree without the land hop
would leave every new spec on an unlanded branch, invisible to `ls
specs/backlog/` — worse than the problem it fixes.

Two `**bold**` spans had to be reflowed to stop them crossing a hard line break
(the rule in `CLAUDE.md`); the suite's own `assets-emphasis` test caught both.
