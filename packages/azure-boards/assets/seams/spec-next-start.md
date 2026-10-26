<!--
Seam fragment for the "spec-next-start" seam in the shared /spec-next skill, injected
where the skill has just marked the phase in progress. The build injects this
body (comment stripped) when composing the skitterspec-azure-boards
distribution; the base distribution leaves the seam empty.

Placement is load-bearing. The Jira provider's fragment once sat BEFORE the
phase was marked 🔄, so the push it describes mirrored the state the phase was
leaving — every child sat in To Do for the whole build. See the placement tests
in packages/common/test/assets.test.js.
-->

**Only when `specs/.core/azure-boards.config.json` exists** and the spec
carries an `azure_identifier`. Otherwise skip this step — no config means zero
change.

- **No pull.** Azure Boards is a generated mirror in one-way sync, so there is
  nothing to bring down before building — the repo is already the source of
  truth. (A state a teammate moved in Boards is advisory only; `/spec-status`
  surfaces it. It is overwritten on the next push.)
- **Refresh the mirror now, without asking.** Run `/spec-push`. The spec has just
  moved to `in-progress` and its phase to `🔄` — both real state changes, and the
  tracker is a generated mirror of them. This holds under **both**
  `mapping.phases` modes, for different reasons:
  - `"subissue"` (the default) — the phase child items already exist, and this
    push is what moves the current one into its in-progress state. Skip it and
    every child sits in To Do until the spec completes.
  - `"deferred"` — the children do not exist yet, and this push is what mints
    them. Skip it and a started spec stays mirrored as a phase-less item.
- **Never mint the spec item.** An unlinked spec is skipped, not created —
  `/spec-push` is how someone opts in.
- **No assignee to backfill.** Assignment sync is not yet wired for the Azure
  Boards provider — there is nothing to stamp and nothing to ask, mid-build or
  ever (phase 4 of feat-azure-boards-provider changes this).
- **Never fatal.** If the push fails — offline, no credentials, an Azure
  error — say so and **carry on with the build**. The repo is correct
  regardless; the mirror is disposable and the next push repairs it.
- **Expect a dirty `specs/.core/` afterwards.** The push writes a base snapshot
  and stamps any new ids, and `/spec-next` does not commit. The next `/commit`
  sweeps it up with the phase's own work.
- Boards automation (service hooks, or the Boards↔GitHub app elsewhere) may
  drive state moves off the branch/PR you pushed in step 2; that's expected and
  the repo still wins on the next `/spec-push`.
