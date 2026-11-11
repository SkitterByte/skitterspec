---
github_issue_id: "#162"
---

# Phase 1 — Next action per spec ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a pure `nextAction` that turns one spec's state into the verb to run,
proven against every precedence branch and every cannot-tell.

## Tasks

- [ ] Add `packages/common/src/env/nextaction.js`: `nextAction({ bucket,
      phases, gate, pending, dirty, syncWaits, lane, clash, waits })` →
      `{ state, verb, command, link, why }`, precedence per Decision 2
- [ ] Gather the inputs per worktree from existing readers: `readGate` /
      `gateState`, `readPending`, `classifyDirtyTree`, `readSpecState`,
      `epicStatus` sync points and lanes — no new sidecar
- [ ] Name each blind spot beside its check (`negative-checks.md` rule 2)
- [ ] Tests: each precedence branch; backlog ready / no free lane / clash /
      blocked; epic row once no member is open; cannot-tell for a corrupt gate,
      a corrupt pending store and an unreadable worktree
- [ ] Stays-silent tests: `review.required: false` (no verdict verb), a spec
      with no phases yet, a member whose waits name a spec outside the epic
- [ ] Run typecheck + tests — green before the phase is done
