---
github_issue_id: "#167"
---

# Phase 1 — `epic status --here` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a conversion can be checked from the worktree it is made in, before it
lands.

## Tasks

- [ ] `epicTree`-shaped reader over the working tree (`specs/**` on disk,
      uncommitted edits included) in `env/epicread.js`
- [ ] `epic status --here`: members, headers and phases from that reader; wait
      resolution still against the base branch's index
- [ ] Say in the human output that headers were read from this tree
- [ ] Tests: a renamed epic and new member headers, uncommitted, show under
      `--here` and not without it; a wait met only in the tree still reads
      unmet; stays silent — `--here` on the base branch's own checkout answers
      as a bare run does
- [ ] Run typecheck + tests — green before the phase is done
