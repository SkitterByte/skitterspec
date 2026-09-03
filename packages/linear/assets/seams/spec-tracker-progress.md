<!--
Seam fragment for the "spec-tracker-progress" seam, injected wherever a shared
skill has just recorded progress WITHIN a spec — ticked tasks, flipped a phase to
✅ — rather than moving it between lifecycle buckets: /spec-go, /spec-bug,
/spec-hotfix. The build injects this body (comment stripped) when composing the
skitterspec-linear distribution; the base distribution leaves the seam empty.

Deliberately NOT the spec-tracker-sync fragment. That one documents a
git-mv-then-commit ordering these skills do not have, and the build would inject
that wrong prose verbatim.
-->

**Only when `specs/.core/linear.config.json` exists** and the spec carries a
`linear_identifier`. Either missing → **skip**, in one line
(`not linked to Linear — /spec-push to mirror it`), and carry on.

**Refresh the mirror now, without asking.** Run `/spec-push`. The repo has just
become the truth about this phase's progress, and progress is what the mirror
exists to show. Deferring it to `/spec-complete` is what makes every phase
sub-issue jump from Backlog straight to Done, with nothing visible in between.

- **Never mint.** An unlinked spec is skipped, not created.
- **Never fatal.** If the push fails — offline, no key, a Linear error — say so
  and **finish the operation anyway**. The phase is done in the repo regardless;
  the mirror is disposable and the next push repairs it.
- **Expect a dirty `specs/.core/` afterwards.** The push writes a base snapshot
  and stamps any new ids, and these skills do not commit. The next `/commit`
  sweeps it up with the phase's own work.
- **Say what happened** in the skill's report: mirror updated, skipped as
  unlinked, or failed with the reason.
