---
linear_issue_id: "SKS-89"
---

# Phase 3 — Engine glue ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine supports the two skills with composed existing verbs, not
new machinery.

## Tasks

- [x] Sharpen `spec-env live take`'s off-base refusal for the spec-start gate:
      it already refuses when the primary is not on base — make the message
      name the in-flight spec (from the receipt when present) and the three
      ways out, so the skill can relay it verbatim.
- [x] Give `spec-next` a scriptable in-flight answer: extend `spec-env live
      status` (or `spec-env resolve`) so "which spec is in flight here, if
      any" is one call with a stable line format — the skill must not parse
      prose.
- [x] Verify `live take` composes with a just-provisioned worktree (fresh
      branch, zero commits ahead): the rebase is a no-op and the switch works.
      Record the observed behaviour; fix the engine if any step assumes
      commits exist.
- [x] Remove nothing yet: `open.tab`/`tabRemote` were never built (the pivot
      predates Phase 3 of the old plan), so this phase adds no config keys and
      deletes none.
- [x] Add/extend tests: refusal wording, the in-flight query's format (fire +
      stays-silent on a free checkout), fresh-worktree take; run `pnpm build`
      + `pnpm test` — green before the phase is done.

## Notes

**`live take` on a zero-commit branch: verified working.** In a throwaway repo,
a freshly provisioned branch (0 commits ahead of base) takes the primary
cleanly — the rebase is a no-op, the worktree detaches, the receipt records it.
No engine change was needed.

**`pnpm exec skitterspec` runs the BUILT DIST, not the working source.**
`node_modules/@skitterbyte/skitterspec-linear` symlinks to
`packages/skitterspec-linear`, whose `src/` is vendored at `prepack`/build time —
so a source edit is invisible to `pnpm exec` until `pnpm build` runs. Verify
engine changes with `node packages/common/bin/skitterspec.js …` (live source) or
rebuild first. This cost a confusing minute mid-phase: the new `in-flight:` line
was present in the source and absent from the command's output.
