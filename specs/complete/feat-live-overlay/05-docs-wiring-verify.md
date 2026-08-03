# Phase 5 — Docs, cross-skill wiring, dist build, end-to-end verify ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Make live overlay discoverable and correct end-to-end — cross-reference
it from the other skills, document when to use it vs `spec-connect`, propagate the
engine to the published distributions, and dogfood it on a real code-only spec.

## Tasks

- [x] Update `packages/common/assets/rules/spec-planning.md` — added a "Live overlay
      (`/spec-live`)" paragraph: the branch-as-lock model, `/spec-live <spec>` /
      `/spec-live main`, and the rule of thumb (overlay = light default for
      code-only specs; `spec-connect` + `worktree + docker` for stateful/parallel).
- [x] Cross-reference from `/spec-connect` (lighter overlay alternative) and
      `/spec-go` (the connect bullet now points to `/spec-live` for code-only specs).
      Brief — linked, not duplicated.
- [x] Document the env.config surface — `live.migrations` in
      `assets/core/env.config.md` + the `.json.example`.
- [x] Run `pnpm build` (`scripts/build-dist.js all`) — both dist packages carry the
      new `env/live.js`, `cli.js`, and `spec-live` skill (byte-match with common
      verified). Dist `bin/src/assets` are gitignored build artifacts, so nothing to
      commit there.
- [x] End-to-end verify (dogfood) — drove the **built dist binary** through a full
      cycle in a throwaway repo: `status` (free) → `take` (primary switched to the
      branch, receipt written) → `status` (feature in control) → second `take`
      (blocked — lock held) → `release` (primary back on base, branch re-isolated,
      receipt cleared). Also verified live-aware `integrate` (ends the session then
      prints the normal rebase+ff plan) and `abort` (recovers; no-op when nothing
      live). All as expected. (This project has no dev server, so overlay warns
      "nothing to hot-reload" and switches — the branch-switch mechanics are what's
      proven; HMR is the host project's.)
- [x] Full `pnpm test` green — 373 pass, 0 fail.

## Notes

The canonical engine lives in `packages/common`; the dist packages are byte-copies
built by `scripts/build-dist.js` — never hand-edit them. The dogfood run is the
real proof the branch-switch + guard behave on a live watcher, which unit tests
can't fully cover.
