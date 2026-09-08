---
linear_issue_id: "SKS-76"
---

# Phase 4 — Batched grilling ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec` and `/spec-review` interviews cost one round trip per
*dependent decision*, not per question.

## Tasks

- [ ] Amend `/spec` Phase A: replace "Ask one question at a time" with — batch
      up to 4 *independent* questions per round using the multi-question ask
      tool when the harness provides one; ask sequentially only when an answer
      gates later questions; still give a recommended answer per question.
- [ ] Amend `/spec-review` §3 (which points at `/spec` Phase A style) to match.
- [ ] Rebuild dists (`pnpm build`).
- [ ] Add/extend tests covering this phase (docs-claims-style retired-phrase
      check that no shipped skill still mandates "one question at a time", with
      the batching rule as the replacement); run `pnpm test` — green before the
      phase is done.
