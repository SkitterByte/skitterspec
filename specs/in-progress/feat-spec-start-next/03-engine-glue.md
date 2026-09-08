---
linear_issue_id: "SKS-89"
---

# Phase 3 — Engine glue ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the engine supports the two skills with composed existing verbs, not
new machinery.

## Tasks

- [ ] Sharpen `spec-env live take`'s off-base refusal for the spec-start gate:
      it already refuses when the primary is not on base — make the message
      name the in-flight spec (from the receipt when present) and the three
      ways out, so the skill can relay it verbatim.
- [ ] Give `spec-next` a scriptable in-flight answer: extend `spec-env live
      status` (or `spec-env resolve`) so "which spec is in flight here, if
      any" is one call with a stable line format — the skill must not parse
      prose.
- [ ] Verify `live take` composes with a just-provisioned worktree (fresh
      branch, zero commits ahead): the rebase is a no-op and the switch works.
      Record the observed behaviour; fix the engine if any step assumes
      commits exist.
- [ ] Remove nothing yet: `open.tab`/`tabRemote` were never built (the pivot
      predates Phase 3 of the old plan), so this phase adds no config keys and
      deletes none.
- [ ] Add/extend tests: refusal wording, the in-flight query's format (fire +
      stays-silent on a free checkout), fresh-worktree take; run `pnpm build`
      + `pnpm test` — green before the phase is done.
