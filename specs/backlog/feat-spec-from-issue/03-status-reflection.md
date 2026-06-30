# Phase 3 — Outbound status reflection in lifecycle skills ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Lifecycle transitions mirror state + a comment back to the source
issue, guarded by a `Source` field and best-effort (never blocking the spec).

## Tasks

- [ ] Add `src/status.js`: `mapStatus(profile, lifecycleStatus)` → provider state
      string from `profile.status`; throws a clear error on an unknown status.
- [ ] Extend `src/cli.js`: `issue map-status <LifecycleStatus>` prints the mapped
      provider state (exit non-zero + message if unmapped). Consumed by the
      lifecycle skills.
- [ ] Add a **reflection clause** to `assets/skills/spec-go/SKILL.md`
      (→ `InProgress`), `assets/skills/spec-complete/SKILL.md` (→ `Complete`), and
      `assets/skills/spec-cancel/SKILL.md` (→ `Cancelled`):
  - Guard: only if the spec's `00-overview.md` carries a `> **Source:**` field.
  - Resolve the provider state via `skitterspec issue map-status <status>`.
  - Set the issue state + post a comment via the profile's `tools.setState` /
    `tools.comment` MCP tools.
  - **Best-effort:** on any failure, warn and continue — the spec transition must
    still complete.
- [ ] Add tests (`node --test`): `test/status.test.js` (mapping + unknown-status
      error); extend `test/init.test.js` to assert the updated lifecycle skill
      assets still install.
- [ ] Run `npm test` — all green before the phase is done.

## Notes

The package CLI only resolves the **mapping** (`issue map-status`) — it has no MCP
access itself. The actual state/comment writes are made by Claude inside the skill
via MCP, which is why reflection lives as a clause in the markdown skills rather
than in `src/`. Future phase (out of v1 scope): automated intake — a scheduled
agent polling `triageTag` to draft Draft specs; and a Linear profile to prove the
adapter swap.
