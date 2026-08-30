# Use the packages locally without cutting a release

> **Type:** Feature
> **Name:** feat-local-dev-link (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-08-30)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-30
> **Area:** packages/skitterspec/package.json, packages/skitterspec-linear/package.json, scripts/build-dist.js, README.md
> **Stack:** worktree

## Problem

Testing a change in a real consuming project means publishing a version. That
puts a release between "I changed a skill" and "I can see whether it works", so
the only way to try something is to ship it to everyone first.

Linking the package locally is the obvious fix and it does not work today. Two
reasons, and the second is the one that wastes an afternoon:

1. **A link target is empty.** `bin/`, `src/` and `assets/` in both distributions
   are composed by `scripts/build-dist.js` and gitignored. The only build hook is
   **`prepack`**, which runs on `npm pack`/`publish` — *not* on install from a
   directory. So a fresh `link:` install produces a package with no binary and no
   assets, failing with a module-resolution error that names none of this.
2. **Half the product is copied, not linked.** `init` copies skills into the
   consumer's `.claude/skills/` (`init.js:222`). A linked package therefore gives
   live *code* and stale *skills* — the CLI updates, the skills do not, and the
   symptom is a change that appears to have no effect.

Nothing documents either. The README covers only this repo's own
`pnpm install`.

## Decisions

1. **Add `prepare` to both distributions.** It is the lifecycle hook that runs on
   install-from-directory, which is exactly the link case, and it also runs
   before `prepack` on publish — so one hook covers both and the build stays
   idempotent. Rejected: a bespoke `dev-link` command, which would be a second
   way to do what the package manager already does.
2. **Fail loudly when the build output is missing.** Even with `prepare`, a
   `git clean` or an interrupted build leaves a linked package broken. The bin
   should say *"run npm run build"*, not raise `MODULE_NOT_FOUND` on an internal
   path.
3. **`skitterspec update` is the skill-refresh step, and needs no `--force`.**
   `resync` overwrites managed files that are pristine and reports (never
   clobbers) ones the consumer customised — `init.js:428`. So the loop is
   safe by default. Documenting this is most of the fix: the behaviour is
   already right, it is just invisible.
4. **Document the recipe; script only the part that spans two repos.** The steps
   are `build` here and `update` there. A helper is worth it only for the
   directory switch, so it stays one small script rather than a workflow.

## Solution overview

```sh
# once, in the consuming project
pnpm add "@skitterbyte/skitterspec-linear@link:../skitterspec/packages/skitterspec-linear"

# each time you change something here
npm run dev:sync ../that-project     # build, then run its skitterspec update
```

`prepare` makes the first command produce a working package. `dev:sync` collapses
the two-repo round trip. Neither adds a code path to the shipped product —
`prepare` is a lifecycle hook and `dev:sync` is a repo script.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `prepare` script on both distribution package.jsons |
| CLI command | update | bin exits with a clear message when `src/` is missing |
| Script | add | `npm run dev:sync <consumer-dir>` |
| Docs | add | README: local dev-link recipe and its two footguns |

No change to published behaviour: `prepare` runs at install time, and a published
tarball already ships built.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Make a linked package build and fail clearly | ⬜ | [01-linkable-package.md](01-linkable-package.md) |
| 2 | The round-trip: dev:sync and the documented recipe | ⬜ | [02-sync-and-docs.md](02-sync-and-docs.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-30 | Ready | backlog | Reuben Greaves |
| 2026-08-30 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-30 — Spec created. Confirmed against the repo: both distributions carry
  `prepack` only; `init` copies skills rather than symlinking them; `resync`
  already updates pristine managed files without `--force`, so the refresh half
  of the loop needs documenting rather than building.
