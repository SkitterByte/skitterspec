# Phase 1 — Anchor spec-env on the primary checkout ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** All `spec-env` subcommands resolve identity/paths against the primary
checkout, so they behave identically whether run from `main` or a worktree —
proven by a test that reproduces the worktree mis-resolution first.

## Tasks

- [ ] **Reproduce (red):** add a failing unit test for `resolvePrimaryCheckout`
      (`test/env-resolve.test.js`) using a fake git reader — assert a relative
      `.git` (primary checkout) → `dir`, an absolute `/main/.git` (worktree) →
      `/main`, and a `null` (not a repo) → `dir`. It fails until the helper exists.
- [ ] Add `resolvePrimaryCheckout(dir, git)` to `src/env/resolve.js` per the
      Solution overview; export it.
- [ ] Anchor the `specEnv` dispatch (`src/cli.js`): after `dir = path.resolve(dir)`,
      set `dir = resolvePrimaryCheckout(dir, gitReader(dir))` **before**
      `loadEnvConfig(dir)` and the subcommand switch. (`gitReader` already exists.)
- [ ] Simplify `specEnvIntegrate` (`src/cli.js`): remove its inline
      `git rev-parse --git-common-dir` block; use the (now-anchored) `dir` for both
      `resolveSpec` and `mainRepoPath`. Confirm the existing integrate smoke path
      still resolves from a worktree.
- [ ] Add a regression test that the anchoring is wired: e.g. assert
      `resolvePrimaryCheckout` is applied so a worktree-style `dir` yields the
      primary root (unit-level via the helper; note if a full live-git integration
      test is added or deferred).
- [ ] Run `npm test` — all green before the phase is done. Manually confirm
      `spec-env resolve <spec>` prints the same worktree/project from both the
      primary checkout and a worktree.

## Notes

`gitReader(cwd)` and the `dirname(abspath(git-common-dir))` recipe already exist
in `src/cli.js` / `specEnvIntegrate` — this phase extracts and centralises them,
it doesn't invent new machinery. Keep the fallback (`git` returns null → use
`dir`) so non-git or unusual setups degrade to today's behaviour rather than
throwing.
