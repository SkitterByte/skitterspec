---
linear_issue_id: "SKS-88"
---

# Phase 2 — Build /spec-start ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-start <name>` takes a backlog spec to "building has begun":
provisioned, moved, mirrored, and handed off (or flowed into `/spec-next`).

## Tasks

- [ ] Create `packages/common/assets/skills/spec-start/SKILL.md` from `spec-go`'s
      steps 1–2b: identify, mode branch (worktree provision via `spec-env up` /
      checkout via the printed `git switch`), bootstrap, dev servers (confirm
      first), then — new — the spec move, header stamps, State-log row and
      tracker refresh happen **from the parent via `git -C <worktree>`**, and are
      committed + pushed before any hand-off (Decision 4: mechanical
      housekeeping only; code never happens here).
- [ ] End by mode: worktree + `open.tab` configured → run `spec-env tab <name>`
      (Phase 3) and end the turn; worktree without it → today's fallback
      (opener/path + "run `/spec-next` there"); checkout → continue inline as
      `/spec-next`. Keep `--here`, `--no-worktree`, `--plan` opt-outs with
      today's wording, `--here` pointing at `/spec-next` now.
- [ ] Fold `/spec-bug`'s and `/spec-hotfix`'s stub-move instructions down to
      "spec-start moves it" where applicable — the parent-side move is now the
      designed path, not a gotcha (keep the `mkdir -p` rationale with it).
- [ ] Add/extend tests: hand-off ends the turn (pin), never hands off twice
      (pin), checkout mode carries straight on, description budget; run
      `pnpm build` + `pnpm test` — green before the phase is done.
