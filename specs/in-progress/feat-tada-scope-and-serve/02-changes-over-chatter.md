---
github_issue_id: "#193"
---

# Phase 2 — Changes over chatter ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** no-spec groups show commits only; prompts that led to a spec move
under it — proven by digest tests.

## Tasks

- [ ] Drop prompts from no-spec groups; a group left with no commits and no
      sessions disappears
- [ ] A session that later stood on a spec's branch moves its earlier no-spec
      prompts into that spec's group
- [ ] `--chat` keeps the phase-1 behaviour (every prompt)
- [ ] Update the `/spec-tada` skill: no "Explored" for no-spec work unless
      `--chat`
- [ ] Tests: no-spec prompts dropped, commits kept; prompts folded into the
      spec a session moved onto; an empty no-spec group removed; `--chat`
      restores; run `pnpm test` — green
