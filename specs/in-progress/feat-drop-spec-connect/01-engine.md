---
github_issue_id: "#349"
---

# Phase 1 — Engine drops connect and the proxy ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** no engine path starts a proxy. `spec-env connect` is a stub that
points to `/spec-live`, and live's probe reads `live.host`. Tests prove it.

## Tasks

- [ ] Cancel `feat-connect-planner` with `/spec-cancel`, reason "superseded by
      epic-live-workbench".
- [ ] `cli.js`: replace `specEnvConnect` with a one-line stub that exits 0 and
      points to `/spec-live` (or `spec-env dev up <spec>` for the spec's own
      ports). Remove the proxy process descriptor and the `.spec-env/connected`
      handling.
- [ ] Delete `src/env/proxy.js` and its tests.
- [ ] `config.js`: add `live.host` (default `127.0.0.1`), read `proxy.host` as
      a fallback with a notice, and ignore the rest of `proxy` with a notice.
- [ ] `live.js` / `cli.js`: read `live.host` for `portsAnswering` and the
      `liveContext` URL. Reword the refusals that name `/spec-connect`: the
      hotfix refusal and `migrationsRefusal`'s worktree route both become
      `spec-env dev up <spec>` on the spec's own ports.
- [ ] Update the `cli-spec-env-*` and `env-*` tests that drove connect, and
      add a test for the stub.
- [ ] Add a stays-silent test: a config with no `proxy` key prints no notice.
- [ ] Run `pnpm build` and `pnpm test` until green.
