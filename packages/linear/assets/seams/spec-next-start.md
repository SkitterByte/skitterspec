<!--
Seam fragment for the "spec-next-start" seam in the shared /spec-next skill, injected
where the skill has just marked the phase in progress. The build injects this
body (comment stripped) when composing the skitterspec-linear distribution; the
base distribution leaves the seam empty.

Placement is load-bearing. This fragment used to sit in step 3b, BEFORE the phase
was marked 🔄, so the push it describes mirrored the state the phase was leaving
— every sub-issue sat in Backlog for the whole build. See the placement tests in
packages/common/test/assets.test.js.
-->

**Only when `specs/.core/linear.config.json` exists** and the spec carries a
`linear_identifier`. Otherwise skip this step — no config means zero change.

- **No pull.** Linear is a generated mirror in one-way sync, so there is nothing
  to bring down before building — the repo is already the source of truth. (A
  workflow-state a teammate moved in Linear is advisory only; `/spec-status`
  surfaces it. It is overwritten on the next push.)
- **Refresh the mirror now, without asking.** Run `/spec-push`. The spec has just
  moved to `in-progress` and its phase to `🔄` — both real state changes, and the
  tracker is a generated mirror of them. This holds under **both**
  `mapping.phases` modes, for different reasons:
  - `"subissue"` (the default) — the phase sub-issues already exist, and this
    push is what moves the current one into its in-progress state. Skip it and
    every sub-issue sits in Backlog until the spec completes.
  - `"deferred"` — the sub-issues do not exist yet, and this push is what mints
    them. Skip it and a started spec stays mirrored as a phase-less issue.
- **Never mint the spec issue.** An unlinked spec is skipped, not created —
  `/spec-push` is how someone opts in.
- **Backfill a missing assignee silently; never ask.** Only when
  `sync.fieldOwnership` includes `assignee`. If the spec records nobody and
  `skitterspec spec-sync whoami --json` answers, stamp it with
  `skitterspec spec-sync assign <spec> --to <id> --name "<name>"` and let the
  push above carry it. If identity is unknown, skip it in silence.
  **Do not prompt**: an assignment question in the middle of a build is an
  interruption with no deadline, and `/spec-claim` answers it whenever the
  operator likes.
- **A spec assigned to someone else is left alone.** Say so once
  (`assigned to <name> — /spec-claim to take it`) and change nothing. Picking up
  a colleague's spec is a decision, not a side effect of running the next phase.
- **Never fatal.** If the push fails — offline, no key, a Linear error — say so
  and **carry on with the build**. The repo is correct regardless; the mirror is
  disposable and the next push repairs it.
- **Expect a dirty `specs/.core/` afterwards.** The push writes a base snapshot
  and stamps any new ids, and `/spec-next` does not commit. The next `/commit`
  sweeps it up with the phase's own work.
- Linear's GitHub branch/PR automation may drive status transitions off the
  branch/PR you pushed in step 2; that's expected and the repo still wins on the
  next `/spec-push`.
