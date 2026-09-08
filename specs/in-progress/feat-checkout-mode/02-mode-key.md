---
linear_issue_id: "SKS-79"
---

# Phase 2 — The `mode` config key ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** an operator can declare `checkout` mode, the loader validates it, and
every existing repo keeps provisioning worktrees exactly as before.

## Tasks

- [x] **Decision overturned — it falls back, it does not refuse.** The loader is
      deliberately lenient throughout ("malformed entries are dropped … so a
      stray entry can't crash provisioning"), and `teardown.deleteRemoteBranch`
      already sets the precedent with better reasoning than the spec's: an
      unrecognised value takes the *safest* value rather than erroring. Refusing
      would break every `spec-env` command over one typo. `mode` therefore falls
      back to `worktree` — and the DIRECTION is the safeguard: a typo costs an
      extra terminal session, never a spec's commits landing in the primary
      checkout unasked.
- [x] Expose the resolved mode wherever specs resolve (`resolve.js` /
      `provision.js`), so later phases branch on one value rather than
      re-reading config.
- [x] Extend `packages/common/src/prompts.js` → `promptSetup` so opting into
      isolation asks which mode, framed as the real trade: worktree for parallel
      specs and a free `main`, checkout for one spec at a time in the terminal
      you are already sitting in. Default to `worktree`.
- [x] Document `mode` in `packages/common/assets/core/env.config.md` and add it
      (commented, at the default) to `env.config.json.example`.
- [x] Add/extend tests covering this phase: default is `worktree` when the key is
      absent, a valid `checkout` parses, an invalid value is refused by name, and
      a **stays-silent** case proving an existing config with no `mode` key
      resolves to today's behaviour and warns about nothing. Run `pnpm test` —
      green before the phase is done.
