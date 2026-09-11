---
linear_issue_id: "SKS-155"
---

# Phase 1 — extract `planConnect`, and test what it decides ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the three refusals `spec-env connect` owns are decided by a pure
function with unit tests, and the CLI executes what it returns — with every
message identical to today's.

## Tasks

- [ ] **Capture the current output first.** Before touching anything, record the
      exact strings the three refusals print. They are the contract this phase
      must not change, and a refactor that "improves" one of them silently is the
      failure mode here.
- [ ] Add `packages/common/src/env/connect.js` with `planConnect(spec, config, ctx)`.
      `ctx` carries what only the CLI can know: `slot` (or null when the spec has
      no reserved ports), `routes` (already rendered), and `busyPorts`. Pure —
      no `fs`, no network, no `process`.
- [ ] Return the same shape the sibling planners use: `{ blocked: true, reason }`
      or `{ blocked: false, routes, routesFile, connectedFile }`. Match
      `planIntegrate`/`planTake` rather than inventing a third convention.
- [ ] Rewrite `specEnvConnect` in `packages/common/src/cli.js` to probe, plan,
      then execute. The probes stay in the CLI **because they cannot be pure**:
      `readRegistry` touches disk and `portsInUse` is async and touches the
      network. Same split as `specEnvLiveTake`, and say so in a comment.
- [ ] Leave the checkout-mode no-op and the `main`/base disconnect arm ahead of
      the planner. Both answer before there is anything to plan, and the
      disconnect arm is a different operation, not a blocked connect.
- [ ] Add `packages/common/test/env-connect.test.js`: no slot → blocked, naming
      `dev up`; empty routes → blocked, "nothing to expose"; busy ports →
      blocked, naming every busy port; a clean set → not blocked, with the routes
      and both state-file paths passed through. No fixtures, no git, no
      filesystem — that is the point of the extraction.
- [ ] Add a **stays-silent** case: a spec with a slot, one `frontPort` route and
      no busy ports must produce `blocked: false` and no reason. The three
      positive tests prove the refusals can fire; only this one proves they do
      not fire on a healthy connect.
- [ ] Assert the **wording** in the planner tests, not just that a reason exists.
      Two of the three name the command that fixes them and one is quoted on
      `docs/index.html`; a reason that degrades to "blocked" passes a
      truthiness check and helps nobody.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done, with the strings captured in task 1 unchanged.

## Notes

`portsInUse` returning the busy list rather than a boolean is what lets the
refusal name the ports. Keep that: `ctx.busyPorts` is an array, and the reason
interpolates it.

The registry probe is `hasOwnProperty` on `registry.slots`, not truthiness —
slot `0` is a valid slot and the falsy check would refuse the first spec anyone
provisions. Preserve that exactly; it is the kind of thing a refactor eats.
