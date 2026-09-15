---
linear_issue_id: "SKS-270"
---

# Phase 1 — `update` registers the hook ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec update` registers the `PreToolUse` review-gate hook in the
project's committed `.claude/settings.json`, and reports it — matching what
`MIGRATION.md` already promises.

## Tasks

- [x] Red test: `resync()` on a project with an existing, valid
      `.claude/settings.json` registers the hook and reports
      `updated: .claude/settings.json (review-gate hook)`.
- [x] Red test: re-running `resync()` reports it as already registered and
      rewrites nothing.
- [x] Red test (stays-silent): a malformed `.claude/settings.json` is warned about
      on the `update` path and left byte-for-byte untouched.
- [x] Guard the drift itself: one test parameterised over **every** install entry
      point (`init`, `update`/`resync`, `reset`) asserting each registers — the
      root cause was two entry points disagreeing, so the test is over the set.
- [x] Fix: call `registerReviewGateHook(dir)` from `resync()`.
- [x] Green: `node --test` in `packages/common` passes with no regressions.
