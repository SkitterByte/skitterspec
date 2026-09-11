---
linear_issue_id: "SKS-135"
---

# Phase 1 — `spec-env resolve --path`, and the lazygit recipe ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-env resolve [spec] --path` prints the spec's worktree
path and nothing else, so `lazygit -p "$(…)"` reaches a spec's diff from any cwd —
proven by CLI tests, with the recipe documented for people who don't use lazygit
either.

## Tasks

- [ ] Add `--path` to `specEnvResolve` in `packages/common/src/cli.js`: print
      `r.worktreePath` alone, newline-terminated, no labels and no other lines.
      The labelled multi-line form stays the default — this is an additional
      output mode, not a replacement.
- [ ] Keep the existing missing-spec behaviour intact: `resolve` already resolves
      an omitted spec from the registry (and lists them when several are
      provisioned). `--path` inherits that; it does not get its own resolution
      rules.
- [ ] Decide and document what `--path` prints in **`checkout` mode**, where
      there is no worktree — the primary checkout path, so the shell function
      still works there rather than printing a directory that does not exist.
- [ ] Add the `--path` line to the `spec-env` usage block and to the
      `skitterspec spec-env <cmd>` help in `cli.js`, so `scripts/docs-claims.test.js`
      has something to match.
- [ ] Extend `packages/common/test/cli-spec-env-resolve-bucket.test.js` (or add
      `cli-spec-env-resolve-path.test.js` beside it) covering: `--path` prints
      exactly one line and it is the worktree path; the labelled form is
      unchanged without the flag; the flag works with the spec argument omitted;
      and `checkout` mode prints the checkout path.
- [ ] Document the recipe in `packages/common/assets/core/env.config.md`: the
      `lazygit -p "$(skitterspec spec-env resolve <spec> --path)"` line, the
      optional `sgit` shell function wrapping it, and **why** it exists — the
      shell stays where it is, so nothing about this depends on the terminal you
      run, or on running one at all.
- [ ] Update the isolation/worktree section of `docs/index.html` to match, and
      run `scripts/docs-claims.test.js` — every dispatched verb must be
      documented and no page may name something that doesn't ship.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done. (This repo has no separate typecheck step.)

## Notes

Verified before the spec was written: `spec-env resolve <spec>` already prints
`worktree:   <path>`, so this phase is a second output mode over resolution that
already works — not new resolution logic. Resist widening it.

Everything terminal-specific stays in prose. The engine prints a directory; the
docs say what to point at it. That is the same rule that kept `open.command`
empty by default in the cancelled SKS-121, and it is what makes this usable by
someone running `tig`, `gitui`, VS Code or nothing at all.
