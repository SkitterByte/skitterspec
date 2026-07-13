# Phase 3 — Guarded deprecation/removal in `skitterspec update` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec update` detects legacy release files left over from an old
install, offers to remove them interactively (pointing at skittership), and never
deletes anything in CI/non-TTY/`--yes` mode — proven by tests.

## Tasks

- [ ] Add legacy-release detection to `skitterspec update`: check for
      `skitterspec.config.json`, `scripts/generate-changelog.js`,
      `scripts/generate-releases.js`, `scripts/lib/git-commits.js`,
      `scripts/lib/config.js`, `.claude/skills/commit/`,
      `.claude/rules/commit-messages.md`, and a `version` hook referencing the
      generators.
- [ ] When detected in an interactive TTY: prompt
      `Found release tooling (now in @skitterbyte/skittership). Remove it here? [y/N]`
      — on `y`, remove the detected files and unwire the `version` hook; on `N`,
      keep them and print the pointer notice.
- [ ] Guards: in non-TTY/CI **or** with `--yes`, never delete — print a one-time
      notice only: `Release tooling has moved to @skitterbyte/skittership — run
      npx @skitterbyte/skittership init to keep it.` Optionally support an explicit
      `--remove-release-tooling` flag for non-interactive opt-in removal.
- [ ] Ensure removal is scoped and non-destructive: only the files skitterspec
      originally installed; leave the user's `CHANGELOG.md`/`RELEASES.md` content
      and any unrelated `scripts/` files intact.
- [ ] Add tests: detection true/false, interactive-remove path, `N`-keep path,
      CI/non-TTY notice-only path, `--yes` never-deletes, and the version-hook
      unwire.
- [ ] Run skitterspec's typecheck + test commands — green before the phase is done.

## Notes

- Depends on Phase 2 (skitterspec no longer *installs* the tooling, so `update`
  is purely a cleanup path for pre-existing installs).
