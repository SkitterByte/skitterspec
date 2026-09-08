---
linear_issue_id: "SKS-85"
---

# Phase 3 — Pair `--here` with the viewer ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `--here` stops being a warned-against corner and becomes the
documented one-session worktree workflow, with `/spec-diff` as its other half.

## Tasks

- [ ] Amend `/spec-go`'s `--here` bullet: keep the cost sentence, add the
      remedy — "pair it with `/spec-diff <name>`, which the user types to open a
      viewer tab whose branch chip and diff panel follow the worktree". Note the
      hand-off remains the default.
- [ ] Mention `/spec-diff` where the workspace modes are described
      (`spec-planning.md` and `env.config.md`'s mode block): worktree mode's
      one-session variant is `--here` + `/spec-diff`.
- [ ] Extend the assets tests: `--here` names `/spec-diff`; the hand-off default
      is unchanged (pin); the command is never described as model-invocable.
- [ ] Rebuild dists (`pnpm build`); run `pnpm test` — green before the phase is
      done.
