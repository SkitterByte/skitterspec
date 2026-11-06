---
github_issue_id: "#125"
---

# Phase 2 — Go/no-go design ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a recorded decision, and on a go, the build phases written into this
spec.

## Tasks

- [ ] Decide per provider from phase 1: supported, supported-with-normalisation,
      or excluded
- [ ] Answer the overview's open questions; record each as a Decision
- [ ] Reconcile with #93 Decision 1 (via `/spec-review` on #93 if still open)
- [ ] On a go: add build phases (create-at-`/spec`, materialise-at-`/spec-start`,
      archive-at-complete, docs-freshness, review surface) and set Status Ready;
      on a no-go: `/spec-cancel` with the reason
