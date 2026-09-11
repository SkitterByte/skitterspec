---
linear_issue_id: "SKS-141"
---

# Phase 3 — `/spec-diff`: the written review, and publishing ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-diff` renders the page for whatever is in front of you, adds a
written review, and — only when asked — publishes it so it can be read on a
phone, remembering the link so later phases update it rather than adding another.

## Tasks

- [ ] Add `packages/common/assets/skills/spec-diff/SKILL.md`. Resolution order:
      the name argument, else the spec in flight for this session, else the
      worktree the session is standing in. An unknown name refuses; an ambiguous
      session lists the candidates.
- [ ] **Gate it on nothing.** Not on tests passing, not on the phase being
      finished, not on the spec being this session's. Half-built work is the
      normal input, and a refusal lands exactly when someone wants to look.
      State this in the skill so a later edit does not "tidy" a gate back in.
- [ ] Write the review as JSON for `spec-env review --review <file>`: a short
      read of what the phase did, plus checks tagged `flag` · `confirm` · `good`,
      each naming the file it is about. Keep it to what the diff shows — this is
      a review, not a re-derivation of the spec.
- [ ] Say what it costs before spending it. The page itself is free; the written
      review is ~700 output tokens. On `--page-only`, render and stop.
- [ ] Publish only when asked. On first publish, store the URL at
      `.spec-env/reviews/<spec>.url`; on every later phase, update **that** URL
      with a version label (`phase-3`) so one spec is one entry. Never mint a
      second page for a spec that already has one.
- [ ] Degrade in one line when the harness cannot publish: report the local file
      path and carry on. The engine must stay ignorant of publishing entirely.
- [ ] Mark the skill model-invocable so `/spec-next` can offer it, and say in the
      skill that publishing is never automatic — it leaves something behind that
      the tooling cannot remove.
- [ ] Add `packages/common/test/assets-spec-diff.test.js`: the skill documents
      all three resolution rules, states the no-gate rule, names the token cost,
      and never instructs an unprompted publish. Add a stays-silent case — a spec
      with no worktree is reported, not accused.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done.

## Notes

Per-file structured feedback from the published page — ticking "reviewed" or
"needs work" and reading it back into the session — is **out of scope here**. It
depends on a runtime capability that has not been verified as available, and the
comment thread on a published page already covers the same ground for free.
Revisit it with evidence, not with an assumption.
