---
linear_issue_id: "SKS-421"
github_issue_id: "#13"
---

# Phase 4 — Assignment on the kit seam ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-claim`, `whoami` and `users` work against Boards through the
assignment seam `feat-github-provider` hoisted into the kit — the azure
adapter supplies only the `System.AssignedTo` ops.

## Tasks

- [x] Adapter ops: assign/unassign via `System.AssignedTo` JSON Patch;
      identity resolution by email per phase 1's recorded lookup; `users` and
      `whoami` listings.
- [x] Wire the kit's assignment seam (take / hand back / hand to a teammate;
      `/spec-start` records the developer, `/spec-complete` releases it) —
      consume, don't fork: azure supplies ops, the kit owns the flow.
- [x] Unresolvable identity is a named refusal (candidates listed, email
      absent), with a stays-silent test for a resolvable one.
- [x] Tests green: op contract covers the assignment ops on both transports
      (or exits 1 naming MCP gaps). Full workspace suite (`pnpm test`).

## Notes

- Built AFTER `feat-github-provider` landed on main (the branch was rebased to
  pick the kit's `assignment.js` and `identity.js` up) — the sequencing
  Decision 2 wanted, arrived at by rebase rather than by waiting.
- No `validateAssignee` hook, deliberately: Azure validates the identity at
  write time and the push relays its `RuleValidationException` as the named
  refusal — the Linear behaviour, where GitHub needed the pre-check because
  its refusal lands only at push time after the stamp was committed.
- `whoami` derives from `connectionData`, which needs no scope beyond a valid
  PAT; `users` is the one op wanting Identity (Read), and both the engine and
  doctor name that scope on its 401.
- The identity id is the GUID (survives renames); `System.AssignedTo` also
  accepts an email, which `/spec-claim` falls back to where search is
  unavailable.
