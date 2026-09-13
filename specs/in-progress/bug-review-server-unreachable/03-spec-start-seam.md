---
linear_issue_id: "SKS-209"
---

# Phase 3 — `/spec-start` brings it up first ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the review server is already up, primary-owned and correctly bound
before any spec work begins, so no worktree ever becomes its owner by accident.

## Tasks

- [ ] `/spec-start` brings the review server up from the **primary checkout**,
      before provisioning — while the session is still standing there and before
      any `cd`. Phase 1 makes a worktree-started server survive; this makes one
      unlikely in the first place.
- [ ] Only when the project has isolation and `review.serveOnRemote` applies —
      a project that never serves gains nothing and must see no new step.
- [ ] **Never fatal, never a gate.** A busy port or a failed start is one line
      and provisioning carries on; the page falls back to `file://` exactly as
      it does today.
- [ ] Say nothing when it adopts a server that is already up. A line per
      `/spec-start` about a daemon nobody asked about is the narration the
      report contract forbids.
- [ ] Tests: the shipped `/spec-start` asset names the step and places it before
      provisioning; it states the never-fatal rule; a project without isolation
      has no such step.
- [ ] Run `pnpm test` in `packages/common` and at the repo root.

## Notes

Several agents rendering at once already works — `dir` resolves to the primary
checkout, so every review lands in one `.spec-env/reviews/` and one daemon serves
them all. What was missing was making sure the one daemon belongs to the checkout
that outlives them.
