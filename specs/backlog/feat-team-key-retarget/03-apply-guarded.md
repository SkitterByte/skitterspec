# Phase 3 — Apply it, guarded and spot-checked ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `--yes` performs the rewrite as one reviewable change, refusing when
the tree is already dirty.

## Tasks

- [ ] Add `applyRetarget(plan, { dir, git })` to `retarget.js`: write the
      frontmatter rewrites, `git mv` each snapshot, rewrite `subIssues` keys, and
      set `config.linear.teamKey` — editing the config as text so unrelated
      formatting is preserved.
- [ ] Guard first: refuse when any file the plan would touch has uncommitted
      changes, naming them. The rewrite must land as one revertable change.
- [ ] Re-run the spot-check at apply time, not just at plan time, so a stale plan
      cannot be applied.
- [ ] Wire `--yes` in `cli-sync.js`; print what changed and that nothing was
      pushed — the mirror is untouched, only the repo's stamps moved.
- [ ] Point `/spec-status` at `retarget` when it sees a recorded/live key
      mismatch, and document the verb in `linear.config.md`.
- [ ] Add an end-to-end test over a fixture repo with real `git`: stamped specs,
      snapshots and config in, everything remapped out, prose byte-identical,
      snapshots renamed with history preserved (`git log --follow`).
- [ ] Add a dirty-tree refusal test.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

Deliberately **not** followed by a push. Retarget fixes the repo's stamps so the
existing mirror is reachable again; it creates and updates nothing in Linear. The
next ordinary `/spec-push` is what reconciles content, and it will now find its
issues.
