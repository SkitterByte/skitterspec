---
github_issue_id: "#97"
---

# Phase 4 — Default flip, rule rewrite, docs, major-release notes ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `pull` is the shipped default for every provider, the rules and docs
describe the new split, and the upgrade is announced as *Action required*.

## Tasks

- [x] Flip `workflowState` and `assignee` to `pull` in all four providers'
      `DEFAULT_CONFIG` and `.example` configs. Update `*.config.md` field
      references with the `push` opt-back.
- [x] Rewrite *"It tells, it doesn't track"* in `spec-planning.md` as *"the
      tracker owns status, the repo owns the spec"*, carrying decisions 1–5. Sync
      the dist copies.
- [x] Update the docs pages listed on `Docs:`, and bump each page's `verified:`
      in the same commit.
- [x] `/spec-*-setup` and `doctor`: report the ownership mode in one line.
- [x] Commit the default flip as a breaking change with a `Release-Note!:` that
      names the opt-back (a major version for each provider).
- [x] Run `node scripts/docs-freshness.js impact`, then
      `pnpm test` — green.

## Notes

- **The flip broke 17 tests, and each got one of two answers.** A test of
  repo-owned behaviour now says `push` in its fixture (GitHub's assignment
  fixture, Azure's assign tests, and the GitHub reopen test, which exercises
  apply's settle step). A test asserting the default now expects `pull`
  (Linear's config, init-config, plan-rename, status-assignee and
  engine-integration tests, plus the kit's ownership test). Nothing was deleted.
- **`github.config.json.example` pinned `assignee: push`**, which would have
  opted every new install out of the new default. It now names both fields as
  `pull`, as Linear's example does.
- **`doctor` gained an `Ownership` row** on all four providers (always `ok`; it
  is a fact, not a fault). The setup skills relay the doctor table verbatim,
  so that row is how they report the mode. Only GitHub's setup skill described
  the old assignee default, and it is updated.
- **`index.html` was updated too**, not just the five pages on `Docs:`. `impact`
  flagged it because the base skills gained seam markers, and its one-way
  paragraph claimed the workflow state is always published. `Docs:` now lists
  it.
- **This repo dogfoods it.** Its own `github.config.json` sets no ownership, so
  once the release is installed here its specs are `pull`.
