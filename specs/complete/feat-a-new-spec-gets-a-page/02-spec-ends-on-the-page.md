---
linear_issue_id: "SKS-302"
---

# Phase 2 — `/spec` ends on the page, and the button commits it ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec` finishes by rendering the authoring page and waiting;
`Commit & Start` commits the spec and provisions it, `Commit` commits and stops,
and no spec reaches `/spec-start` uncommitted.

## Tasks

- [x] End `/spec` (Phase C) by rendering `spec-env review <spec> --docs` and
      waiting with `spec-env review wait <spec> --since <that moment>` — the
      engine's wait, never one composed for the occasion
      (`.claude/rules/spec-reports.md`).
- [x] Emit the review banner rather than a `Review` row, since the run is
      waiting, and name this page's two exits: `Commit & Start` and `Commit`.
- [x] Route `commit-start`: hand off to `review.commitWith` (`/commit` by
      default) with the pass's owned pathspec, then run `/spec-start <name>` —
      and stop there, exactly as `commit-continue` stops after `/spec-next`.
- [x] Route `commit`: the same commit, then finish. The spec stays `Ready` in
      `backlog`.
- [x] Route `changes`: edit the spec from the notes, record a resolution per note
      so the next render strikes each through with what changed, re-render, and
      wait again.
- [x] Route `discuss`: report and talk, claiming nothing — as everywhere else.
- [x] **Arm nothing.** No `spec-env review arm` call in this path. Assert it: a
      `/spec` run must leave `spec-env review gate --check` exiting 0.
- [x] **Render nothing when nothing was written.** A `⏸` `/spec` — grilling that
      never resolved — has no spec to show and must not wait for a verdict on
      one.
- [x] Tests: the skill contains the wait and the banner; the two committing
      verdicts route to the two different endings; `commit-start` is absent from
      the mid-run set so it cannot be pressed on a phase page; the `⏸` path
      renders nothing; the skill arms nothing.
- [x] **Stays-silent test** (rule 3): a project with `review.required: false`, or
      with no `env.config.json` at all, sees `/spec` behave exactly as it does
      today — no page, no wait.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

This is the phase that changes the ending of every `/spec`, so the stays-silent
test matters more than usual: a project that has not adopted isolation must not
suddenly start waiting for a button that cannot be rendered.

`/spec-start` keeps its own commit-the-spec-if-that-is-all-that-is-uncommitted
behaviour. It becomes the fallback rather than the normal path, and it is what
covers a spec written before this landed.

**The arming guard had to be anchored, and the naive form failed on its own
prohibition.** `doesNotMatch(/spec-env review arm/)` cannot work here: the skill
has to name the command in order to forbid it, so the guard matched the sentence
banning the thing it was guarding against. It now looks for a *call* — a line
beginning `skitterspec spec-env review arm` — and asserts the prohibition text
separately, since the call check alone cannot tell you the rule is still written
down. Proved red by pasting a fenced `review arm` into the skill. This is the
same failure the landed `feat-no-pass-waits-unheard` hit with `/never claim/`,
reached independently.

**The project's no-wrapped-emphasis rule caught three of my own spans.** Bold
running across a hard line break is banned because round-tripping editors mangle
it; the test names the file and line numbers, so the fix was mechanical.
