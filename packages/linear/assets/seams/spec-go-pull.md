<!--
Seam fragment for the "spec-go-pull" seam in the shared /spec-go skill.
The build injects this body (comment stripped) when composing the
skitterspec-linear distribution; the base distribution leaves the seam empty.
Lifted verbatim from the pre-extraction /spec-go "step 3b".
-->

**Only when `specs/.core/linear.config.json` exists** and the spec carries a
`linear_project_id` in its `00-overview.md` frontmatter. Otherwise skip this
step — no config means zero change to the flow below.

- **Run `/spec-pull` first.** Bring down anything Linear changed since the last
  sync (status, priority, discussion-driven fields) so you build against the
  current shared state, not a stale snapshot. On a conflict it refuses — relay
  that and let the user resolve before continuing; do not `--force` for them.
- **Commit the refreshed snapshot** into the feature branch (a small
  `chore(spec): pull latest from Linear`-style commit) so the frozen spec rides
  in the PR alongside the code it describes.
- Linear's GitHub branch/PR automation may now drive status transitions off the
  branch and PR you pushed in step 2 — expect state to move on the Linear side;
  keep any manual status edits minimal to avoid fighting it.
