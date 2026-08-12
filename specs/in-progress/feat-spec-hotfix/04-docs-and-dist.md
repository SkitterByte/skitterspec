# Phase 4 — Docs, rules, README, dist regeneration ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Document the hotfix lifecycle everywhere the other skills are
documented, regenerate the published distributions from `common`, and confirm the
whole suite is green.

## Tasks

- [ ] `packages/common/assets/rules/spec-planning.md`:
      - Add a `/spec-hotfix` row to the lifecycle-skills table (Purpose: tag-based
        hotfix, red→green on a tag-forked worktree; Status: In Progress; Folder:
        in-progress).
      - Extend the "Spec types" section: `Hotfix` is a third type —
        `> **Type:** Hotfix`, filename prefix `hotfix-<name>`, greppable
        (`grep -rl 'Type:.*Hotfix' specs/`).
      - One line in the isolation paragraph: hotfixes fork from a tag and land by
        tag + cherry-pick (never fast-forward); `/spec-live` refuses them.
- [ ] `specs/.core/env.config.json` field docs (the `env.config.md` doc / README
      section that documents the config shape): document the new `hotfix` block
      (`bump`, `targets`, `cherryPickMain`).
- [ ] `README.md`: add `/spec-hotfix` to the skill list / lifecycle overview
      alongside `/spec-bug`, with a one-line description of the tag-based flow.
- [ ] Verify the build: `pnpm build` (`node scripts/build-dist.js all`). The built
      `packages/skitterspec*/{assets,src,bin}` dirs are **gitignored** (regenerated
      at `prepack`, never committed) — so this is a verification step, not a commit.
      Confirm `spec-hotfix` + the engine changes appear in both trees and the
      no-workspace-require guard passes. (`scripts/build-dist.test.js`, added in
      Phase 3, already asserts `spec-hotfix` installs from both distributions.)
- [ ] Run the full `pnpm test` from the root — every package green.
- [ ] Sanity-check the composed skill list: `/spec-hotfix` present in the base and
      Linear distributions; no dangling seam markers.

## Notes

- Distribution `assets`/`src`/`bin` are build outputs — edit only the `common`
  (and, for the Linear overlay, `linear`) sources; never hand-edit the built
  copies. `pnpm build` regenerates them deterministically.
- Version bumps / changelog entries for the packages are release-time concerns
  (`npm version` / `scripts/release.js`), out of scope for this spec.
