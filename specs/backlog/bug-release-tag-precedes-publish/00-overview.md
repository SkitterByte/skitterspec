# Bug: a release is tagged before it publishes, so a failed publish leaves a phantom tag

> **Type:** Bug
> **Name:** bug-release-tag-precedes-publish (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Ready
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-08-28
> **Area:** scripts/release.js, scripts/release.test.js, RELEASING.md
> **Stack:** worktree

## Symptom

`skitterspec@16.3.1` is tagged and committed but was never published:

```
git tag | grep 16.3   →  skitterspec@16.3.0  @16.3.1  @16.3.2
npm view @skitterbyte/skitterspec versions
                      →  …, "16.3.0", "16.3.2"        ← 16.3.1 absent
```

`npm i @skitterbyte/skitterspec@16.3.1` gives ETARGET, and the tag list no
longer says what actually shipped. Nothing in the repo records the failure.

A **second, separate** defect shares the smell: `skitterspec-linear@9.1.0` was a
release in which nothing shipped. Across every input to its tarball the only
change was the version string:

```
packages/skitterspec-linear/package.json | 1 +-
```

A consumer has twice had to unpack published tarballs to tell an empty release
from a substantive one.

## Root cause

**Phantom tag.** `buildPlan` (`release.js:131`) emits the tag step at `:158` and
the publish step at `:159` — in that order. `sh` throws on a non-zero exit
(`:211`), so a failed `pnpm publish` aborts the run *after* `git tag` has already
committed the claim. The tag asserts a release that npm does not have, and
nothing reconciles the two afterwards.

**Empty release.** Nothing checks whether anything shippable changed. Any bump
level is accepted at any time, so a monorepo-wide sweep can carry a package along
that has no new content.

## Decisions

1. **Tag last.** Move the tag step after the publish step so the tag is only cut
   once the publish has succeeded. At `--yes` (local, no publish) the tag still
   runs — it is the last local step either way — so "I prep, you publish" is
   unchanged.
2. **Prefer a missing tag to a lying one.** If publish succeeds and tagging then
   fails, there is a published version with no tag. That is the better failure:
   npm is the installable artifact and a tag can be added afterwards, whereas a
   tag pointing at nothing has to be discovered by a consumer.
3. **Gate on the tarball's real inputs, not `packages/*/{src,assets,bin}`.**
   Those directories are **gitignored** — `build-dist.js` composes them at prepack
   — so a git diff over them is empty for every release and would report every
   release as empty. The inputs are the composing *source* packages plus each
   distribution's own committed files:
   - `skitterspec` ← `packages/common/**`, `packages/skitterspec/{package.json, README.md, MIGRATION.md}`
   - `skitterspec-linear` ← `packages/{common,linear,sync-core}/**`, `packages/skitterspec-linear/{package.json, README.md, MIGRATION.md}`
4. **Ignore the version bump itself when deciding emptiness.** Every release
   changes `package.json`; counting it would make every release look substantive.
   The check asks whether anything *other than the version line* changed.
5. **Refuse, don't warn, with an explicit escape.** An empty release is nearly
   always a mistake, and a warning in a release script is read after the fact.
   `--allow-empty` covers the deliberate version-alignment case and records the
   intent in the invocation.
6. **First release of a package is never empty.** With no prior tag there is
   nothing to diff against, so the check passes.
7. **Delete the phantom `skitterspec@16.3.1` tag rather than publishing it.**
   `16.3.2` is published and supersedes it; publishing 16.3.1 now would put
   superseded content on npm under a version consumers already learned is
   missing. The tag is **local-only** — origin's newest tag is
   `skitterspec@13.0.0` — so this is a local delete, not a remote rewrite.

## Solution overview

Reorder two `steps.push` calls in `buildPlan`. Then add a guard in the existing
`assertCleanTree`/`assertTagAvailable` idiom — a **pure** `assertShippableChange`
fed by an impure `changedInputs` helper that shells out to
`git diff --name-only <lastTag> HEAD -- <inputs>` — and wire `--allow-empty`
through `parseArgs`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Release step order | fix | tag is cut after a successful publish, not before |
| CLI command | add | `release … --allow-empty` for a version-alignment bump |
| CLI command | update | a release with no shippable change is refused |
| Engine | add | `TARBALL_INPUTS`, `lastTagFor`, `changedInputs`, `assertShippableChange` |
| Docs | update | `RELEASING.md` — the new ordering and the empty-release refusal |
| Repo state | fix | the phantom `skitterspec@16.3.1` tag is deleted |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Tag only after a successful publish | ⬜ | [01-tag-after-publish.md](01-tag-after-publish.md) |
| 2 | Refuse a release with nothing to ship | ⬜ | [02-refuse-empty-release.md](02-refuse-empty-release.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-28 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-08-28 — Raised from a consumer field report against 10.0.1.
- 2026-08-28 — The report attributed both defects to `16.3.1`, citing that its
  release commit's whole diff is `package.json`. That is true of **every** release
  commit by construction, so it does not distinguish empty from substantive.
  Measured between consecutive tags over tarball inputs instead: 16.3.1 shipped
  136 lines of `MIGRATION.md` and is a pure publish failure, while
  `skitterspec-linear@9.1.0` is the genuinely empty one. The two defects are real
  but belong to different releases.
- 2026-08-28 — Found while checking: tags from `14.0.0` onward have never reached
  origin (its newest is `skitterspec@13.0.0`). The phantom tag is therefore local
  only — but a `git push --tags` would publish it along with 25 others.
