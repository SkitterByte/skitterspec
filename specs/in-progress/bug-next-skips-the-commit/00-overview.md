# Bug: a skill leaves the tree dirty, then tells you to run what refuses it

> **Type:** Bug
> **Name:** bug-next-skips-the-commit (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** packages/common/assets/skills/spec-next, packages/common/assets/skills/spec-bug, packages/common/assets/rules/spec-reports.md, packages/common/test

## Symptom

A phase finishes, the report's last row says `/spec-next → phase 2`, you type it,
and it refuses — because the phase you just built is still uncommitted.
