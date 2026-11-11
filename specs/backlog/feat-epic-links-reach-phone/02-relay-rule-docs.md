---
github_issue_id: "#179"
---

# Phase 2 — Relay rule + docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** an agent relaying any tier stack — inside a skill or not — passes it
on whole, and the docs describe the new links — proven by the asset tests.

## Tasks

- [ ] Add one sentence to `packages/common/assets/rules/spec-reports.md` under
      *The stack is the engine's*: it holds for every relay of engine output
      carrying a stack, in or out of a skill — all tiers, `also:` lines and
      labels, never one URL
- [ ] Update `docs/reference.html` (`epic status` row) and `docs/review.html`
      (loopback wording); bump their `verified:`
- [ ] Tests: extend the rule/asset test that pins the stack wording, if one
      exists, to cover the new sentence
- [ ] Run `pnpm test` — green before the phase is done
