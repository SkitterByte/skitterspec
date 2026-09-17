---
linear_issue_id: "SKS-321"
---

# Phase 1 — The tiers, and what turns them on ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `review.allowNetwork` and `review.allowRemote` exist, decide the bind
and whether publishing is permitted, and `spec-env review allow <tier>` writes
them — proven by a test that flips each and watches the bind follow.

## Tasks

- [ ] Add `review.allowNetwork` (default `true`) and `review.allowRemote`
      (default `false`) to `DEFAULT_CONFIG`, validated the way the other review
      keys are: a non-boolean leaves the default standing rather than being read
      as a refusal.
- [ ] **Take the bind from `allowNetwork`, not from reader detection.** That is
      the last thing detection decided, and the guess is what this spec exists
      to remove: `allowNetwork` binds `0.0.0.0`, off binds loopback.
- [ ] Say beside it that `reader` now decides only wording on a failed serve, and
      that if it ever decides nothing it should be **removed** rather than kept
      as a vestige.
- [ ] Add `spec-env review allow <network|remote> [--off]`, which writes the
      setting into `specs/.core/env.config.json` and prints what changed.
- [ ] **`allow remote` permits, it does not publish.** Say so in its output, and
      say what a publish costs: a page skitterspec cannot delete, and a verdict
      there needs `/spec-reviewed` rather than waking the wait.
- [ ] **Name the blind spot beside the writer** (`.claude/rules/negative-checks.md`
      rule 2): it edits a **committed** config file, so turning network reviews
      on for yourself turns them on for everyone who pulls. Say that in the
      output rather than leaving it to be discovered by a colleague's render.
- [ ] Tests: each setting defaults as specified; `allow network` then a render
      binds every interface, `allow network --off` binds loopback; a non-boolean
      in the file leaves the default; `allow remote` writes the key and publishes
      nothing.
- [ ] **Stays-silent test** (rule 3): a project with neither key in its config
      behaves exactly as it does today — network on, remote off, same bind, same
      URL.
- [ ] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

The bind moving off detection is the quiet win here. `feat-every-render-serves`
stopped detection deciding *whether* to serve and `feat-one-review-link` stopped
it deciding the URL's shape; this takes the last decision it had. Each of those
was a separate incident, which is the argument for doing it by setting rather
than by a better guess.

Writing a committed file is the part to be careful about. `allow network` is a
convenience for one person and a change for the whole repo, and the output is
the only place that can say so.
