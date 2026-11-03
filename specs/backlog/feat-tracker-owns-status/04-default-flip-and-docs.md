---
github_issue_id: "#97"
---

# Phase 4 — Default flip, rule rewrite, docs, major-release notes ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `pull` is the shipped default for every provider, the rules and docs
describe the new split, and the upgrade is announced as *Action required*.

## Tasks

- [ ] Flip `workflowState` and `assignee` to `pull` in all four providers'
      `DEFAULT_CONFIG` and `.example` configs. Update `*.config.md` field
      references with the `push` opt-back.
- [ ] Rewrite *"It tells, it doesn't track"* in `spec-planning.md` as *"the
      tracker owns status, the repo owns the spec"*, carrying decisions 1–5. Sync
      the dist copies.
- [ ] Update the docs pages listed on `Docs:`, and bump each page's `verified:`
      in the same commit.
- [ ] `/spec-*-setup` and `doctor`: report the ownership mode in one line.
- [ ] Commit the default flip as a breaking change with a `Release-Note!:` that
      names the opt-back (a major version for each provider).
- [ ] Run `node scripts/docs-freshness.js impact`, then
      `pnpm test` — green.
