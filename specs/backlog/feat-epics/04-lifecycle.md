---
github_issue_id: "#157"
---

# Phase 4 — Lifecycle skills ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every lifecycle verb does the right thing with an epic.

## Tasks

- [ ] `/spec-start` on an epic moves it to in-progress with a docs worktree
      only; `/spec-next` on an epic refuses and names `epic status`
- [ ] `/spec-complete` on an epic refuses while members are open, naming them,
      and offers completion with them listed (recorded in the Changelog)
- [ ] `/spec-list` and `skitterspec status` group members under their epic
- [ ] Rules: `spec-planning.md` gains the Epic kind and the three headers;
      a migration note for an `issue-` plan spec becoming an epic
- [ ] Tests for the refusals and the grouping
