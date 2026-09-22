# Bug: the Linear superset never declares the companionPath its own snapshot needs

> **Type:** Bug
> **Name:** bug-superset-undeclared-companion-path (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-22)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-21
> **Area:** `scripts/build-dist.js`, `packages/linear/src/config.js`, `packages/common/assets/core/env.config.md`
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

**Reported from `ereqs`**, verified against 17.3.0. It affects every fresh
Linear-superset install, not one project's configuration.

Not merely cosmetic: the paragraph above exists to stop the snapshot being left
uncommitted, *"which makes `spec-env integrate` refuse to land the branch."* With
the shipped defaults the operator is caught between two instructions — follow
`stage` and leave the snapshot foreign, so it stays uncommitted and `integrate`
refuses the land; or follow the skill and commit it anyway, overriding the engine
on every single lifecycle commit. In `ereqs` the second was taken, seven times on
one spec. A guard that must be overridden every time is one people stop reading.

## Root cause

The example config every install is seeded from is **provider-neutral**, and
correctly so — `packages/common/assets/core/env.config.json.example` ships both
keys empty, because the base engine must not know that any particular tracker
exists.

The Linear superset is the component that *writes* the snapshot
(`packages/linear/src/config.js`, `sync.baseDir: 'specs/.core/linear-base'`) and
the only one that knows the frontmatter field is `linear_identifier` — and it
declared neither. `scripts/build-dist.js` `buildLinear()` already overlays
`packages/linear/assets/core` onto the composed tree, but that tree carried no
override for the example, so the superset shipped the base's empty defaults
verbatim.

**Both keys or neither**, and this is the half that hides: `expandCompanion`
(`packages/common/src/env/classify.js`) expands `{identifier}` only when
`branch.identifierField` names a frontmatter field to read it from. A config
carrying `companionPaths` alone expands to nothing, matches nothing, and looks
applied while changing no behaviour.

## Failing test (red)

`scripts/build-dist.test.js` — four of the ten added tests were red:

- *the superset declares the two isolation keys its own snapshot needs*
- *the companion pattern is derived from where the snapshot is actually written*
- *a fresh superset install owns a spec's own Linear snapshot* — the acceptance
  criterion: `init --isolation` from the built superset into a temp project,
  then `spec-env stage feat-alpha --json` with nothing hand-edited in between.
- *another spec's snapshot, and an unrelated core file, stay foreign*

Run: `node --test scripts/build-dist.test.js`

Red before the fix:

```
✖ a fresh superset install owns a spec's own Linear snapshot
  + actual - expected
  + []
  - [ 'specs/.core/linear-base/ERQ-545.base.json' ]
```

## Fix

- [x] `packages/linear/src/config.js` exports `ENV_CONFIG_DEFAULTS` — the two
      isolation keys this provider needs declared, with the companion pattern
      **derived** from `DEFAULT_CONFIG.sync.baseDir` so it cannot drift from
      where the snapshot is actually written.
- [x] `scripts/build-dist.js` gains `mergeConfigDefaults`, merging them
      section-deep into the composed `env.config.json.example` in `buildLinear()`
      only. Merged, never replaced — a provider shipping its own copy of the file
      would pin every fresh install to the base example of the day it was taken.
- [x] The base distribution still ships both keys empty.
- [x] `env.config.md` gains a seam (`env-config-companion`) so the superset's own
      field reference says it seeds both keys, and the base says nothing.
- [x] `/spec-linear-setup` step 8b keeps the retrofit instructions and now opens
      by saying a fresh install already has them.
- [x] `packages/common/test/init-uncomposed-assets.test.js` — the guard's
      "e.g. <file>" assertion no longer pins one literal path (the new seam sorts
      ahead of it); it checks the named file exists and really carries a marker.
- [x] Failing tests now pass (GREEN); `node --test` clean — 3538 pass, 0 fail.

## Why not the obvious alternatives

- **Widening `classify.js`** to treat anything under `specs/.core/linear-base/`
  as owned: `classify.js` is deliberately exact, and a prefix match would hand
  one spec another spec's snapshot.
- **Setting the keys at install time from `init`**: `init.js` is tracker-free by
  design, and `env.config.json` is `PROTECTED_CONFIG` — written only when
  isolation is adopted, never on `update`. Filling blanks there would edit a
  committed, shared config on a re-sync.
- **Correcting only the skill text**: the cheap option, and it leaves every
  install still wrong.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | update | superset `env.config.json.example` — `branch.identifierField`, `spec.companionPaths` |
| Config key | add | `ENV_CONFIG_DEFAULTS`, `IDENTIFIER_FIELD` exported from `packages/linear/src/config.js` |
| Build step | add | `mergeConfigDefaults` in `scripts/build-dist.js` |
| Skill/rule | update | `/spec-linear-setup` step 8b — retrofit framing |
| Skill/rule | add | `env-config-companion` seam in `env.config.md` |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-21 | In Progress | in-progress | Reuben Greaves |
| 2026-09-22 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-21 — Bug reproduced against the built distributions; spec captured.
- 2026-09-22 — Fixed: the superset seeds both isolation keys into the
  `env.config.json.example` it ships, derived from `sync.baseDir`; tests green.
- 2026-09-22 — Completed; all phases done, tests green (3538 pass, 0 fail).
