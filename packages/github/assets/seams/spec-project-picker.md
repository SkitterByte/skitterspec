<!--
Seam fragment for the "spec-project-picker" seam. Injected into the shared /spec
skill (after the tracker-link steps) AND into the /spec-push skill — the two
places a spec issue can be minted.
-->

GitHub has no project picker: a minted issue lands in the configured
`github.owner`/`github.repo`, on the one board `github.project` names — both
decided once in `specs/.core/github.config.json`. There is nothing to ask.
