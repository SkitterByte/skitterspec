# Bug: /spec-next refuses though exactly one spec is provisioned

> **Type:** Bug
> **Name:** bug-next-refuses-the-only-spec (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-12
> **Area:** packages/common/assets/skills/spec-next/SKILL.md, packages/common/test
> **Stack:** worktree

## Symptom

`/spec-start feat-skill-report-contract` provisioned the worktree, moved the spec
to `in-progress`, stamped the developer, linked Linear (SKS-191) and committed —
all correct. The session was `cd`'d into the worktree, as the skill says.

The context was then cleared. A bare `/spec-next` refused:

```
no spec in flight — run /spec-start <name> to start one
```

…on a repo with exactly one provisioned worktree, which the engine resolves
without ambiguity:

```
$ pnpm exec skitterspec spec-env resolve
spec:       feat-skill-report-contract (in-progress)
worktree:   /Users/reubengreaves/code/skitterspec-wt/skill-report-contract
```

The operator had to re-supply context the repo already held.
