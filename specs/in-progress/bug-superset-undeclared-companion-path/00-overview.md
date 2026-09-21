# Bug: the Linear superset never declares the companionPath its own snapshot needs

> **Type:** Bug
> **Name:** bug-superset-undeclared-companion-path (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-21
> **Area:** `scripts/build-dist.js`, `packages/linear/src/config.js`, `packages/common/assets/core/env.config.json.example`
> **Stack:** worktree

## Symptom

The shipped `/spec-complete` skill asserts this as fact:

> The snapshot is reached **by name**, not by breadth. It **is a declared
> `spec.companionPaths` entry** (`specs/.core/linear-base/{identifier}.base.json`),
> so `spec-env stage` returns it among this spec's owned paths and the commit
> below names it.

Nothing in the Linear superset's install wires it. A fresh install ships
`branch.identifierField: ""` and `spec.companionPaths: []`, so the superset
writes `specs/.core/linear-base/<ID>.base.json` and then reports it **foreign**
to the very skill that was told it would be owned.

**Reported from `ereqs`**, verified against 17.3.0. Affects every fresh
Linear-superset install, not one project's configuration.

Not merely cosmetic: the paragraph above exists to stop the snapshot being left
uncommitted, "which makes `spec-env integrate` refuse to land the branch". With
the shipped defaults the operator is caught between following `stage` (leave it
foreign → `integrate` refuses) and following the skill (commit it anyway →
override the engine on every lifecycle commit). In `ereqs` the second was taken,
seven times on one spec.

## Root cause

The example config every install is seeded from is **provider-neutral**, and
correctly so — `packages/common/assets/core/env.config.json.example:29-35` ships
both keys empty. The Linear superset is the component that knows the snapshot
path and the frontmatter field, and it declares neither:
`scripts/build-dist.js` `buildLinear()` overlays `packages/linear/assets/core`
onto the composed tree, but that tree carries no override for the example, so
the superset ships the base's empty defaults verbatim.

## Failing test (red)

To be added in the worktree.

## Fix

- [ ] The superset's shipped `env.config.json.example` declares both keys.
- [ ] Failing test now passes (GREEN); `node --test` clean, no regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | update | superset `env.config.json.example` — `branch.identifierField`, `spec.companionPaths` |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-21 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-21 — Bug reproduced against the built distributions; spec captured.
