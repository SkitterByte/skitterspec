# Bug: relink reports nothing to do while a shipped skill is not linked

> **Type:** Bug
> **Name:** bug-relink-skips-the-unlinked (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** scripts/claude-relink.js, scripts/claude-links.test.js

## Symptom

`/spec-reviewed` shipped and landed on `main`, and typing it did nothing — twice.
`.claude/skills/spec-reviewed` did not exist, every other skill was linked, and
`pnpm relink` said `nothing to do — every shipped skill and rule is linked`.
The guard, `claude-links.test.js`, passed alongside it.
