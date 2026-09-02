# Phase 3 — Apply it, guarded and spot-checked ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `--yes` performs the rewrite as one reviewable change, refusing when
the tree is already dirty.

## Tasks

- [x] Add `applyRetarget(plan, { dir, git })` to `retarget.js`: write the
      frontmatter rewrites, `git mv` each snapshot, rewrite `subIssues` keys, and
      set `config.linear.teamKey` — editing the config as text so unrelated
      formatting is preserved. *(Shipped in 10.4.0 as `repairDrift`, including the textual config edit and the `git mv` with rename fallback; moves and is renamed with phase 1.)*
- [x] Guard first: refuse when any file the plan would touch has uncommitted
      changes, naming them. The rewrite must land as one revertable change.
      *(Shipped in 10.4.0 — note it refuses on **any** dirty file, not only the ones in the plan. Broader than specified; keep it, and say so in the refusal.)*
- [x] Re-run the spot-check at apply time, not just at plan time, so a stale
      plan cannot be applied. *(Satisfied by construction: `retarget` has no `--plan` file — it plans and applies in one invocation, so the single spot-check already runs against the plan being applied. A second call would read the same issue twice in the same second. Revisit if a `--plan` flag is ever added.)*
- [x] Wire `--yes` in `cli-sync.js` (renaming the shipped `--write`); print what
      changed and that nothing was pushed — the mirror is untouched, only the
      repo's stamps moved.
- [x] Point `/spec-status` at `retarget` when it sees a recorded/live key
      mismatch, and document the verb in `linear.config.md`.
- [x] Add an end-to-end test over a fixture repo with real `git`: stamped specs,
      snapshots and config in, everything remapped out, prose byte-identical,
      snapshots renamed with history preserved (`git log --follow`).
- [x] Add a dirty-tree refusal test.
- [x] Add asset guards so a renamed verb cannot leave the docs behind: every
      verb `/spec-sync` routes to must be dispatched by `cli-sync.js`, the
      `retarget` pointers must exist in `/spec-status` and `linear.config.md`,
      and no shipped asset may name `spec-sync doctor`.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

Deliberately **not** followed by a push. Retarget fixes the repo's stamps so the
existing mirror is reachable again; it creates and updates nothing in Linear. The
next ordinary `/spec-push` is what reconciles content, and it will now find its
issues.
