# Phase 2 — Refuse a release with nothing to ship ✅

> **Status:** Done

**Goal:** a bump whose tarball would be byte-identical to the last one is
refused, unless the operator says it is a deliberate version alignment.

## Tasks

- [x] Add `TARBALL_INPUTS` — per package, the source paths that compose its
      tarball plus its own committed files (Decision 3). Assert in a test that
      every key in `PACKAGES` has an entry, so a third distribution cannot be
      added without one.
- [x] Add a pure `lastTagFor(name, tags)` returning the highest existing tag for
      a package by semver, or null. Test it against an unsorted tag list and an
      empty one.
- [x] Add an impure `changedInputs(root, name, sinceTag)` shelling out to
      `git diff --name-only <sinceTag> HEAD -- <inputs>`, filtering out the
      package.json version-only change (Decision 4).
- [x] Add a pure `assertShippableChange(changed, { name, sinceTag, allowEmpty })`
      in the `assertCleanTree` idiom: throws naming the package and the tag it
      compared against, and points at `--allow-empty`.
- [x] Wire `--allow-empty` through `parseArgs`; assert it defaults to false and
      that the existing flags still parse.
- [x] Call the guard in `execute`, alongside `assertCleanTree` and
      `assertTagAvailable`, so it runs before anything is written.
- [x] Regression-test the two real cases from the field report: the
      `skitterspec-linear@9.0.0 → 9.1.0` input set is empty (refused), and the
      `skitterspec@16.3.0 → 16.3.1` one is not (allowed) — the second is the
      control that proves the guard does not over-fire.
- [x] Document the refusal and `--allow-empty` in `RELEASING.md`.
- [x] GREEN — full suite green. Commit with a `Release-Note:` — this changes
      what the release command accepts.
