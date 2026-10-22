<!--
Seam fragment for the "spec-tracker-assign" seam, injected wherever a shared
skill has just decided WHO IS BUILDING a spec — beside the "Set Developer" step
in /spec-start, /spec-bug and /spec-hotfix. The build injects this body (comment
stripped) when composing the skitterspec-github distribution; the base
distribution leaves the seam empty.
-->

Assignment sync is **not yet supported by the GitHub provider**: the issue's
assignee is never read or written, and there is no `/spec-claim`. The
`> **Developer:**` header is still set by the base skill's own step — that is
the repo's record and it needs nothing from the tracker. Nothing to run here.
