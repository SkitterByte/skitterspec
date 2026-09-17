---
linear_issue_id: "SKS-340"
---

# Phase 1 — Docs-mode provisioning (`spec-env up --docs`) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-env up <spec> --docs` provisions a worktree for writing documents
in — branch forked, no `setup` commands and no docker — proven by plan-shape
tests that assert what it does *and* what it deliberately omits.

## Tasks

- [x] Add a `docs` option to `planUp` in `packages/common/src/env/provision.js`.
      It returns `setupCommands: []` and omits every docker command, leaving the
      seed files and the `git worktree add` untouched.
- [x] ~~Keep slot allocation in docs mode.~~ **Does not apply** — slot allocation
      was already Docker-only, in both `planUp` and its CLI caller, so a
      worktree-only spec has never taken one. Forcing `wantsDocker` false is
      therefore the whole of it: slot, port offset and `.env` all fall out null
      on their own. See the Changelog.
- [x] Leave the checkout-mode path (`planCheckoutUp`) unchanged — `--docs` there
      is accepted and inert, since there is no fresh tree to make runnable.
- [x] Wire `--docs` through the `up` case in `packages/common/src/cli.js`.
- [x] Make the reported plan say docs mode was used, so a caller reading `--json`
      can tell a docs worktree from a full one without inspecting what is missing.
- [x] Fix the Docker re-run signal, which documents mode exposed: a worktree on
      disk now counts as an attach in **both** paths, not just the worktree-only
      one. See the Changelog.
- [x] Tests (`env-provision-docs.test.js`, 13): `--docs` yields empty
      `setupCommands` and keeps the seed commands; no docker command appears even
      with `docker.enabled: true`; the branch is still forked; an existing
      worktree attaches; the plan reports docs mode positively.
- [x] Tests (stays-silent, per `.claude/rules/negative-checks.md`): omitting
      `opts` leaves every existing caller byte-identical; a falsy `docs` value is
      not docs mode; `--docs` with docker disabled says nothing about docker;
      `--docs` with no `setup` configured is a no-op rather than a refusal;
      checkout mode is unchanged by the flag.
- [x] Tests (`cli-spec-env-up-docs.test.js`, 5): the reported line, the absent
      setup step, and the Docker attach fix — plus stays-silent cases for a
      worktree-only re-run and a fresh Docker spec.
- [x] Run the project's test command — **3079 pass, 0 fail** (`node --test`).
      There is no typecheck script in this repo; see the Changelog.

## Notes

`planUp` already returned `setupCommands` as data and already zeroed it when the
clean gate blocks — so docs mode is a second reason for an existing shape rather
than a new branch through the planner.

The seed commands are **kept** and the setup commands dropped, which is not an
oversight: seeding links the gitignored files a fresh worktree has none of, and a
spec author may well want `.env` present. `setup` is the expensive half that
exists only to make the tree run.
