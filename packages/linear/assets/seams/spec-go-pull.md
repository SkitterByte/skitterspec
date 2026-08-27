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
- **Optional: refresh the mirror.** If you want Linear to reflect the now
  in-progress spec, run `/spec-push` to send it up. This is optional at
  `/spec-go` time — the mirror can equally be refreshed later.
- Linear's GitHub branch/PR automation may drive status transitions off the
  branch/PR you pushed in step 2; that's expected and the repo still wins on the
  next `/spec-push`.
