<!--
Seam fragment for the "spec-tracker-sync" seam, injected wherever a shared skill
changes a spec's state or content and the mirror would otherwise go stale:
/spec-complete, /spec-cancel, /spec-review. The build injects this body (comment
stripped) when composing the skitterspec-azure-boards distribution; the base
distribution leaves the seam empty.

Placement is load-bearing in the two moving skills — see "Why it sits here".
-->

**Only when `specs/.core/azure-boards.config.json` exists** and the spec's
overview carries an `azure_identifier`. Either missing → **skip**, in one line
(`not linked to Azure Boards — /spec-push to mirror it`), and carry on. Nothing
else in this step changes.

**Refresh the mirror now, without asking.** Run `/spec-push`. The repo has just
become the truth about this spec's state, and the tracker is a generated mirror
of it — leaving them to diverge until someone remembers to push by hand is the
gap this exists to close. It costs one engine call and no model tokens when a
PAT is set (see `apply.transport` in `azure-boards.config.md`).

- **Never mint.** An unlinked spec is skipped, not created. A work item born
  `Done` is tracker noise, and a spec kept deliberately local should stay that
  way — `/spec-push` is how someone opts in.
- **Never fatal.** If the push fails — offline, no credentials, an Azure
  error — say so and **finish the operation anyway**. The spec is
  complete/cancelled/reviewed in the repo regardless; the mirror is disposable
  and the next push repairs it. Do not roll anything back, and do not stop to
  ask.
- **Say what happened** in the skill's report: mirror updated, skipped as
  unlinked, or failed with the reason.
- **There is no unassign step here.** The projection derives the assignee from
  the spec's lifecycle bucket, so the push this step already makes is what
  releases the work item; the `> **Developer:**` header stays put as the repo's
  own record of who actioned the work.

### Why it sits here

In `/spec-complete` and `/spec-cancel` this step is deliberately pinned
**after the `git mv` and before the commit**, and both halves matter:

- **After the move**, because the projection reads a spec's workflow state from
  its folder bucket. Push while the folder is still in `in-progress/` and the
  work item is set to the state the spec is *leaving*.
- **Before the commit**, because the push stamps ids into the spec and writes a
  snapshot under `specs/.core/`. Push after the commit instead and both are left
  uncommitted, which makes `spec-env integrate` refuse to land the branch.

The snapshot is reached **by name**, not by breadth. It is a declared
`spec.companionPaths` entry (`specs/.core/azure-base/{identifier}.base.json`),
so `spec-env stage` returns it among this spec's owned paths and the commit below
names it. This is why the commit no longer stages `specs/` wholesale: the one
file outside the spec's folder that had to be swept up is addressable, so the
breadth bought nothing and cost another session's work.
