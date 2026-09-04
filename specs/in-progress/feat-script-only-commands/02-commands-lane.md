---
linear_issue_id: "SKS-48"
---

# Phase 2 — A `commands/` lane in the installer ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `init`/`update` installs `assets/commands/*.md` into `.claude/commands/`
with the detected package-manager prefix baked in, fully covered by the install
manifest. Proven by installer tests over a temp dir.

## Tasks

- [ ] **Verify the mechanism first.** Hand-write one throwaway
      `.claude/commands/` file using `` !`…` `` pre-execution with `$ARGUMENTS`,
      run it, and confirm: the bash runs before the model turn, `$ARGUMENTS`
      interpolates inside the backticks, and `allowed-tools` gates it. Record the
      result in the spec Changelog; if argument interpolation does not work, take
      the fallback in Notes before continuing.
- [ ] Add `detectPackageManager(dir)` to `packages/common/src/init.js` — read the
      lockfile (`pnpm-lock.yaml` → `pnpm exec`, `yarn.lock` → `yarn`,
      `package-lock.json` → `npx`), defaulting to `npx` when nothing matches.
- [ ] Add `listCommands()` alongside `listSkills()`, discovering `assets/commands/*.md`
      from the bundled tree so each distribution installs exactly what it ships.
- [ ] Add `installCommands(dir, opts)` writing each to `.claude/commands/<name>.md`,
      replacing the `{{exec}}` token with the detected prefix.
- [ ] Cover commands in `managedTargets(dir)` so the manifest, `--force` resync and
      `customized` detection apply unchanged. The bundled content must be run
      through the same `{{exec}}` interpolation there, or every install will hash
      as customized on the next run.
- [ ] Make `removeRetiredFiles` manifest-aware (Decision 6): delete only when the
      file's hash is one the manifest records as ours; otherwise keep it and push a
      warning. Name the blind spot in a comment — an unrecognised hash means a user
      edit *or* a lost manifest, and only one of those is safe to act on.
- [ ] Add a `commands` overlay line to the Linear branch of `scripts/build-dist.js`
      (beside the existing `skills`/`rules`/`core` overlays) so a future provider
      command is not silently dropped. `composeAssets` already copies the tree, so
      the base distribution needs no change — assert that in a test rather than
      assuming it.
- [ ] Add tests: a command installs with the right prefix per lockfile; a second
      run reports `skipped`, not `updated` (interpolation is stable); an edited
      command is reported `customized` and kept; a retired file with a manifest-known
      hash is deleted; a retired file with an unknown hash is **kept** with a warning.
- [ ] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

**Fallback if `$ARGUMENTS` does not interpolate inside `` !`…` ``:** keep the
commands lane exactly as specified, but have the command body pre-execute the
zero-arg form (`{{exec}} skitterspec spec-env connect`) and rely on Phase 1's
registry resolution for the common single-spec case, leaving an explicit
argument to a normal Bash call in the body. The lane, the manifest coverage and
the retirement logic are unaffected either way — only the two command bodies in
Phase 3 change.

The `{{exec}}` interpolation is why command files are *generated* rather than
copied. The manifest hashes what we actually wrote, so a user switching package
manager sees a clean `updated` on the next `init`, not a spurious `customized`.
