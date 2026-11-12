---
github_issue_id: "#197"
---

# Phase 2 — `/spec-init` asks for name and category ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-init` sets both through the command — on a new repo in the
file it writes, on an existing one through a `/no-spec` branch.

## Tasks

- [ ] Add a "Project name and category" step to `/spec-init`: name defaults
      to the folder; category offered from `skitterspec project
      --categories`, or typed new, or left empty
- [ ] Existing `env.config.json`: make the change on a `/no-spec` branch with
      `skitterspec project`, then land it — never on main
- [ ] Fresh `init --isolation`: write both into the new file
- [ ] Mention it in `spec-planning.md` and the CLAUDE.md section where
      `project.*` is described
- [ ] Tests: the skill names the command and the `/no-spec` route; init
      writes both keys when given; run `pnpm test` — green
