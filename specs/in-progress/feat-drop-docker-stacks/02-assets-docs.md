---
github_issue_id: "#344"
---

# Phase 2 — Assets and docs no longer mention Docker stacks ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** no shipped skill, rule, config doc or page describes a per-spec
Docker stack, and new specs carry no `Stack:` line. Asset tests prove it.

## Tasks

- [ ] `skills/spec/SKILL.md`: remove grill item 9, the `Stack:` template line
      and Phase D, and renumber the items that follow.
- [ ] `skills/spec-start` (SKILL.md, isolation.md), `spec-complete`,
      `spec-cancel`, `no-spec`, `spec-init`, `spec-bug`, `spec-hotfix`: remove
      the Docker stack, `Stack:` escalation and volume and backup wording.
- [ ] `core/env.config.md`: remove the `docker` block and document `ports`
      (`env.config.json.example` already carries `ports`, from phase 1). `rules/spec-planning.md`: remove "Docker
      stacks" from the isolation pointer.
- [ ] Update `packages/common/README.md` and `packages/skitterspec/README.md`,
      and add a `MIGRATION.md` entry for each published package. The entry
      says `docker` is ignored, `ports` replaces `docker.portBase` and
      `docker.portsPerSpec`, and `Stack:` is ignored.
- [ ] Update `docs/index.html` and `docs/reference.html`, then run
      `node scripts/docs-freshness.js verify index reference`.
- [ ] Add an asset test asserting no shipped skill or rule mentions
      `worktree + docker` or `docker compose`.
- [ ] Run `pnpm build` and `pnpm test` until green.
