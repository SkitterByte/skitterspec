---
linear_issue_id: "SKS-48"
---

# Phase 2 — A `commands/` lane in the installer ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done — one task carried to Phase 3

**Goal:** `init`/`update` installs `assets/commands/*.md` into `.claude/commands/`
with the detected package-manager prefix baked in, fully covered by the install
manifest. Proven by installer tests over a temp dir.

## Tasks

- [x] **Verify the mechanism.** Confirmed by the user running
      `/spike-bangtest hello`: both `` !`…` `` blocks ran *before* the model turn
      and `$ARGUMENTS` interpolated inside the backticks
      (`RAN-WITH-ARGS=[hello]`), with no Bash tool call in the turn. The fallback
      below is therefore not needed. Spike file deleted.
- [x] Add `detectPackageManager(dir)` to `packages/common/src/init.js` — reads the
      lockfile (`pnpm-lock.yaml` → `pnpm exec`, `yarn.lock` → `yarn`,
      `package-lock.json` → `npx`, `bun.lockb` → `bunx`), falling back to `npx`.
- [x] Add `listCommands()` alongside `listSkills()`, discovering
      `assets/commands/*.md` from the bundled tree; a distribution shipping none
      yields `[]` rather than throwing.
- [x] Add `installCommands(dir, opts)` writing each to `.claude/commands/<name>.md`
      through `renderCommand`, which replaces `{{exec}}` with the detected prefix.
      Wired into both `init` and `reset`; `resync` picks it up via `managedTargets`.
- [x] Cover commands in `managedTargets(dir)`, running the bundled content through
      the *same* `renderCommand` — otherwise every install hashes as customized on
      the next run and commands freeze out of updates.
- [x] ~~Make `removeRetiredFiles` manifest-aware~~ — **already true.**
      `pruneRetiredManaged` (`packages/common/src/init.js:282`) does exactly this:
      anything in the manifest that the current version no longer ships is deleted
      only when `managedState` says `pristine`, and a `customized` file is kept
      with a warning. Decision 6 needs no code; Phase 3 only has to stop shipping
      the two skills.
- [x] Add a `commands` overlay to the Linear branch of `scripts/build-dist.js`, and
      make `overlayTree` treat a missing source tree as a no-op so a provider that
      ships no commands still builds.
- [x] Add tests: lockfile → prefix for all four managers; the no-lockfile fallback;
      first-match-wins when lockfiles coexist; `renderCommand` fills every
      occurrence and leaves untokenised content alone; `managedTargets` renders
      command assets exactly as the installer does; and a stays-silent test that a
      distribution shipping no commands manages none.
- [ ] Add the install/manifest **integration** tests (installs with the right
      prefix; a second run reports `skipped` not `updated`; an edited command is
      kept as `customized`) — deferred to Phase 3, which is where the first real
      command assets exist to install.
- [x] Run `pnpm test` — 1120 green — and `pnpm build` — both distributions compose.

## Notes

`assets/commands/` ships empty in this phase: the lane is generic and its pure
functions are unit-tested, but there is nothing to install until Phase 3 writes
the first command. That is why the integration tests sit in Phase 3 rather than
here — a test that installs zero files proves nothing.

**Fallback (not needed — the spike passed).** Kept for the record: if
`$ARGUMENTS` had not interpolated inside `` !`…` ``, the plan was — keep the
commands lane exactly as specified, but have the command body pre-execute the
zero-arg form (`{{exec}} skitterspec spec-env connect`) and rely on Phase 1's
registry resolution for the common single-spec case, leaving an explicit
argument to a normal Bash call in the body. The lane, the manifest coverage and
the retirement logic are unaffected either way — only the two command bodies in
Phase 3 change.

The `{{exec}}` interpolation is why command files are *generated* rather than
copied. The manifest hashes what we actually wrote, so a user switching package
manager sees a clean `updated` on the next `init`, not a spurious `customized`.
