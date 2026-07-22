# Phase 3 — Slim the surface ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the everyday surface is `spec → go → connect → commit → complete`;
provisioning/teardown are folded into the lifecycle skills, three skills are
deleted, and the breaking change is migrated + released `3.0.0` — proven by
updated init/skill-registry tests and a full lifecycle run.

## Tasks

- [ ] **Rewrite `/spec-go`** to be the "up" button: after promoting to
      in-progress, print the plan (worktree, ports, containers, per-process dev
      commands) and **confirm before heavy steps**; on yes, run `spec-env up`
      (worktree + optional docker), `spec-env dev up`, and `caddyUp()`. Add a
      `--plan` path that previews and stops. Accept a not-yet-`Ready` spec
      (confirm covers the blessing that `spec-ready` used to do).
- [ ] **Rewrite `/spec-complete` + `/spec-cancel`** to fold teardown: `spec-env
      dev down`, `spec-env down` (docker + worktree + free slot, existing guards),
      `caddyDown()`, then the existing move/record. Keep `integrate` (land the
      branch) in `/spec-complete`.
- [ ] **Fold `spec-ready` into `/spec`:** a fully-groomed spec is written with
      `Status: Ready` (not Draft); update the `/spec` skill + template and the
      `spec-planning.md` lifecycle description accordingly.
- [ ] **Delete the skills** `spec-env`, `spec-env-down`, `spec-ready` from
      `packages/skitterspec`, `packages/common`, `packages/skitterspec-linear`
      assets (and any symlinks); remove them from `src/init.js` `SKILLS`; drop
      their cross-references in `spec-planning.md` / README.
- [ ] Update `src/init.js` so `init` no longer scaffolds/registers the removed
      skills and does register `spec-connect`; keep the `spec-env` CLI engine.
- [ ] **`MIGRATION.md`** entry: map `spec-env`→(automatic in `spec-go`),
      `spec-env-down`→(automatic in `spec-complete`/`spec-cancel`),
      `spec-ready`→(folded into `/spec`); note the `dev`/`proxy` config additions
      and the `spec-connect` command. **Bump `2.0.1 → 3.0.0`** (all packages).
- [ ] Update `README.md` to lead with the 5-verb loop; document `dev`/`proxy`
      config and `spec-connect`.
- [ ] Tests: init no longer emits the three skills and does emit `spec-connect`;
      skill-registry/count assertions updated. Run typecheck + full suite green,
      then a manual full-lifecycle pass (spec → go(confirm) → connect → connect
      main → complete) on a UI/API fixture.

## Notes

Ordering: land Phases 1–2 (additive, non-breaking) first so the engine
capabilities exist before the skills start calling them; Phase 3 is the only
breaking phase and carries the version bump. The `spec-env` CLI verbs remain the
tested seam — only the *skills* are removed.
</content>
