# Phase 4 — Automatic provisioning wiring + config semantics + docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** The lifecycle skills and docs make worktree isolation the *default* and
Docker a per-spec escalation: `/spec` sets the `Stack` field, `/spec-go`
auto-provisions, the config master switch is documented, and every doc surface
reflects the new policy. This phase is mostly skill/doc prose over the engine
already built in Phases 1–3.

## Tasks

- [x] **`/spec`** (`assets/skills/spec/SKILL.md`): Phase A item 9 grills "does this
      touch the DB / stateful services?"; the header template carries
      `> **Stack:** worktree` (escalate to `worktree + docker`). Phase D now records
      the Stack decision (provisioning is automatic at `/spec-go`) instead of
      offering `/spec-env`.
- [x] **`/spec-go`** (`assets/skills/spec-go/SKILL.md`): section 2 provisions
      `spec-env up` first when `env.config.json` exists (worktree always; Docker iff
      `Stack: … docker`), prints the worktree path + opener, and does the
      backlog→in-progress move + header edits + code **on the branch in the
      worktree** (Decision 3's branch-based housekeeping — **not** the stale
      "model-A split" this task originally described; corrected below). Notes Stack
      can be escalated, push fires Linear, and subsequent runs happen from the
      worktree.
- [x] **Config master switch** (Decision 5): `assets/core/env.config.md` now
      documents `docker.enabled` as "Docker escalation available" (not "always
      Docker") and notes the per-spec `Stack` field turns it on. The
      `env.config.json.example` is strict JSON (copied verbatim to the parsed live
      config) so it can't carry comments — its `enabled: true` is already correct
      under the new semantics; the prose lives in `env.config.md`.
- [x] **Docs sweep**: updated `assets/rules/spec-planning.md` (isolation paragraph
      → default policy), `assets/claude-md-section.md`, and `README.md`
      ("Per-spec isolation" section + `--isolation` in the options list) to describe
      worktree-default / Docker-on-escalation. `/spec-env` kept as the manual engine.
- [x] Confirm no engine regressions: `npm test` → 128/128 green (no typecheck
      script; plain CommonJS) + manual `spec-env up` smoke on a `worktree` and a
      `docker` spec (Phase 2) and `init --isolation` (Phase 3).

## Notes

- `/spec-complete` and `/spec-cancel` keep their existing *offer* to tear down —
  no change needed beyond wording if the surrounding docs shift (Decision 6).
- Order matters: land Phases 1–3 (engine + init) before this phase so the skills
  wire onto behaviour that already works.
