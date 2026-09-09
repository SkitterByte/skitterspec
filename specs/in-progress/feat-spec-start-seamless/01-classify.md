---
linear_issue_id: "SKS-98"
---

# Phase 1 — Classify a dirty tree against one spec ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a pure function that answers "does every uncommitted path belong to this
spec?", and a config key that lets a provider declare its per-spec companions —
proven by tests that make it refuse, and by tests that make it refuse *quietly*
where the answer is unknowable.

## Tasks

- [x] Add `spec.companionPaths` to the frozen defaults in `src/env/config.js`
      (default `[]`), with the same `assign`-style validation the neighbouring keys
      use — a non-array or non-string entry is ignored, never fatal.
- [x] Document the key in `assets/core/env.config.md` and add it, commented, to
      `assets/core/env.config.json.example`.
- [x] Add `classifyDirtyTree(spec, dirtyPaths, config)` returning
      `{ owned, foreign }`. Owned = paths under the spec's own folder (whichever
      bucket it is in) plus each resolved `companionPaths` entry. Everything else is
      foreign.
- [x] Resolve `{slug}` and `{identifier}` in a companion pattern using the existing
      mechanism — `branch.identifierField` + `readFrontmatterField`
      (`src/env/resolve.js:138`). Reuse it rather than adding a second reader.
- [x] Make an unresolvable `{identifier}` match **nothing**, and say why in a
      comment beside the code, per `.claude/rules/negative-checks.md` §2 — name what
      would fool this lookup: a spec with no tracker id, or a project that never set
      `identifierField`, would otherwise have its snapshot swept into a commit it
      does not belong to.
- [x] Add `packages/common/test/env-classify.test.js` covering: clean tree → both
      lists empty; only the spec's folder dirty → all owned; folder + a resolved
      companion → all owned; one unrelated file → that file foreign, and the whole
      tree therefore refused; companion pattern with no resolvable identifier → the
      snapshot is foreign, not owned (the stays-silent case that keeps us from
      committing another spec's file); a *different* spec's folder dirty → foreign.
- [x] Run `node --test` — green before the phase is done.

## Notes

Nothing in this phase changes behaviour: it is a pure function plus an inert
config key. Phase 2 is where the planners start calling it.

**As built.** Three things differed from the plan, none of them a change of
intent:

- `classifyDirtyTree` lives in a new sibling, `src/env/classify.js`, rather than
  inside `provision.js` — the plan allowed either, and a module of its own is what
  the test file name already assumed.
- `readFrontmatterField` was private to `resolve.js`; it is now exported, since
  the plan requires reuse rather than a second reader.
- **A spec mid-move is dirty in two buckets at once.** `/spec-start` moves
  `backlog → in-progress`, so ownership is checked against the spec's folder in
  *every* bucket, not just its current one. Missing this would have refused the
  tree at exactly the moment phase 2 needs it to pass.
