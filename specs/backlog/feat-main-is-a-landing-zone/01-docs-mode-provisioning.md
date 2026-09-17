---
linear_issue_id: "SKS-340"
---

# Phase 1 — Docs-mode provisioning (`spec-env up --docs`) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env up <spec> --docs` provisions a worktree for writing documents
in — slot allocated, branch forked, no `setup` commands and no docker — proven by
plan-shape tests that assert what it does *and* what it deliberately omits.

## Tasks

- [ ] Add a `docs` option to `planUp` in `packages/common/src/env/provision.js`.
      It returns `setupCommands: []` and omits every docker command, leaving slot
      allocation, the seed files and the `git worktree add` untouched.
- [ ] Keep slot allocation in docs mode. The worktree becomes the implementation
      worktree on `commit-start`, so it needs its port block then; registry
      allocation is already idempotent, so allocating now costs nothing.
- [ ] Leave the checkout-mode path (`planUpCheckout`) unchanged — `--docs` there is
      accepted and inert, since there is no second checkout to make cheap.
- [ ] Wire `--docs` through the `up` case in `packages/common/src/cli.js`.
- [ ] Make the reported plan say docs mode was used, so a caller reading `--json`
      can tell a docs worktree from a full one without inspecting what is missing.
- [ ] Tests: `--docs` yields empty `setupCommands`; no docker command appears even
      with `docker.enabled: true`; the slot is still allocated; a re-run over an
      existing docs worktree is a no-op; a plain `up` is byte-identical to today.
- [ ] Tests (stays-silent, per `.claude/rules/negative-checks.md`): `--docs` on a
      project with docker disabled reports nothing about docker, and a docs
      worktree re-provisioned *without* `--docs` runs the setup commands rather
      than refusing.
- [ ] Run `pnpm typecheck` and `pnpm test` — green before this phase is done.

## Notes

`planUp` already returns `setupCommands` as data (`provision.js:285`, `:328`), and
already zeroes it when the clean gate blocks — so docs mode is a second reason for
an existing shape rather than a new branch through the planner.
