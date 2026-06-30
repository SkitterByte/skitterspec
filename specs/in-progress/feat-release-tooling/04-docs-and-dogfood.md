# Phase 4 — Docs + rule/skill genericisation + dog-food ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Documentation and the shipped rule/skill reflect the new tooling and
carry no project-specific (FF CSC) references, and the new assets are
dog-fooded in this repo via symlinks.

## Tasks

- [ ] Genericise `assets/rules/commit-messages.md`: drop the FF CSC specifics
      (`scripts/generate-releases.ts`, `pnpm version`, `pnpm releases:retro`,
      `specs/.core/COMMIT_MESSAGES.md`, the "FF CSC Requisitions" examples and
      the project-specific scope→area list). Refer to the configured filenames
      and the `node`-run commands; describe `scopeAreas` living in
      `skitterspec.config.json`. Keep the `Release-Note:` footer grammar intact.
- [ ] Update `assets/skills/commit/SKILL.md` to mention that, when release
      tooling is enabled, the footer feeds the generated release notes (pointing
      at the rule), without assuming any specific stack.
- [ ] Update `README.md`: document the changelog/release tooling, the
      `skitterspec.config.json` schema, the interactive `init` flow + new flags,
      the version-bump model, and the new runtime dependency (`prompts`). Update
      the "How it's distributed" and files-written sections.
- [ ] Update `assets/claude-md-section.md` if the generated CLAUDE.md section
      should note the release tooling (keep it brief; spec lifecycle stays the
      focus).
- [ ] Dog-food: add relative symlinks for any new dog-foodable assets in this
      repo as needed, and (if this repo opts into the tooling) generate its own
      `skitterspec.config.json`. Do **not** run `init` here (symlink pattern,
      per the dog-food setup).
- [ ] Sanity-run the generators against this repo's own git history
      (`node scripts/generate-changelog.js --retro 1` style dry checks) to
      confirm they work end-to-end on a real history.
- [ ] Add/extend tests if any doc-driven behaviour is testable (e.g. the
      genericised rule contains no `pnpm`/`tsx` references — a simple grep test).
- [ ] Run `node --test` — green before the phase is done.

## Notes

This phase is the "no dangling references" pass — the rule shipped in the
earlier `/commit` work still points at the user's private project; this is where
that gets fixed for public consumers.
