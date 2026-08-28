# Phase 2 — Surface the deferral: CLI, `/spec-go`, docs ⬜

> **Status:** Not started

## Goal

Make the deferral visible where someone would otherwise read it as a mirror that
lost its phases, and make `/spec-go` mint the sub-issues when the work starts.

## Tasks

- [ ] Report the withheld count from the engine so the CLI does not have to
      re-derive it — carry it on the push result (a plan field, like `legacy`,
      not a stderr warning: `--json` sends warnings to stderr and the skill that
      applies the plan is exactly the consumer that would miss them).
- [ ] `spec-sync push` (`packages/linear/src/cli-sync.js`): print
      `N phase(s) deferred until the spec starts` when any were withheld, so an
      empty-of-sub-issues plan reads as deliberate.
- [ ] `spec-sync status`: same line, so the read-only report agrees with what a
      push would do.
- [ ] Update the `spec-go-pull` seam
      (`packages/linear/assets/seams/spec-go-pull.md`): under
      `mapping.phases: "deferred"` the push is **not** optional — `/spec-go` runs
      `/spec-push` itself once the spec is in `in-progress`, because that push is
      what mints the sub-issues. Leave the existing "optional" wording in place
      for `"subissue"`.
- [ ] Note the mode in the `/spec-push` skill
      (`packages/linear/assets/skills/spec-push/SKILL.md`): a plan with no
      sub-issue creates for an unlinked spec is expected under deferral, not a
      sign the phases failed to parse.
- [ ] Document `deferred` in `packages/linear/assets/core/linear.config.md` — the
      `mapping` block comment and the "Spec → Issue, phases → sub-issues"
      section, stating what defers, what does not (Decision 3), and that the
      `Phases` index stays in the description while it does.
- [ ] Add the value as a comment in
      `packages/linear/assets/core/linear.config.json.example` without changing
      the shipped default.
- [ ] Mention it in the `skitterspec-linear` README where sync cost would put
      someone off adopting on a large backlog.
- [ ] Tests: assets tests covering the seam and doc text; CLI tests for the new
      `push`/`status` lines in both TTY and `--json` form.
- [ ] Run the full suite; it must be green before the phase is done.
