---
github_issue_id: "#217"
---

# Phase 1 — Engine: hold and send the completion state ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `applySpecPlan` can hold the spec issue's state (run 1) and send it
alone later (run 2), with the snapshot byte-identical across the two. Proven by
`apply-held-state.test.js`.

## Tasks

- [x] `holdState`: strip `state` and `stateResend` from `plan.issue`
      before the write. Record with `sent.issue = true` so `stateNames` matches
      what run 2 will record. Add a line saying the state is held for run 2.
- [x] `sendHeld` with an empty plan: send `{ state: projection.status }` to the
      linked issue as a transition, then record. The bytes must be unchanged.
- [x] `sendHeld` with a non-empty plan: apply it in full (today's behaviour) and
      add a line naming the snapshot path, which will now differ from the
      committed one (Decision 3).
- [x] Refuse `holdState` and `sendHeld` together, and either one on an unlinked
      spec (nothing to hold a transition for).
- [x] Stays-silent tests: a normal apply is unchanged, and `sendHeld` on a
      pre-fix run 1 falls back and names the file. Run
      `pnpm -r test` and the root `node --test`, all green (no typecheck
      script in this repo).
