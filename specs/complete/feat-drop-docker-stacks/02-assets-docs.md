---
github_issue_id: "#344"
---

# Phase 2 — Assets and docs no longer mention Docker stacks ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** no shipped skill, rule, config doc or page describes a per-spec
Docker stack, and new specs carry no `Stack:` line. Asset tests prove it.

## Tasks

- [x] `skills/spec/SKILL.md`: remove grill item 9, the `Stack:` template line
      and Phase D, and renumber the items that follow.
- [x] `skills/spec-start` (SKILL.md, isolation.md), `spec-complete`,
      `spec-cancel`, `no-spec`, `spec-init`, `spec-bug`, `spec-hotfix`: remove
      the Docker stack, `Stack:` escalation and volume and backup wording.
- [x] `core/env.config.md`: remove the `docker` block and document `ports`
      (`env.config.json.example` already carries `ports`, from phase 1). `rules/spec-planning.md`: remove "Docker
      stacks" from the isolation pointer.
- [x] Update `packages/common/README.md` and `packages/skitterspec/README.md`,
      and add a `MIGRATION.md` entry for each published package. The entry
      says `docker` is ignored, `ports` replaces `docker.portBase` and
      `docker.portsPerSpec`, and `Stack:` is ignored.
- [x] Update `docs/index.html` and `docs/reference.html`, then run
      `node scripts/docs-freshness.js verify index reference`.
- [x] Add an asset test asserting no shipped skill or rule mentions
      `worktree + docker` or `docker compose`.
- [x] Run `pnpm build` and `pnpm test` until green.

## Notes

- `MIGRATION.md` is one root source copied into each package at build; the
  parked providers (linear, jira) are not built, so their copies were synced
  by hand to keep `build-dist.test.js` green.
- `spec-env resolve` was still printing `project: undefined` after phase 1
  dropped `projectName`. It is fixed here, with a stays-silent test.
- `/spec-complete` and `/spec-cancel` lost their volume-prune sub-step.
