# Phase 4 — Distributions, rename/v2, migration, asset-driven init ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Two self-contained, publishable distributions install cleanly:
`@skitterbyte/skitterspec` (tracker-free base, **v2.0.0**) and
`@skitterbyte/skitterspec-linear` (superset, **1.0.0**). Proven by a hermetic
build-and-install smoke test of each.

## Tasks

- [ ] Make `packages/common/src/init.js` **asset-driven**: discover skills / rules /
      `.core` templates from the bundled `assets/` tree (keep `SKILLS`/`RULES`
      exports). Base assets → base skills + `env.config.*`; superset assets → also
      the sync skills + `linear.config.*`. Preserve `main`'s `deprecate.js` update
      wiring untouched. Update `init.test.js` accordingly.
- [ ] Port `scripts/build-dist.js` (+ `scripts/build-dist.test.js`): compose
      `common` assets (seams empty for base, Linear fragments filled for superset),
      vendor the needed JS into each dist (`common` at src root; `sync-core` + adapter
      under `src/vendor/`), rewrite bare `@skitterbyte/skitterspec-*` requires to
      relative paths, and **guard** that none survive.
- [ ] Create `packages/skitterspec` (published, **2.0.0**) — `files: [bin, src,
      assets]`, dep `prompts` only, `prepack` → `build-dist.js skitterspec`. Commit
      only its `package.json` + `README`; gitignore the built `bin/src/assets`.
- [ ] Create `packages/skitterspec-linear` (published, **1.0.0**) — superset bin +
      vendored engine/adapter + filled seams + `linear.config.*`; dep `prompts` only;
      `prepack` → `build-dist.js skitterspec-linear`. Same commit/gitignore split.
- [ ] Write `MIGRATION.md` — v1→v2 split: no-op if you didn't use Linear; one
      install + re-`init` if you did; `specs/.core/linear.config.json` path unchanged;
      note the Linear-id branch naming now via `env.config.json`
      (`branch.identifierField: "linear_identifier"`). Point both dist READMEs at it.
- [ ] Root `npm run build` builds both; verify `npm pack --dry-run` for each ships
      the composed tree with no private-package dep.
- [ ] Add the hermetic smoke test: build each dist, copy it OUTSIDE the workspace
      (no `node_modules`), run its bin `init --yes` + (superset) `spec-sync status` —
      base has no sync skills / `spec-sync` unknown / seams inert; superset installs
      the sync skills + `linear.config.*`, `spec-sync` resolves the whole chain, seams
      filled. Run `node --test` — green before the phase is done.
- [ ] **After this lands on `main` and is verified green**, delete the superseded
      port source: `git branch -D feat/extract-ticketing-provider` and
      `git push origin --delete feat/extract-ticketing-provider` (and tear down its
      worktree via `/spec-env-down` if still provisioned). Nothing depends on it once
      this spec's code is on `main`.

## Notes

- "Self-contained `files`" is the crux: a published dist must have **no** runtime
  dependency on the private `common`/`sync-core`/`linear` packages — the build
  flattens their JS in and the guard enforces it.
- The smoke test runs outside `node_modules` (not a real `npm install`) so a
  surviving workspace require throws `MODULE_NOT_FOUND` — proving self-containment
  without registry/network flakiness. `npm pack --dry-run` covers tarball shape.
- Coordinate the base **v2** tag so downstream sees one coherent major.
