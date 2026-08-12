# Phase 2 — Landing engine: bump, tag, cherry-pick targets, teardown-by-tag, config ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** A pure `spec-env hotfix land <spec>` planner that emits the exact
side-effect-free, **never-pushing** commands to (a) tag the hotfix branch with the
patch-bumped base tag, (b) cherry-pick the fix onto each extra target tag and
re-tag it, and (c) cherry-pick the fix onto `main` — plus teardown that treats a
tagged hotfix branch as landed. Proven by unit tests.

## Tasks

- [x] New `packages/common/src/env/hotfix.js`:
      - `bumpPatch(tag)` — parse `^(?<prefix>\D*)(\d+)\.(\d+)\.(\d+)(?<suffix>.*)$`,
        increment patch, preserve prefix, drop suffix; throw a clear Error on an
        unparseable tag.
      - `planHotfixLand(spec, config, ctx)` where `ctx = { base, mainRepoPath,
        worktreeState:{dirty}, aheadOfBase, fixRange, extraTargets, existingTags,
        worktreeRoot }`. Blocks on a dirty worktree (commit completion first);
        no-op when nothing is ahead of the base tag. Otherwise emits, in order:
        - `git -C <worktree> tag <bump(baseRef)>` (prod deploy tag),
        - per extra target `T`: `git worktree add <tmp> -b hotfix/<slug>-<Tslug> <T>`,
          `git -C <tmp> cherry-pick <fixRange>`, `git -C <tmp> tag <bump(T)>`,
          `git worktree remove <tmp>` (+ branch cleanup),
        - `git -C <mainRepoPath> cherry-pick <fixRange>` (onto `main`).
      - Refuse (clear Error) any target whose bumped tag is already in
        `existingTags`.
- [x] `cli.js`: wire `spec-env hotfix land <spec> [--also <tag>]...`. The CLI does
      the impure git reads (resolve `fixRange` = `<baseRef>..<branch>`, list
      `existingTags`, `worktreeState`, `aheadOfBase`, `mainRepoPath`) and prints
      the plan under headings matching `integrate`'s output style. Extra targets:
      `--also` flags, falling back to `config.hotfix.targets`.
- [x] `config.js`: add a frozen `hotfix` default block —
      `{ bump: 'patch', targets: [], cherryPickMain: true }` — plus `mergeConfig`
      handling (lenient, like `live`/`dev`) and a `defaults()` entry.
- [x] `teardown.js` / `worktreeGitState`: a hotfix branch whose head commit is
      reachable from a tag (`git tag --points-at <head>` non-empty) counts as
      landed → `merged: true`, so `spec-env down` needs no `--force` and deletes
      the branch (commits survive under the tag). Non-hotfix behaviour unchanged.
- [x] Add tests: `bumpPatch` (prefix preserved, suffix dropped, bad tag throws);
      `planHotfixLand` command shape for prod-only, with extra targets, and the
      main cherry-pick; dirty/no-op/duplicate-tag guards; config loader parses the
      `hotfix` block and defaults it when absent; teardown treats a tagged hotfix
      branch as safe.
- [x] Run `pnpm test` — green before the phase is done. **258 pass, 0 fail.**

## Notes

- Mirror `integrate.js`: pure planner here, conflict handling in the skill
  (Phase 3) — the planner never reasons about cherry-pick conflicts.
- **Never emits a `git push`** — pushing the deploy tag is the operator's step.
- Extra-target worktrees are throwaway (created and removed within the plan) so
  the primary checkout and the hotfix worktree stay untouched.
