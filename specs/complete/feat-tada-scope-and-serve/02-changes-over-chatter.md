---
github_issue_id: "#193"
---

# Phase 2 — Changes over chatter ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** no-spec groups show commits only; prompts that led to a spec move
under it — proven by digest tests.

## Tasks

- [x] Drop prompts from no-spec groups; a group left with no commits and no
      sessions disappears
- [x] A session that later stood on a spec's branch moves its earlier no-spec
      prompts into that spec's group
- [x] `--chat` keeps the phase-1 behaviour (every prompt)
- [x] Update the `/spec-tada` skill: no "Explored" for no-spec work unless
      `--chat`
- [x] Tests: no-spec prompts dropped, commits kept; prompts folded into the
      spec a session moved onto; an empty no-spec group removed; `--chat`
      restores; run `pnpm test` — green
