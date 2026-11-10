---
github_issue_id: "#157"
---

# Phase 4 — Lifecycle skills ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every lifecycle verb does the right thing with an epic.

## Tasks

- [ ] `/spec-start` on an epic moves it to in-progress with a docs worktree
      only; `/spec-next` on an epic refuses and names `epic status`
- [ ] `skitterspec epic check <member> [--phase N] [--json]`: the start's waits
      (no `--phase`) or that phase's own waits; unmet → `blocked` with a
      `bypass` offer (`.claude/rules/offered-unblocks.md`), spent once per
      phase and recorded; cannot-tell → a warning, no offer; met or no epic →
      silent
- [ ] `/spec-start` and `/spec-next` on a member ask `epic check` before
      building: relay, then offer — never refuse, never build silently past an
      unmet wait
- [ ] `/spec-complete` on an epic refuses while members are open, naming them,
      and offers completion with them listed (recorded in the Changelog)
- [ ] `/spec-list` and `skitterspec status` group members under their epic
- [ ] Rules: `spec-planning.md` gains the Epic kind and the three headers;
      a migration note for an `issue-` plan spec becoming an epic
- [ ] Docs: name `skitterspec epic` on the site and drop its allowlist entry in
      `scripts/docs-claims.test.js`; record the spec's `Docs:` header
- [ ] Tests for the refusals, the check's three states (incl. stays-silent on a
      member with no waits), the offer spent once, and the grouping
