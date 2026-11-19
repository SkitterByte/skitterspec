---
github_issue_id: "#249"
---

# Phase 3 — Wire `/spec-complete`, this repo, and docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-complete` runs the checks before every land, this repo
declares its docs check, and the convention says so.

## Tasks

- [x] `/spec-complete` §2: after the suite is green, run `skitterspec
      spec-env checks <spec>`, relay its output into `Notes`; a failed check
      makes the run `⚠️` and never stops the land. Add `Notes` wording to §5.
- [x] `env.config.md`: document `complete.checks`.
- [x] Add `"complete": { "checks": ["node scripts/docs-freshness.js impact"] }`
      to this repo's `specs/.core/env.config.json`.
- [x] Update `.claude/rules/docs-freshness.md`, `docs/README.md` and the CLAUDE.md
      "Docs freshness" section: `impact` runs via `complete.checks`; `verify`
      records a re-read; rebased stamps resolve on read.
- [x] `docs/reference.html`: rows for `spec-env checks`, and `complete.checks`
      where config keys are listed; bump `verified:`.
- [x] Tests: the skill-asset tests that pin `/spec-complete` text; run
      `node scripts/docs-freshness.js check` and `pnpm test`.
