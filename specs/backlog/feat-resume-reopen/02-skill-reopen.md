---
github_issue_id: "#277"
---

# Phase 2 — Skill: re-open flow in `/spec-resume`, docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-resume` on a completed spec offers re-open, and on a yes
lands the session in a fresh worktree with the spec in-progress, recorded,
committed and its ticket In Progress. It then carries on with resume's own
flow.

## Tasks

- [ ] `spec-resume/SKILL.md` step 1: `ok: false` with an `offer` → relay the
      refusal, then the offered-unblocks picker (label verbatim, Cancel).
      Cancel ends `⏸` and records nothing
- [ ] Add a re-open step: run the `--reopen` plan, `cd`, confirm with
      `spec-env resolve`, `git mv`, Changelog line (reason from the message or
      asked once), State log row and `Status:` reset only when not `pull`
- [ ] Call the `spec-tracker-start` seam (move to In Progress, re-open a
      closed issue, `assign --if-unassigned`) as `/spec-start` does
- [ ] Commit with `spec-env stage` owned paths, pathspec-bounded, as
      `docs(spec): reopen <spec>` + `Refs:`, then join step 3. With all phases
      `✅`, a message becomes a new phase file; with none, ask for the new
      phase
- [ ] Add a `Worktree` **re-opened** wording and a `Spec` "re-opened from
      complete" wording to the skill's Report section
- [ ] Update the `/spec-resume` row and prose in `spec-planning.md`, the
      `spec-resume` entry in `docs/reference.html`, then
      `node scripts/docs-freshness.js verify reference`
- [ ] Run `pnpm typecheck` and `pnpm test`, including the skill/asset
      consistency tests, until both are green
