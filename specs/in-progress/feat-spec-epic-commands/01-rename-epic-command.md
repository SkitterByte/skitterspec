---
github_issue_id: "#188"
---

# Phase 1 — Rename `/epic` → `/spec-epic` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-epic` is shipped in place of `/epic`, every reference says so,
and `update` retires the old file. Proven by asset, install and docs tests.

## Tasks

- [ ] `git mv packages/common/assets/commands/epic.md spec-epic.md`, with
      the body unchanged apart from any self-reference
- [ ] Replace `/epic` with `/spec-epic` in `spec-start` and `spec` SKILL.md,
      `spec-planning.md`, `epicpage.js`, `epicread.js`, `cli.js`, the common and
      skitterspec READMEs, and `docs/{index,review,reference}.html` (bump each
      page's `verified:`)
- [ ] Reword `/spec`'s "there is no `/spec-epic`" line (Decision 3)
- [ ] Rebuild the composed provider packages so their copies follow
- [ ] Tests: rename `assets-epic-command.test.js`'s target; update the
      exhaustive command list (`cli-review-remote-command.test.js`) and the
      docs-claims token pattern; add an `update` test that removes an
      unedited installed `epic.md` and keeps an edited one with a warning
- [ ] Run typecheck + tests — green before the phase is done

## Notes

- `grep -rn '/epic\b'` outside `specs/complete/` and the `RELEASES-*.md`
  history should come back empty. Released notes are history and stay as
  written.
