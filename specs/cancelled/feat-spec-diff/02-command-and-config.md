---
linear_issue_id: "SKS-84"
---

# Phase 2 — The `/spec-diff` command + config ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the operator types `/spec-diff [spec]` and a correct diff view exists
one tab away; projects configure how with one key.

## Tasks

- [ ] Add `packages/common/assets/commands/spec-diff.md` in the
      spec-connect shape: `allowed-tools` scoped to the verb,
      `disable-model-invocation: true`, pre-executed
      `!`{{exec}} skitterspec spec-env view $ARGUMENTS``, relay verbatim; a
      one-line note that refusals are the engine's and not to be worked around.
- [ ] Add `open.view` to `packages/common/src/env/config.js` (`string?`, default
      empty) and to `env.config.json.example`; document it in `env.config.md`
      with the Warp example
      `open "warp://action/new_tab?path={worktreePath}"` and a note that empty
      falls back to `open.command`, and both empty means print-only.
- [ ] Extend the config tests: `open.view` parses, defaults empty, and an
      absent `open` block still resolves — plus the assets-invocation test
      covering the new command file (binary name, allowed-tools scope).
- [ ] Rebuild dists (`pnpm build`); run `pnpm test` — green before the phase is
      done.
