# Phase 5 — Docs, cross-skill wiring, dist build, end-to-end verify ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Make live overlay discoverable and correct end-to-end — cross-reference
it from the other skills, document when to use it vs `spec-connect`, propagate the
engine to the published distributions, and dogfood it on a real code-only spec.

## Tasks

- [ ] Update `packages/common/assets/rules/spec-planning.md` — document live overlay
      alongside per-spec isolation: the branch-as-lock model, `/spec-live <spec>` /
      `/spec-live main`, and the rule of thumb (overlay = light default for
      code-only specs; `spec-connect` + `worktree + docker` for stateful or
      parallel testing).
- [ ] Cross-reference from `/spec-connect` (mention the lighter overlay
      alternative) and `/spec-go` (after bringing a code-only spec up, `/spec-live`
      is available). Keep it brief — link, don't duplicate.
- [ ] Document the env.config surface added in v1 (optional `migrations.glob` used
      by the Phase 2 refusal) in `assets/core/env.config.md` + the `.example`.
- [ ] Run `pnpm build` (`scripts/build-dist.js all`) so `packages/skitterspec` and
      `packages/skitterspec-linear` carry the new `env/live.js`, `cli.js`, and the
      `spec-live` skill; confirm the dist copies match common.
- [ ] End-to-end verify (dogfood): with a real running dev server, take a
      code-only backlog/in-progress spec live (`/spec-live <name>`), confirm the
      primary checkout is on its branch and the app hot-reloads the change at the
      canonical URL; make a fix, then `/spec-live main` and confirm the branch is
      re-isolated to its worktree and the receipt cleared. Then exercise the
      refusals (stateful spec, second concurrent take, dirty tree) and `abort`.
- [ ] Add/confirm test coverage for anything surfaced by the verify run; full
      `pnpm test` green.

## Notes

The canonical engine lives in `packages/common`; the dist packages are byte-copies
built by `scripts/build-dist.js` — never hand-edit them. The dogfood run is the
real proof the branch-switch + guard behave on a live watcher, which unit tests
can't fully cover.
