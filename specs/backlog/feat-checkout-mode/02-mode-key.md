---
linear_issue_id: "SKS-79"
---

# Phase 2 — The `mode` config key ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** an operator can declare `checkout` mode, the loader validates it, and
every existing repo keeps provisioning worktrees exactly as before.

## Tasks

- [ ] Add top-level `mode` to `DEFAULT_CONFIG` in
      `packages/common/src/env/config.js`, defaulting to `'worktree'`, and
      validate it in the parse path alongside the other keys — an unrecognised
      value is refused by name, never silently coerced (`.claude/rules/negative-checks.md`:
      route the unknown case to the harmless branch, and here that is refusing
      to guess which mode the operator meant).
- [ ] Expose the resolved mode wherever specs resolve (`resolve.js` /
      `provision.js`), so later phases branch on one value rather than
      re-reading config.
- [ ] Extend `packages/common/src/prompts.js` → `promptSetup` so opting into
      isolation asks which mode, framed as the real trade: worktree for parallel
      specs and a free `main`, checkout for one spec at a time in the terminal
      you are already sitting in. Default to `worktree`.
- [ ] Document `mode` in `packages/common/assets/core/env.config.md` and add it
      (commented, at the default) to `env.config.json.example`.
- [ ] Add/extend tests covering this phase: default is `worktree` when the key is
      absent, a valid `checkout` parses, an invalid value is refused by name, and
      a **stays-silent** case proving an existing config with no `mode` key
      resolves to today's behaviour and warns about nothing. Run `pnpm test` —
      green before the phase is done.
