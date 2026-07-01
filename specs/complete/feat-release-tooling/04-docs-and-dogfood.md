# Phase 4 — Docs + rule/skill genericisation + dog-food ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Documentation and the shipped rule/skill reflect the new tooling and
carry no project-specific (FF CSC) references, and the new assets are
dog-fooded in this repo via symlinks.

## Tasks

- [x] Genericise `assets/rules/commit-messages.md`: dropped the FF CSC specifics
      (`scripts/generate-releases.ts`→`.js`, `pnpm version`→`npm version`,
      `specs/.core/COMMIT_MESSAGES.md` footer, the "FF CSC Requisitions" examples,
      the domain abbreviation list). Now points at the configured filenames,
      `node`-run commands, and `scopeAreas` in `skitterspec.config.json`. Footer
      grammar intact. Softened "commitlint enforced" → convention/optional.
- [x] Updated `assets/skills/commit/SKILL.md`: step 5 now notes that, when the
      tooling is enabled, the footers are what the generated release notes are
      built from at `npm version` — no stack assumption.
- [x] Updated `README.md`: documented the tooling, the `skitterspec.config.json`
      schema, interactive `init` + the new flags, the version-bump model, and the
      `prompts` runtime dep. Refreshed the files-written and "How it's
      distributed" sections.
- [x] Updated `assets/claude-md-section.md`: the `/commit` paragraph briefly
      notes that footers feed the generated artifacts when enabled.
- [x] Dog-food: symlinked `scripts → assets/scripts` (relative, same pattern as
      the skills), added this repo's `skitterspec.config.json` (productName
      `skitterspec` + a scope→area map), and wired the `version`/`changelog`/
      `releases`(`:retro`) npm scripts into our own `package.json`. Did **not**
      run `init` here. `npm pack` confirmed the symlink + root artifacts don't ship.
- [x] Sanity-ran both generators on this repo's real history (`… 0.1.0`):
      `CHANGELOG.md` categorised 7 commits correctly; `RELEASES.md` picked up the
      single `Release-Note!` footer under area `Install` as a highlight. Kept both
      generated files.
- [x] Added `test/assets.test.js` — greps every shipped skill/rule `.md` for
      forbidden tokens (`FF CSC`, `pnpm`, `tsx`, `generate-releases.ts`,
      `COMMIT_MESSAGES.md`).
- [x] Run `node --test` — green (58 pass, 0 fail).

## Notes

This phase is the "no dangling references" pass — the rule shipped in the
earlier `/commit` work still points at the user's private project; this is where
that gets fixed for public consumers.
