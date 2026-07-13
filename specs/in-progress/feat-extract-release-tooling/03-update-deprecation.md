# Phase 3 — Guarded deprecation/removal in `skitterspec update` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec update` detects legacy release files left over from an old
install, offers to remove them interactively (pointing at skittership), and never
deletes anything in CI/non-TTY/`--yes` mode — proven by tests.

## Tasks

- [x] Added legacy-release detection (`detectReleaseTooling` in new
      `src/deprecate.js`): checks `skitterspec.config.json`, both generators,
      `scripts/lib/{git-commits,config}.js`, `.claude/skills/commit/`,
      `.claude/rules/commit-messages.md`, and a `version` hook referencing the
      generators (detected even if the generator files are already gone).
- [x] Interactive TTY prompt via `confirmRemoveReleaseTooling` (prompts) —
      "Found release tooling (now in @skitterbyte/skittership). Remove it here?"
      default No. On yes: remove files + unwire the hook; on no: print the notice.
      Wired into the `update` case as `cleanupReleaseTooling`.
- [x] Guards: non-TTY/CI **or** `--yes` → notice only, never delete. Added the
      `--remove-release-tooling` flag for non-interactive opt-in removal.
- [x] Removal is scoped/non-destructive: deletes only skitterspec's own files,
      prunes emptied `scripts/`/`lib/` dirs, unwires the `version` hook and only
      the generator helper scripts whose value still matches (a custom `version`
      override is kept). `CHANGELOG.md`/`RELEASES.md` and unrelated scripts are
      never touched.
- [x] Tests (`test/deprecate.test.js`, 11 cases): detection true/false/hook-only,
      full removal + dir pruning, hook unwire + helper removal, content/unrelated-
      script preservation, custom-version preservation, and CLI guards (non-TTY
      keeps, `--yes` keeps, `--remove-release-tooling` deletes). Also smoke-tested
      the real CLI output.
- [x] Ran skitterspec's test command — `node --test` green (**176 tests**).

## Notes

- Depends on Phase 2 (skitterspec no longer *installs* the tooling, so `update`
  is purely a cleanup path for pre-existing installs).
