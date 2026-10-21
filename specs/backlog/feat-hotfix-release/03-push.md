---
linear_issue_id: "SKS-404"
---

# Phase 3 — Push behind consent, resumable ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the branch and then the tag reach the remote only on consent, and always before
the carry.

## Tasks

- [ ] Push step, with `--push`:
  - `git push <remote> <branch>`, then `git push <remote> <tag>`;
  - stop on the first failure, and run no carry.
- [ ] Without `--push`, stop after the release and print both push commands in order.
- [ ] A re-run treats `git ls-remote --tags <remote> <tag>` naming the tag as pushed
  (a positive signal) and goes on to the carry. An unreachable remote is "cannot tell",
  so it stops rather than carrying.
- [ ] Tests, against a bare remote:
  - the order is branch then tag;
  - a declined push (no flag) carries nothing;
  - a hand-run push is honoured on re-run;
  - a failed push stops before the carry.
- [ ] Run `pnpm test`; green before the phase is done.
