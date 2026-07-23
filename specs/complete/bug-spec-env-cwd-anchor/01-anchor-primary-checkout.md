# Phase 1 — Anchor spec-env on the primary checkout ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** All `spec-env` subcommands resolve identity/paths against the primary
checkout, so they behave identically whether run from `main` or a worktree —
proven by a test that reproduces the worktree mis-resolution first.

## Tasks

- [x] **Reproduce (red):** add a failing unit test for `resolvePrimaryCheckout`
      (`test/env-resolve.test.js`) using a fake git reader — assert a relative
      `.git` (primary checkout) → `dir`, an absolute `/main/.git` (worktree) →
      `/main`, and a `null` (not a repo) → `dir`. It fails until the helper exists.
- [x] Add `resolvePrimaryCheckout(dir, git)` to `src/env/resolve.js` per the
      Solution overview; export it.
- [x] Anchor the `specEnv` dispatch (`src/cli.js`): after `dir = path.resolve(dir)`,
      set `dir = resolvePrimaryCheckout(dir, gitReader(dir))` **before**
      `loadEnvConfig(dir)` and the subcommand switch. (`gitReader` already exists.)
- [x] Simplify `specEnvIntegrate` (`src/cli.js`): remove its inline
      `git rev-parse --git-common-dir` block; use the (now-anchored) `dir` for both
      `resolveSpec` and `mainRepoPath`. Confirm the existing integrate smoke path
      still resolves from a worktree.
- [x] Add a regression test that the anchoring is wired: e.g. assert
      `resolvePrimaryCheckout` is applied so a worktree-style `dir` yields the
      primary root (unit-level via the helper; note if a full live-git integration
      test is added or deferred).
- [x] Run `npm test` — all green before the phase is done (204 pass, 0 fail).
      Manually confirmed `spec-env resolve <spec>` prints the same worktree/project
      from both the primary checkout and a worktree.

## Notes

`gitReader(cwd)` and the `dirname(abspath(git-common-dir))` recipe already exist
in `src/cli.js` / `specEnvIntegrate` — this phase extracts and centralises them,
it doesn't invent new machinery. Keep the fallback (`git` returns null → use
`dir`) so non-git or unusual setups degrade to today's behaviour rather than
throwing.

**Delivered / decisions (Phase 1):**

- **Central anchoring proven live.** Before: `spec-env resolve` from the worktree
  printed `…/spec-env-cwd-anchor-wt/spec-env-cwd-anchor` +
  `project: spec-env-cwd-anchor_…`; `down` said "not provisioned". After: both the
  primary checkout and the worktree print `…/skitterspec-wt/spec-env-cwd-anchor` +
  `project: skitterspec_…`, and `down` correctly finds the spec and evaluates its
  guards.
- **Full live-git integration test deferred** — the reproduction is covered at the
  unit level (`resolvePrimaryCheckout` with an absolute `/main/.git` reader = the
  from-a-worktree case) plus manual verification; a temp-repo+worktree end-to-end
  test would need real git and isn't worth the weight for this seam.
- **`integrate` simplified** — dropped its inline `git-common-dir` block; it now
  reuses the anchored `dir` as both the resolve root and `mainRepoPath`.
