---
github_issue_id: "#157"
---

# Phase 4 — Lifecycle skills ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every lifecycle verb does the right thing with an epic.

## Tasks

- [x] `/spec-start` on an epic moves it to in-progress with a docs worktree
      only; `/spec-next` on an epic refuses and names `epic status`
- [x] `skitterspec epic check <member> [--phase N] [--json]`: the start's waits
      (no `--phase`) or that phase's own waits; unmet → `blocked` with a
      `bypass` offer (`.claude/rules/offered-unblocks.md`), spent once per
      phase and recorded; cannot-tell → a warning, no offer; met or no epic →
      silent
- [x] `/spec-start` and `/spec-next` on a member ask `epic check` before
      building: relay, then offer — never refuse, never build silently past an
      unmet wait
- [x] `/spec-complete` on an epic refuses while members are open, naming them,
      and offers completion with them listed (recorded in the Changelog)
- [x] `skitterspec status` groups members under their epic (`/spec-list` moved
      to phase 5: it reads the tracker, so it groups by the parent link that
      phase sets)
- [x] Rules: `spec-planning.md` gains the Epic kind and the three headers;
      a migration note for an `issue-` plan spec becoming an epic
- [x] Docs: name `skitterspec epic` on the site and drop its allowlist entry in
      `scripts/docs-claims.test.js`; record the spec's `Docs:` header
- [x] Tests for the refusals, the check's three states (incl. stays-silent on a
      member with no waits), the offer spent once, and the grouping

## Notes

- An epic's tree is documents-only in the engine (`spec-env up`/`bootstrap`
  treat `epic-` as `--docs`), so no skill has to remember the flag.
- The offer/bypass record lives in `.spec-env/epics/<spec>.json` (gitignored,
  machine-local); the Changelog line `epic bypass` writes is the durable half.
- `docs-freshness impact` also lists `index.html` (skills changed) and the four
  provider pages (sync-core changed): the provider pages are phase 5–6's to
  update with the parent link; `index.html` is re-read at completion.
