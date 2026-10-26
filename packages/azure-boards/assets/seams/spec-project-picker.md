<!--
Seam fragment for the "spec-project-picker" seam. Injected into the shared /spec
skill (after the tracker-link steps) AND into the /spec-push skill — the two
places a spec work item can be minted.
-->

Azure Boards has no project picker: a minted work item lands in the configured
`azure.project` by construction, decided once in
`specs/.core/azure-boards.config.json` (with `azure.areaPath` placing it inside
that project when set). There is nothing to ask.
