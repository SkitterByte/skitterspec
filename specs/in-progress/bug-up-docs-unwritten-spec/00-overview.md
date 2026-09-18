# Bug: `spec-env up --docs` cannot provision an unwritten spec

> **Type:** Bug
> **Name:** bug-up-docs-unwritten-spec (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** packages/common/src/cli.js, packages/common/src/env/resolve.js, packages/common/src/env/provision.js
> **Stack:** worktree

## Symptom

`/spec`'s Phase B says: after grilling, run `skitterspec spec-env up <name>
--docs`, cd into the worktree, and write the spec there — "no chicken-and-egg
on the slug" (feat-main-is-a-landing-zone, phase 2). In practice, for a spec
that does not exist on disk yet:

```
$ skitterspec spec-env up feat-docs-site-restructure --docs
skitterspec-linear: spec not found under specs/**: feat-docs-site-restructure (searched: …)
```

The author-in-worktree flow is unreachable. The observed fallback — writing
the spec in the primary checkout so `up` can resolve it — makes the gate
commit the spec **straight onto main** before forking, so nothing uncommitted
remains, the C2 authoring page renders nothing, and the spec lands on main
unreviewed: exactly what feat-main-is-a-landing-zone exists to prevent.
