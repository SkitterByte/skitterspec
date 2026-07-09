# Phase 4 — Automatic provisioning wiring + config semantics + docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** The lifecycle skills and docs make worktree isolation the *default* and
Docker a per-spec escalation: `/spec` sets the `Stack` field, `/spec-go`
auto-provisions, the config master switch is documented, and every doc surface
reflects the new policy. This phase is mostly skill/doc prose over the engine
already built in Phases 1–3.

## Tasks

- [ ] **`/spec`** (`assets/skills/spec/SKILL.md`): in Phase A grill "does this
      touch the DB / stateful services?"; write `> **Stack:** worktree` (or
      `worktree + docker`) into the header template. Replace Phase D's "offer to
      run `/spec-env`" with "record the Stack decision (provisioning is automatic
      at `/spec-go`)".
- [ ] **`/spec-go`** (`assets/skills/spec-go/SKILL.md`): after the in-progress
      move, when `specs/.core/env.config.json` exists, auto-run `spec-env up`
      (worktree always; Docker iff `Stack: … docker`); print the worktree path +
      opener and document the model-A split (spec files edited in the primary
      checkout, code written in the worktree). Note `Stack` can be escalated here.
- [ ] **Config master switch** (Decision 5): update `assets/core/env.config.md`
      and `env.config.json.example` so `docker.enabled` reads as "Docker
      escalation available" (not "always Docker"); note the per-spec `Stack` field
      is what turns it on for a given spec.
- [ ] **Docs sweep**: update `assets/rules/spec-planning.md` (the isolation
      paragraph → default policy), `assets/claude-md-section.md`, and `README.md`
      ("Per-spec isolation" section) to describe worktree-default /
      Docker-on-escalation. Keep `/spec-env` documented as the manual escape hatch.
- [ ] Confirm no engine regressions: run `npm test` + typecheck green. (Skill/doc
      changes are prose — covered by the Phase 1–2 unit tests plus a manual
      `spec-env up` smoke on a `worktree` and a `docker` spec.)

## Notes

- `/spec-complete` and `/spec-cancel` keep their existing *offer* to tear down —
  no change needed beyond wording if the surrounding docs shift (Decision 6).
- Order matters: land Phases 1–3 (engine + init) before this phase so the skills
  wire onto behaviour that already works.
