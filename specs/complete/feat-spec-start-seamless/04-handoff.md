---
linear_issue_id: "SKS-102"
---

# Phase 4 — Build in the worktree, housekeep first ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-start` finishes what it starts in one invocation — in `worktree`
mode the spec is moved, stamped and committed **in its own worktree**, a session
is opened there, and the live overlay is not involved at any point.

## Tasks

- [x] Delete step 3.2 of `assets/skills/spec-start/SKILL.md` — the
      `/spec-live <name>` hand-off and the "re-run `/spec-start`" instruction go
      whole. Nothing replaces the branch move: in `worktree` mode the branch stays
      in its worktree.
- [x] Promote today's step 3.3 (the park path) to the only `worktree`-mode path:
      housekeep with `git -C <worktreePath>`, run `open.command` if configured,
      print the worktree path, hand on to `/spec-next` in that session. Drop the
      "a spec the live overlay refuses" framing — with no live call there is nothing
      to refuse, and a hotfix stops being a special case here.
- [x] Keep the `/add-dir <trusted root>` note — it matters more now, not less,
      since every worktree-mode start writes into the worktree.
- [x] Reorder so housekeeping precedes the hand-off, and assert that order in a
      test: it is the whole point, and prose reorders silently.
- [x] Relax the step 1 gate in `worktree` mode to **clean tree** only. Drop the
      "nothing else in flight" requirement and the `spec-env live status` probe
      there — starting a spec while another is live or parked is the parallelism the
      mode exists for. Leave `checkout` mode's gate exactly as it is.
- [x] Re-check the wording the gate prints: the three ways out
      (`/spec-complete` · `/spec-cancel` · `/spec-live main`) are a one-workbench
      answer, and in `worktree` mode a dirty tree now has a different fix.
- [x] Confirm `/spec-next` resolves a spec from the worktree it is run in, and add
      a test if that path is untested — it becomes the primary route. Do **not**
      teach it to target a worktree from the primary checkout: that refusal is
      deliberate, and decision 13 accepts the hand-off instead.
- [x] Say plainly in the skill that in `worktree` mode `/spec-start` ends at the
      opened session, and phase 1 is built there — only `checkout` mode carries
      straight on. Step 6 currently promises the latter for both.
- [x] Confirm `/spec-live` keeps `disable-model-invocation: true` and that no
      lifecycle skill invokes it or the `spec-env live` verbs. It is a testing tool;
      this phase is what gives it back its single job.
- [x] Re-read `assets/rules/spec-planning.md` and `assets/skills/spec-init/SKILL.md`:
      both already describe worktree mode as "several specs at once, one terminal
      session each", which this phase makes true again. Fix only what is genuinely
      stale, and check `packages/common/README.md`, the root `README.md` and
      `docs/index.html` for one-workbench claims left by `675bf54`
      (`scripts/docs-claims.test.js` guards this class of drift).
- [x] Extend the asset tests: `/spec-start` never mentions `/spec-live` or
      `spec-env live`, no longer instructs a re-run of itself, and housekeeps before
      handing off.
- [x] Verify by hand: `/spec` then `/spec-start` in a worktree-mode repo, and
      confirm one invocation ends with the spec in `specs/in-progress/`, `Status:
      In Progress`, `Developer` set, the branch still in its worktree, `main`
      untouched, and a session open there.
- [x] Run `node --test` and `node scripts/build-dist.js all` — green before the
      phase is done.

## Notes

Phase 3 rewrote the gate section of this same file; landing them in order kept
the two rewrites from colliding.

This phase partially reverses `675bf54` for `/spec-start` only. The pivot's other
half — that `/spec-next` resolves one spec rather than guessing — stays.

**As built.**

- **The gate is now mode-shaped.** `worktree` mode asks only for a clean tree;
  the "on base, nothing in flight" requirement and the `spec-env live status`
  probe are gone from that path, because a spec built in its own worktree does
  not conflict with another one. `checkout` mode keeps the full gate.
- **`/spec-live main` stopped being a way out of the gate.** Parking to free the
  workbench is a one-workbench answer, and only `checkout` mode holds one spec
  now — so the ways out are `/spec-complete` and `/spec-cancel`.
- **Six existing asset tests guarded the old hand-off** and were rewritten rather
  than deleted: they now assert the skill *never* routes a start through the live
  overlay, never asks to be re-run, and housekeeps before handing off.
- **The skill description was stale in the same way** — it promised a refusal
  "unless the checkout is on the base branch with nothing already in flight".
  Rewritten, and still inside the 500-character budget at 312.
- **Outward docs corrected**: `packages/common/README.md` and two places in
  `docs/index.html` said `/spec-start` puts the spec in flight *"on this
  checkout"*. The landing page's isolation claim — several specs side by side,
  `main` free — needed no change; this phase makes it true again.
