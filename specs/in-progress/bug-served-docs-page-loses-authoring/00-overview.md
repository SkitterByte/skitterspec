# Bug: a served docs page loses its authoring buttons

> **Type:** Bug
> **Name:** bug-served-docs-page-loses-authoring
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** `packages/common/src/env/serve.js`

## Symptom

A spec authored by `/spec` is served as a **worktree** view rather than a
**docs** view, so its page offers the committing button set — `Commit &
Continue` — instead of the authoring set `Commit & Start` / `Commit`.
