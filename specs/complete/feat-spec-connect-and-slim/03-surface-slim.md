# Phase 3 — Slim the surface ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the everyday surface is `spec → go → connect → commit → complete`;
provisioning/teardown are folded into the lifecycle skills, three skills are
deleted, and the breaking change is migrated + released `3.0.0` — proven by
updated init/skill-registry tests and a full lifecycle run.

## Tasks

- [x] **Rewrite `/spec-go`** to be the "up" button: added step 2b (show the plan,
      **confirm before heavy steps**, run `spec-env dev up`; `--plan` previews and
      stops; connecting is a separate `/spec-connect`). Accepts a not-yet-`Ready`
      spec. Also dropped the leftover `/compact` nudge on this branch.
- [x] **Rewrite `/spec-complete` + `/spec-cancel`** to fold teardown: disconnect
      the proxy if connected (`spec-env connect main`), `spec-env dev down`, then
      `spec-env down` (existing guards). `integrate` retained in `/spec-complete`.
- [x] **Fold `spec-ready` into `/spec`:** `/spec` now writes `Status: Ready` (or
      Draft if open questions are left); updated the template, lifecycle text, and
      `spec-planning.md` + `claude-md-section.md`.
- [x] **Delete the skills** `spec-env`, `spec-env-down`, `spec-ready` (asset dirs
      in `packages/common` + their git-tracked `.claude/skills` symlinks; the built
      `skitterspec`/`skitterspec-linear` copies regenerate). Added the
      `spec-connect` symlink. Dropped their cross-references across the rules/docs.
- [x] Update `src/init.js`: skills auto-discover via `listSkills()` (the three
      drop out, `spec-connect` appears); trimmed the "Skills resolve as …" notice.
      The `spec-env` CLI engine is untouched.
- [x] **`MIGRATION.md`** v2→v3 entry (removed-skill → replacement table, new
      `/spec-connect` + `dev`/`proxy` config). **Bumped** `skitterspec` 2.0.1 →
      **3.0.0** and `skitterspec-linear` 1.0.0 → **2.0.0** (both breaking); updated
      the `publish:*` script versions. (Private root/common stay `0.0.0`.)
- [x] Updated the base `README.md` to lead with the 5-verb loop + a `/spec-connect`
      section documenting `dev`/`proxy`.
- [x] Tests: rewrote the init assertion (three skills absent, `spec-connect`
      present) and the `/add-dir` assets test (now `/spec-go` only). **Full
      workspace green: common 145, sync-core 33, linear 26 — 0 fail.** Build
      composes both distributions correctly (3 skills gone, `spec-connect` in).
      (Engine e2e — `dev up`→`connect`→`connect main` — was proven in Phase 2.)

## Notes

Ordering: land Phases 1–2 (additive, non-breaking) first so the engine
capabilities exist before the skills start calling them; Phase 3 is the only
breaking phase and carries the version bump. The `spec-env` CLI verbs remain the
tested seam — only the *skills* are removed.

**Deviations:** the teardown/proxy steps use `spec-env connect main` + `spec-env
dev down` (the Phase 2 Node proxy), not the planned `caddyDown()`. Versioning:
"3.0.0 all packages" was applied as **`skitterspec` 3.0.0** and **`skitterspec-
linear` 2.0.0** (each versions independently; both are breaking), with the private
root/common packages left at `0.0.0` (never published). `/spec-go`'s dev-server
bring-up is a no-op when `dev` is empty, so pure-engine specs (like this one) are
unaffected.
</content>
