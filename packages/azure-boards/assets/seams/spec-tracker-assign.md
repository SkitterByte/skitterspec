<!--
Seam fragment for the "spec-tracker-assign" seam, injected wherever a shared
skill has just decided WHO IS BUILDING a spec — beside the "Set Developer" step
in /spec-start, /spec-bug and /spec-hotfix. The build injects this body (comment
stripped) when composing the skitterspec-azure-boards distribution; the base
distribution leaves the seam empty.

Phase 4 of feat-azure-boards-provider replaces this fragment with the real
assignment flow once the kit's assignment seam exists.
-->

Assignment sync is **not yet wired for the Azure Boards provider**: the work
item's Assigned To is never read or written, and there is no `/spec-claim`
yet. The `> **Developer:**` header is still set by the base skill's own step —
that is the repo's record and it needs nothing from the tracker. Nothing to
run here.
