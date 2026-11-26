---
github_issue_id: "#334"
---

# Phase 4 — Vocabulary: base, root checkout, live; docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** nothing says "main" for the base, the root checkout or the live
instance, and the docs match — proven by asset tests and a `git grep`.

## Tasks

- [ ] Add `off` to `LIVE_VERBS` in `src/cli.js`; drop documented `main`;
      update `assets/commands/spec-live.md`
- [ ] Rename `assets/commands/allow-main.md` → `allow-base.md` (retired-file
      prune) and the guard's prose in `mainguard.js`, `spec-skip.md`,
      `allow-project.md`
- [ ] Rename `guards.mainIsLandingZone` → `guards.baseIsLandingZone`; warn on
      the old key, naming the new one
- [ ] Sweep skills, rules, `claude-md-section.md`, `review/page.html` and
      engine output: *base* / *root checkout* / *live*, and the resolved
      branch name in reports
- [ ] Update `docs/reference.html` and `docs/index.html`; stamp with
      `node scripts/docs-freshness.js verify reference index`
- [ ] Add/extend tests (old-key warning, stays-silent on the new key;
      `git grep` for retired names outside history is empty);
      `pnpm build && pnpm test` green
