---
linear_issue_id: "SKS-88"
---

# Phase 2 — Build /spec-start ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-start <name>` puts a spec in flight on this checkout — or
refuses, naming what is in flight and the ways out.

## Tasks

- [x] Create `packages/common/assets/skills/spec-start/SKILL.md`:
      **the gate first** — this checkout must be on base with a clean tree and
      nothing in flight; otherwise relay the refusal (name the in-flight spec;
      offer `/spec-complete`, `/spec-cancel`, `/spec-live main`) and stop.
      Never park, stash or switch to get past it.
- [x] Worktree mode: run `spec-env up` + provisioning + bootstrap (unchanged),
      then take the branch live (`spec-env live take` — Phase 3 wires the
      composed path), then housekeeping in the primary on the branch: `git mv`
      to in-progress, headers, State-log row, tracker refresh, commit. Then
      flow straight into `/spec-next` in this session.
- [x] Checkout mode: today's flow renamed — the printed `git switch`,
      housekeeping, flow into `/spec-next`.
- [x] Live-refused spec (stateful/migrations): provision + housekeeping via
      `git -C <worktree>`, leave the branch parked, run `open.command` if set,
      print the path and "run `/spec-next` from a session there". Relay the
      engine's refusal reason verbatim — do not restate it.
- [x] Keep `--plan` and `--no-worktree`; drop `--here` (spec-start IS here) and
      note that in the MIGRATION entry (Phase 4 writes it).
- [x] Add/extend tests: the gate refuses on a dirty tree / another spec /
      off-base, and its wording names the three ways out; a live-refused spec
      parks rather than blocks; description budget; run `pnpm build` +
      `pnpm test` — green before the phase is done.
