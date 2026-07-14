# Phase 1 — Monorepo skeleton on `main`; carve release-free `common` + `sync-core` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** A private npm-workspaces monorepo whose `packages/common` is `main`'s
current (release-tooling-free) base, plus a provider-neutral `packages/sync-core`
carved out of `src/sync/`. Proven by: `node --test` green across all workspaces.

## Tasks

- [ ] Convert the repo to **npm workspaces**: private root `package.json`
      (`workspaces: ["packages/*"]`, `test: node --test`, `build` placeholder), keep
      the root's **skittership dogfooding** (devDep `@skitterbyte/skittership`, the
      `scripts` symlink, `skittership.config.json`, the `changelog`/`releases`/`version`
      scripts). Root stays `private: true`.
- [ ] Create `packages/common` from `main`'s base: move `bin/`, `src/` (incl.
      `deprecate.js`, `env/`, `init.js`, `cli.js`, `prompts.js`, `config.js`),
      `assets/` (`skills/*` **without** a `commit` skill, `rules/spec-planning.md`
      **only**, `core/*`, `claude-md-section.md`), and its tests. Name it
      `@skitterbyte/skitterspec-common`, `private: true`. Confirm it ships **no**
      release tooling (no `assets/scripts`, no `commit-messages.md`).
- [ ] Create `packages/sync-core` (`@skitterbyte/skitterspec-sync-core`, private):
      port the neutral engine (`normalize/compare/base/pull/push/write/apply` +
      `index.js`) from `feat/extract-ticketing-provider`. `sync-core` knows no
      tracker; its tests use an inline neutral config fixture.
- [ ] Fix up cross-package `require`s and workspace symlinks (`npm install`); make
      sure `common`'s Linear code (still present this phase) resolves `sync-core`.
- [ ] Run `node --test` across the workspace — green before the phase is done.

## Notes

- This is a **port**, not a redesign: lift `sync-core` verbatim from the completed
  branch. The only `common` differences vs that branch are the release-tooling
  absences (already true on `main`) — verify, don't re-delete.
- Keep `main`'s `deprecate.js` + its `update` wiring intact inside `common`.
