---
linear_issue_id: "SKS-102"
---

# Phase 4 — Build in the worktree, housekeep first ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-start` finishes what it starts in one invocation — in `worktree`
mode the spec is moved, stamped and committed **in its own worktree**, a session
is opened there, and the live overlay is not involved at any point.

## Tasks

- [ ] Delete step 3.2 of `assets/skills/spec-start/SKILL.md` — the
      `/spec-live <name>` hand-off and the "re-run `/spec-start`" instruction go
      whole. Nothing replaces the branch move: in `worktree` mode the branch stays
      in its worktree.
- [ ] Promote today's step 3.3 (the park path) to the only `worktree`-mode path:
      housekeep with `git -C <worktreePath>`, run `open.command` if configured,
      print the worktree path, hand on to `/spec-next` in that session. Drop the
      "a spec the live overlay refuses" framing — with no live call there is nothing
      to refuse, and a hotfix stops being a special case here.
- [ ] Keep the `/add-dir <trusted root>` note — it matters more now, not less,
      since every worktree-mode start writes into the worktree.
- [ ] Reorder so housekeeping precedes the hand-off, and assert that order in a
      test: it is the whole point, and prose reorders silently.
- [ ] Relax the step 1 gate in `worktree` mode to **clean tree** only. Drop the
      "nothing else in flight" requirement and the `spec-env live status` probe
      there — starting a spec while another is live or parked is the parallelism the
      mode exists for. Leave `checkout` mode's gate exactly as it is.
- [ ] Re-check the wording the gate prints: the three ways out
      (`/spec-complete` · `/spec-cancel` · `/spec-live main`) are a one-workbench
      answer, and in `worktree` mode a dirty tree now has a different fix.
- [ ] Confirm `/spec-next` resolves a spec from the worktree it is run in — it
      already claims to ("by receipt, worktree or branch", `e94edb2`) — and add a
      test if that path is untested, since it becomes the primary route.
- [ ] Confirm `/spec-live` keeps `disable-model-invocation: true` and that no
      lifecycle skill invokes it or the `spec-env live` verbs. It is a testing tool;
      this phase is what gives it back its single job.
- [ ] Re-read `assets/rules/spec-planning.md` and `assets/skills/spec-init/SKILL.md`:
      both already describe worktree mode as "several specs at once, one terminal
      session each", which this phase makes true again. Fix only what is genuinely
      stale, and check `packages/common/README.md`, the root `README.md` and
      `docs/index.html` for one-workbench claims left by `675bf54`
      (`scripts/docs-claims.test.js` guards this class of drift).
- [ ] Extend the asset tests: `/spec-start` never mentions `/spec-live` or
      `spec-env live`, no longer instructs a re-run of itself, and housekeeps before
      handing off.
- [ ] Verify by hand: `/spec` then `/spec-start` in a worktree-mode repo, and
      confirm one invocation ends with the spec in `specs/in-progress/`, `Status:
      In Progress`, `Developer` set, the branch still in its worktree, `main`
      untouched, and a session open there.
- [ ] Run `node --test` and `node scripts/build-dist.js all` — green before the
      phase is done.

## Notes

Phase 3 rewrites the gate section of this same file; land these in order so the
two rewrites do not collide.

This phase partially reverses `675bf54` for `/spec-start` only. The pivot's other
half — that `/spec-next` resolves one spec rather than guessing — stays.
