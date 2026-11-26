---
github_issue_id: "#333"
---

# Phase 3 — `live.refusedReach` for manual-steps stops ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a manual-steps stop on a branch live refuses names the project's
chosen way to reach the work, never a guessed `/spec-to-main` — proven by
config and live-refusal tests.

## Tasks

- [ ] Add `live.refusedReach` to `src/env/config.js` (`worktree` · `pr` ·
      `live-confirm` · unset); an unknown value warns and reads as unset
- [ ] Under `live-confirm`, have the live migrations refusal declare a
      `bypass` offer, spent once per arming and recorded
      (`.claude/rules/offered-unblocks.md`); no offer otherwise
- [ ] Rewrite `spec-next` §manual-steps `Next`: follow the key; unset →
      relay the refusal and list the three reaches
- [ ] Document the key in `assets/core/env.config.md`
- [ ] Add/extend tests: each value, unset stays offer-less, offer spent once;
      `pnpm build && pnpm test` green
