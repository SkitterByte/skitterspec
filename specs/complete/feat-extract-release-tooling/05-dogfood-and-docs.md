# Phase 5 — Dogfood: consume skittership + refresh docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** The skitterspec repo itself generates its CHANGELOG/RELEASES and uses
`/commit` via skittership (not self-hosted copies), and all docs describe the two
packages accurately — with the release generation verified end-to-end.

## Tasks

- [x] Added `@skitterbyte/skittership: ^1.0.0` as a devDependency (published in
      Phase 4) and `npm install`ed it — no `file:` fallback needed.
- [x] Re-sourced release generation from the dependency: the repo already
      dogfooded via **symlinks into its own `assets/`** (which Phase 2 deleted, so
      they'd broken). Repointed them into the dep — `scripts →
      node_modules/@skitterbyte/skittership/assets/scripts` (so `node
      scripts/generate-*.js` in the `version` hook still resolves) — and `git mv
      skitterspec.config.json → skittership.config.json`.
- [x] Re-adopted `/commit` + the commit rule: repointed `.claude/skills/commit`
      and `.claude/rules/commit-messages.md` symlinks into the dep. (This repo has
      no `CLAUDE.md`; rules auto-apply.)
- [x] Verified end-to-end: `npm run changelog` + `npm run releases` regenerated
      both files from git history via the dependency's generators (reading the
      renamed config) — then reverted the output (it belongs to the next `npm
      version`, not the already-tagged 1.0.1).
- [x] Docs: rewrote `README.md` (spec-only install + a "→ skittership" pointer
      section; removed the release-tooling blocks). `spec-planning.md` has no
      release-tooling refs; `assets/claude-md-section.md` was cleaned in Phase 2;
      the skittership README shipped in Phase 1.
- [x] **Course-correction (bug found by dogfooding):** `skitterspec update`'s
      deprecation detector flagged *any* release files — so a repo that adopted
      **both** skitterspec and skittership (like this one) would be offered
      skittership's live files for removal. Fixed `detectReleaseTooling` to bail
      when skittership is adopted (`skittership.config.json` present or it's a
      dependency); added 3 tests.
- [x] Ran `node --test` — green (**179 tests**).

## Notes

- This closes the loop: skitterspec is skittership's first consumer. The
  dogfood-via-symlink keeps the repo DRY (no committed generator copies); the
  symlinks resolve after `npm install`, and the `version` hook only runs
  post-install.
