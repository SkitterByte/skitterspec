---
github_issue_id: "#235"
---

# Phase 1 — Runner token in provider assets ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** provider skills, rules, seams and SETUP docs call the CLI through the
runner `detectRunner` picks, so they work from a global install.

## Tasks

- [x] Replace `pnpm exec skitterspec-<provider>` with
      `{{exec}} skitterspec-<provider>` in each provider's `assets/`
      (skills, rules, seams, core/SETUP.md).
- [x] Generalise `renderCommand` into a render applied to every installed
      text asset that carries the token, keeping it a pure function of
      (content, dir) so `managedTargets` hashes match.
- [x] Render the npx rungs safely: local npm → `npx --no-install <bin>`;
      none → `npx -p @skitterbyte/<distribution> <bin>` (the running
      distribution's package name). Applies to command files too, and to their
      `allowed-tools` patterns so the two stay consistent.
- [x] Add a build/test guard: no `pnpm exec skitterspec-` left in any
      provider source asset.
- [x] Tests: rendered output per rung (local pnpm, local npm, PATH, none);
      a pristine re-run reports no files as customized; no rendered output
      contains `npx skitterspec` without `--no-install` or `-p @skitterbyte/`. Run `pnpm test`.

## Notes

Seam fragments are composed at build time; the token must survive
composition untouched and be rendered at install.
