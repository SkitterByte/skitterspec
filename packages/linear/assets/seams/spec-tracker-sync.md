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
- **Say what happened** in the skill's report: mirror updated, skipped as
  unlinked, or failed with the reason.

### Why it sits here

In `/spec-complete` and `/spec-cancel` this step is deliberately pinned
**after the `git mv` and before the commit**, and both halves matter:

- **After the move**, because the projection reads a spec's workflow state from
  its folder bucket. Push while the folder is still in `in-progress/` and the
  issue is set to the state the spec is *leaving*.
- **Before the commit**, because the push stamps ids into the spec and writes a
  snapshot under `specs/.core/`. The `git add specs/` that follows sweeps both up
  with the status change; push after it instead and those files are left
  uncommitted, which makes `spec-env integrate` refuse to land the branch.
