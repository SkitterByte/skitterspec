<!--
Seam fragment for the "spec-go-pull" seam in the shared /spec-go skill.
The build injects this body (comment stripped) when composing the
skitterspec-linear distribution; the base distribution leaves the seam empty.
One-way sync: there is nothing to pull — the repo is the source of truth.
-->

**Only when `specs/.core/linear.config.json` exists** and the spec carries a
`linear_identifier`. Otherwise skip this step — no config means zero change.

- **No pull.** Linear is a generated mirror in one-way sync, so there is nothing
  to bring down before building — the repo is already the source of truth. (A
  workflow-state a teammate moved in Linear is advisory only; `/spec-status`
  surfaces it. It is overwritten on the next push.)
- **Refresh the mirror.** Run `/spec-push` to send the now in-progress spec up.
  Whether that is optional depends on `mapping.phases`:
  - `"subissue"` (the default) — **optional**. The phase sub-issues already
    exist; this push only moves their states. Refresh now or later.
  - `"deferred"` — **do it now, without asking.** Under deferral a spec sitting
    in the backlog is mirrored as the issue alone, and this push is what mints
    its phase sub-issues. Skip it and a started spec stays mirrored as a
    phase-less issue until someone happens to run `/spec-push` by hand. Run it
    straight after the step-2 commit, so the sub-issues land with the same
    branch push that fires the tracker's automation.
- Linear's GitHub branch/PR automation may drive status transitions off the
  branch/PR you pushed in step 2; that's expected and the repo still wins on the
  next `/spec-push`.
