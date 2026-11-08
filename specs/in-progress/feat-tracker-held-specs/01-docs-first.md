---
github_issue_id: "#129"
---

# Phase 1 — Docs-first design draft ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the new ticket model, written up as the docs will describe it once
it's built, so the process (when, where and what the tracker is touched) can be
reviewed before any code is written. GitHub is the exemplar.

## Tasks

- [x] `docs/index.html` tracker section: one lifecycle timeline, skill by skill
      (`/spec` → `/spec-start` → `/spec-next` → `/spec-complete`/`/spec-cancel`),
      naming for each what the ticket gets (block, sub-issues, status, assignee,
      progress) and which side owns it
- [x] `docs/github.html` mapping + ownership sections: summary mode as the
      default, the managed block and its contents, sub-issue blocks, `spec`
      mode and the phase options, what survives a push, drift on the block only
- [x] Mark anything the delimiter spike (phase 2) could change as provisional
      in the draft, so it can't read as settled
- [x] Tests: `node --test scripts/docs-freshness.test.js` green (coverage blocks
      intact); `verified:` is not bumped. The draft describes code that doesn't
      exist yet, and phase 5 bumps it when the code lands

## Notes

This branch only lands with the code (`/spec-complete`), so the live site never
describes something that isn't built.
