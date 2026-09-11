<!--
Seam fragment for the "spec-tracker-start" seam, injected where /spec-start has
just moved a spec into `in-progress/` and stamped its developer. The build
injects this body (comment stripped) when composing the skitterspec-linear
distribution; the base distribution leaves the seam empty.

Deliberately NOT the spec-tracker-sync fragment, for the same reason
spec-tracker-progress is not: sync's body argues at length that there is no
unassign step, because the bucket a spec moves INTO releases the issue. Here the
bucket being entered is `in-progress/` and the push is what *takes* the
assignment — the build would inject exactly backwards prose verbatim.

Placement is load-bearing — see "Why it sits here".
-->

**Only when `specs/.core/linear.config.json` exists** and the spec's overview
carries a `linear_identifier`. Either missing → **skip**, in one line
(`not linked to Linear — /spec-push to mirror it`), and carry on. Nothing else in
this step changes.

**Refresh the mirror now, without asking.** Run `/spec-push`. The spec has just
moved to `in-progress/` and been stamped with a developer — two real state
changes, and the tracker is a generated mirror of them. It costs one engine call
and no model tokens when a Linear API key is set (see `apply.transport` in
`linear.config.md`).

- **Never mint.** An unlinked spec is skipped, not created. A spec kept
  deliberately local should stay that way — `/spec-push` is how someone opts in.
- **Never fatal.** If the push fails — offline, no key, a Linear error — say so
  and **finish the operation anyway**. The spec is in flight in the repo
  regardless; the mirror is disposable and the next push repairs it. Do not roll
  the provisioning back, and do not stop to ask.
- **Say what happened** in the skill's report: mirror updated, skipped as
  unlinked, or failed with the reason.

### Why it sits here

Pinned **after the `git mv` and before the commit**, and both halves matter:

- **After the move**, because the projection reads a spec's workflow state from
  its folder bucket. Push while the folder is still in `backlog/` and the issue
  is set to the state the spec is *leaving*.
- **Before the commit**, because the push stamps ids into the spec and writes a
  snapshot under `specs/.core/`. The `git add` that follows sweeps both up with
  the status change; push after it instead and those files are left uncommitted —
  which strands a dirty worktree on the hand-off, and makes `spec-env integrate`
  refuse to land the branch.

### Why this is not the refresh `/spec-next` already runs

It was once reasoned that a push here would send the same thing twice, one commit
apart, because `/spec-next` refreshes the moment it starts. That holds only in
`checkout` mode, where `/spec-next` follows immediately. In `worktree` mode the
spec is built elsewhere and the refresh can be hours away or never come — and
until it does, the issue sits in its old workflow state with nobody assigned
while the repo reads `in-progress` with a developer on it.

The two pushes are not duplicates either way. This one carries the issue's
workflow state and its assignee; the one `/spec-next` runs carries phase 1
starting. Every other lifecycle skill mirrors the state change it makes, and this
is the seam that stops `/spec-start` being the exception.
