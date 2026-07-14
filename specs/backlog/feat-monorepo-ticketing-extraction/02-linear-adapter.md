# Phase 2 — Extract the Linear adapter into `packages/linear` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** All Linear-specific code leaves `packages/common` and lives in a private
`packages/linear` adapter; `common` becomes sync-free. Proven by: `common` has no
`spec-sync` / `src/sync` / `linear.config`, and the ported Linear + engine-integration
tests pass across the workspace.

## Tasks

- [ ] Create `packages/linear` named **`@skitterbyte/skitterspec-provider-linear`**
      (`private: true`; deps `@skitterbyte/skitterspec-common` + `-sync-core`). Port
      from `feat/extract-ticketing-provider`: `src/mcp.js`, `src/config.js`
      (`loadLinearConfig`), `src/cli-sync.js` (the `spec-sync` handler), the 3 sync
      skills (`spec-pull/push/status`), `assets/core/linear.config.*`, and the seam
      fragments (`assets/seams/*`).
- [ ] Add the superset bin `bin/skitterspec-linear.js` — delegates every command to
      the base CLI, handles `spec-sync` via the adapter. Both requires are bare
      workspace specifiers (`@skitterbyte/skitterspec-common/src/cli.js`,
      `@skitterbyte/skitterspec-provider-linear/src/cli-sync.js`) so the Phase 4
      build rewrites them uniformly.
- [ ] Strip Linear from `packages/common`: remove the `spec-sync` dispatch + Linear
      help from `src/cli.js`, delete `src/sync/`, drop `assets/core/linear.config.*`
      and the `spec-pull/push/status` skills. `common` is now tracker-free (the
      base CLI doesn't know `spec-sync`).
- [ ] Move the Linear + engine-integration tests into `packages/linear`; keep the
      neutral engine tests in `sync-core`.
- [ ] Run `node --test` across the workspace — green. Confirm `grep -ri linear`
      is clean under `packages/common/src` and `packages/sync-core`.

## Notes

- Port target already exists and is proven — copy files, then re-point requires to
  the workspace package names. The rename to `-provider-linear` frees the published
  superset's name (`@skitterbyte/skitterspec-linear`) for Phase 4.
