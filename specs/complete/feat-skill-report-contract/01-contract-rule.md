---
linear_issue_id: "SKS-192"
---

# Phase 1 — Write the contract rule and bring it under the prose guard ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `.claude/rules/spec-reports.md` exists, ships, installs, and is guarded
against making stale claims — with no skill changed yet, so the rule can be read
and argued with on its own.

## Tasks

- [x] Write `packages/common/assets/rules/spec-reports.md`. It carries, and only
      carries: the four verdict states and what distinguishes `❌` from `⏸`; the
      block's anatomy (verdict line, then aligned fields); the field vocabulary
      and its fixed order; the `Follow-ups` rule (always present, the bar for
      listing one, offer-then-record-in-Changelog, author from the primary
      checkout); the mid-run silence rule and its two exceptions; and the one
      place the block may grow (`Why` plus quoted failing output on a non-`✅`).
- [x] Include a worked example per verdict state, short enough to be read whole.
- [x] Confirm no code change is needed to install it — `init.js` discovers
      `assets/rules/*` (line ~43) rather than listing them. Verify by running
      init against a scratch dir and asserting the file lands in `.claude/rules/`.
- [x] Teach `packages/common/test/assets-prose.test.js` to **discover**
      `assets/rules/*.md` across both packages, the way `coreDocs()` already
      discovers `assets/core/*.md`, instead of naming `spec-planning` by hand.
- [x] Check the new rule against the emphasis rule (no `**bold**`, `*italic*` or
      link spanning a hard line break) — `assets-emphasis.test.js` enforces it.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

The prose guard change is the load-bearing half. `assets-prose.test.js` was
written after `claude-md-section.md` drifted unnoticed, and its own comments say
the rules file *"was found stale the moment it was added"* — a hand-maintained
list of rules repeats that failure with the next rule. Discovery closes it.

Write the rule so it is short. It is loaded whenever a skill points at it, so
every paragraph that is not doing work is charged to every run.
