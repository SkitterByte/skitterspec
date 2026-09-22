<!--
Seam fragment for the "spec-project-picker" seam. Injected into the shared /spec
skill (after the tracker-link steps) AND into the /spec-push skill — the two
places a spec issue can be minted.
-->

Jira has no project picker: a minted issue lands in the configured
`jira.projectKey` by construction, decided once in `specs/.core/jira.config.json`.
There is nothing to ask.
