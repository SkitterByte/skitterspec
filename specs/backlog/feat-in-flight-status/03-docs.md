---
linear_issue_id: "SKS-175"
---

# Phase 3 — Point people at it ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** somebody who has never read the rule file still finds the command, at
the moment they need it.

## Tasks

- [ ] Add it to `packages/common/README.md` next to where the worktree model is
      explained — the paragraph that says each spec gets its own checkout is
      exactly where "so how do I see them all?" occurs to a reader.
- [ ] Update `spec-planning.md`: the two-workspace-modes section already explains
      that a spec's status moves on its own branch; name the command that shows it
      there, so the explanation and the answer sit together.
- [ ] Add it to the docs site where the lifecycle commands are listed.
- [ ] Mention it in the CLAUDE.md section adopters get, in one line — this is the
      file Claude reads every session, so it is what makes the command reachable
      without the operator remembering it.
- [ ] Extend the docs-claims guard to cover the new command, so a renamed flag
      cannot leave the docs asserting something untrue.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

No new concepts here — the whole phase is making one command findable from the
places people already read.
