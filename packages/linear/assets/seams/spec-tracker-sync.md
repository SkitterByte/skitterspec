<!--
Seam fragment for the "spec-tracker-sync" seam, injected wherever a shared skill
changes a spec's state or content and the mirror would otherwise go stale:
/spec-complete, /spec-cancel, /spec-review. The build injects this body (comment
stripped) when composing the skitterspec-linear distribution; the base
distribution leaves the seam empty.

Placement is load-bearing in the two moving skills — see "Why it sits here".
-->

**Only when `specs/.core/linear.config.json` exists** and the spec's overview
carries a `linear_identifier`. Either missing → **skip**, in one line
(`not linked to Linear — /spec-push to mirror it`), and carry on. Nothing else in
this step changes.

**Refresh the mirror now, without asking.** Run `/spec-push`. The repo has just
become the truth about this spec's state, and the tracker is a generated mirror
of it — leaving them to diverge until someone remembers to push by hand is the
gap this exists to close. It costs one engine call and no model tokens when a
Linear API key is set (see `apply.transport` in `linear.config.md`).

- **Never mint.** An unlinked spec is skipped, not created. An issue born `Done`
  or `Canceled` is tracker noise, and a spec kept deliberately local should stay
  that way — `/spec-push` is how someone opts in.
- **Never fatal.** If the push fails — offline, no key, a Linear error — say so
  and **finish the operation anyway**. The spec is complete/cancelled/reviewed in
  the repo regardless; the mirror is disposable and the next push repairs it.
  Do not roll anything back, and do not stop to ask.
- **In `/spec-complete`'s PR mode the Done waits for run 2.** Run 1 readies a
  PR, and a ready PR is not a merged one. Which run pushes depends on the
  `land.specDocs` lane:
  - **`trunk`** — skip it on run 1. Run 2 moves the spec on base, so it pushes
    there in this step's usual place, before its own commit.
  - **`branch`** — run 1 commits the move to ride the PR, so push **here**,
    holding the state: `spec-sync apply <spec> --plan <file> --hold-state`.
    Everything but the Done goes now, and the snapshot is written as if the
    Done had gone too, so it rides the PR. Run 2 sends it once the host has
    merged: `spec-sync apply <spec> --send-held`, which needs no plan and
    leaves the snapshot untouched. Over MCP, apply by hand and end run 1 with
    `spec-sync record <spec> --held`.

  The tracker's Done lands when the work does.
- **Say what happened** in the skill's report: mirror updated, skipped as
  unlinked, or failed with the reason.
- **There is no unassign step, and that is not an omission.** Where the repo owns
  `assignee`, the projection derives it from the spec's lifecycle
  bucket — so moving the folder to `complete`/`cancelled` is *itself* what
  releases the issue, and the push above carries it like any other field. The
  `linear_assignee_id` stamp and the `> **Developer:**` header both stay put:
  they record who actioned the work, which outlives who is holding it.
  Under `assignee: pull` the projection carries no assignee at all, so the
  issue keeps it: the board records who did the work.

### Why it sits here

In `/spec-complete` and `/spec-cancel` this step is deliberately pinned
**after the `git mv` and before the commit**, and both halves matter:

- **After the move**, because the projection reads a spec's workflow state from
  its folder bucket. Push while the folder is still in `in-progress/` and the
  issue is set to the state the spec is *leaving*.
- **Before the commit**, because the push stamps ids into the spec and writes a
  snapshot under `specs/.core/`. Push after the commit instead and both are left
  uncommitted, which makes `spec-env integrate` refuse to land the branch.

**PR mode keeps both halves by splitting the push across the runs.** In the
`branch` lane the commit happens in run 1, and run 2 only has the base branch,
where nothing is left to commit a snapshot to. An unsplit push there left a
modified snapshot on base after every completion. `--hold-state` writes run 2's
snapshot in run 1, and `--send-held` then moves only the state. If it says
nothing was held (a run 1 from before this), it sends the whole plan and names
the snapshot it leaves modified. Relay that line.

The snapshot is reached **by name**, not by breadth. It is a declared
`spec.companionPaths` entry (`specs/.core/linear-base/{identifier}.base.json`),
so `spec-env stage` returns it among this spec's owned paths and the commit below
names it. This is why the commit no longer stages `specs/` wholesale: the one
file outside the spec's folder that had to be swept up is addressable, so the
breadth bought nothing and cost another session's work.
