# /spec-hotfix — tag-based hotfix lifecycle

> **Type:** Feature
> **Status:** In Progress — Phase 2 done, Phase 3 next
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-12
> **Area:** packages/common/assets/skills/spec-hotfix, packages/common/assets/skills/{spec-complete,spec-live}, packages/common/src/env/{resolve,provision,live,config,integrate}.js + new hotfix.js, packages/common/assets/rules/spec-planning.md, README
> **Stack:** worktree

## Problem

The lifecycle skills fork every spec's worktree from the tip of `main`. That's
right for features and ordinary bugs, but wrong for a **production hotfix**: prod
is running a *tagged* release (e.g. `v33.16.4`), not `main`, and the fix must be
built on **that** commit line, shipped as a new patch tag its CI/CD deploys, and
only *then* folded back into `main` for the next release. Today that flow is
hand-rolled: manual `git worktree add <tag>`, manual re-tag, manual cherry-pick —
no capture, no test-first discipline, no guard against `/spec-live` hot-reloading
an old-version branch onto the running dev server and breaking it. `/spec-hotfix`
makes the hotfix a first-class, test-first lifecycle with the tag mechanics baked
into the engine.

## Decisions

1. **First-class `Type: Hotfix`.** New `hotfix-<slug>` filename prefix,
   `> **Type:** Hotfix` header, `hotfix/<slug>` branch. Its lifecycle genuinely
   differs (fork from a tag; land by tag + cherry-pick, never fast-forward
   merge), so a distinct type keeps greps and skill logic clean. `resolve.js`
   learns the third prefix. *Rejected:* overloading `Type: Bug` with a marker —
   blurs the type convention and the completion routing.
2. **Base is a tag, passed as an argument.** `/spec-hotfix <tag> <name>`. The tag
   is recorded as `> **Base version:** <tag>` and the worktree forks from it. No
   config discovery command — the operator always knows/gives the prod tag.
3. **Fork-from-tag in the engine.** `spec-env up` forks the worktree from the
   spec's `Base version` (`git worktree add … -b hotfix/<slug> <tag>`) instead of
   from `main`. Non-hotfix specs are unchanged (still fork from base HEAD).
4. **Test-first, mirroring `/spec-bug`.** Reproduce with a failing test (RED) on
   the hotfix branch, capture a lean Hotfix spec, drive to GREEN. Work happens in
   the worktree, on `hotfix/<slug>`, never on `main`.
5. **Landing = new tag + cherry-pick, never fast-forward.** The **one
   `/spec-complete`** finishes a hotfix end-to-end (verify → update → move to
   `complete/` → land → teardown) — there is no separate completion skill; it
   just *lands differently*. At the land step the engine (a) auto patch-bumps the
   base tag (`v33.16.4 → v33.16.5`) and tags the
   hotfix branch head **locally** — the operator pushes it to trigger CI/CD (the
   skill **never** pushes; deploying to prod is the operator's call); and
   (b) cherry-picks the fix commits onto `main`. *Rejected:* rebase + `--ff-only`
   (the base tag predates `main`, so a fast-forward is impossible and would drag
   the whole old line onto `main`).
6. **Extra targets in v1.** Beyond the prod tag + `main`, the operator can name
   additional base tags (test/demo pinned to their own versions); each gets the
   same fix cherry-picked onto a throwaway worktree at that tag and re-tagged with
   its own patch bump. Targets are supplied at completion time (which version an
   env runs on drifts), with an optional default list in config.
7. **`/spec-live` always refuses a hotfix.** The branch is built on an old tag;
   checking it out under the running dev server risks schema/DB drift breaking the
   instance. Enforced in the `live` engine (by spec type), not just documented.
8. **Stack defaults to `worktree`, escalates to `+ docker`.** Same judgement as
   any spec — escalate when the fix touches stateful services (likely, given the
   old base). Stateful hotfixes test via `/spec-connect`; `/spec-live` is refused
   regardless.

## Solution overview

New skill + engine verbs, layered on the existing isolation engine:

- **Type plumbing** (`resolve.js`): `splitPrefix` accepts `hotfix`; `resolveSpec`
  reads `> **Base version:**` into `spec.baseRef`.
- **Fork-from-tag** (`provision.js` `planUp`): append `spec.baseRef` to the
  `git worktree add … -b <branch>` command when present.
- **Live refusal** (`live.js`): the `take` planner refuses when `spec.type ===
  'hotfix'`, with a clear reason.
- **Landing engine** (`hotfix.js`, new): `planHotfixLand` + a semver patch-bump
  helper. Emits, with no side effects and **no push**:
  - `git -C <worktree> tag <bump(baseRef)>` — the prod deploy tag.
  - per extra target `T`: provision a throwaway worktree at `T`, cherry-pick the
    fix range, `git tag <bump(T)>`, remove the worktree.
  - `git -C <primary> cherry-pick <baseRef>..<branch>` onto `main`.
  Conflict handling lives in the skill (attempt → abort → hand back), mirroring
  `integrate`.
- **Teardown** (`teardown.js`): a hotfix branch whose head is reachable from a
  tag (we just tagged it) counts as landed → safe to remove without `--force`
  even though it was never merged into `main`.
- **Config** (`config.js`): a `hotfix` block — bump strategy + optional default
  cherry-pick targets — over frozen defaults, opt-in like the rest.
- **Skills**: new `/spec-hotfix` (capture + red→green); `/spec-complete` routes a
  Hotfix spec to `hotfix land` instead of `integrate`; `/spec-live` documents the
  refusal. `spec-planning.md` gains the Hotfix type + a lifecycle-table row.

Tag grammar (bump helper): `^(?<prefix>\D*)(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?<suffix>.*)$`
→ increment `patch`, preserve `prefix`, drop any pre-release/build `suffix`; a tag
that doesn't parse, or a bumped tag that already exists, is a clear error.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Hotfix type + fork-from-tag provisioning + live refusal | ✅ | [01-type-and-provision.md](01-type-and-provision.md) |
| 2 | Landing engine: bump, tag, cherry-pick targets, teardown-by-tag, config | ✅ | [02-landing-engine.md](02-landing-engine.md) |
| 3 | Skills: /spec-hotfix, hotfix-aware /spec-complete, /spec-live note | ⬜ | [03-skills.md](03-skills.md) |
| 4 | Docs, rules, README, dist regeneration | ⬜ | [04-docs-and-dist.md](04-docs-and-dist.md) |

## Open questions

- [ ] None — resolved during grilling (2026-08-12).

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-12 | Ready | backlog | Reuben Greaves |
| 2026-08-12 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-12 — Spec created; design grilled to Ready (type/tag/landing/live
  decisions locked).
- 2026-08-12 — Clarified: `/spec-complete` is the single completion skill and
  handles hotfixes too, differing only at the land step (tag + cherry-pick vs
  fast-forward) and treating Hotfix like Bug for test verification. No separate
  completion command.
- 2026-08-12 — Phase 2 landed. Deviation from plan: teardown tracks a distinct
  `worktreeState.reachableFromTag` flag (not `merged: true`) so a tag-landed
  hotfix passes the unpushed guard *and* the branch drop switches to `git branch
  -D` (the deploy tag holds the commits) — `-d` would refuse the unmerged branch.
  Verified end-to-end on a throwaway repo (fork-from-tag, land, teardown-by-tag);
  the main cherry-pick conflicts when the fix overlaps moved base code, which is
  the expected abort-and-hand-back case the skill drives in Phase 3.
