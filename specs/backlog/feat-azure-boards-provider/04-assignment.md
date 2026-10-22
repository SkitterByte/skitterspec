---
linear_issue_id: "SKS-421"
---

# Phase 4 — Assignment on the kit seam ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-claim`, `whoami` and `users` work against Boards through the
assignment seam `feat-github-provider` hoisted into the kit — the azure
adapter supplies only the `System.AssignedTo` ops.

## Tasks

- [ ] Adapter ops: assign/unassign via `System.AssignedTo` JSON Patch;
      identity resolution by email per phase 1's recorded lookup; `users` and
      `whoami` listings.
- [ ] Wire the kit's assignment seam (take / hand back / hand to a teammate;
      `/spec-start` records the developer, `/spec-complete` releases it) —
      consume, don't fork: azure supplies ops, the kit owns the flow.
- [ ] Unresolvable identity is a named refusal (candidates listed, email
      absent), with a stays-silent test for a resolvable one.
- [ ] Tests green: op contract covers the assignment ops on both transports
      (or exits 1 naming MCP gaps). Full workspace suite (`pnpm test`).
