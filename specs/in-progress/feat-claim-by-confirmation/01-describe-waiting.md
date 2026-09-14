---
linear_issue_id: "SKS-228"
---

# Phase 1 — The engine describes what is waiting ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a render says what is waiting and not merely how much, so the agent can
name a code without ever opening the store — and a pass the operator rejects can
be got rid of.

## Tasks

- [x] Report each waiting pass on the render, not a bare count: its **code**, its
      **verdict**, and how long it has been waiting. The age is what makes a
      stranger's pass visible as one — "3 days ago" is not a review anyone in
      this conversation just sent.
- [x] Carry the same list in `--json` as `pending[]`, so a skill reads structured
      data rather than parsing the human line.
- [x] Do **not** include the blob. The counts and the verdict are what a decision
      needs; the notes are what a claim is for, and reporting them here would put
      an unclaimed stranger's text into the context.
- [x] Add `spec-env review <spec> --drop <code>` — the same match-by-code as
      `--claim`, with the same refusal and the same silence about what else is
      waiting. It removes and merges nothing.
- [x] Keep the ordering stable and oldest-first, so two renders in a row name the
      passes in the same order and a reader can trust what they just read.
- [x] Tests: the render names code, verdict and age; `--json` carries `pending[]`
      with no blob; `--drop` removes exactly the pass named and refuses an
      unknown code without listing; ordering is stable across renders.
- [x] **Stays silent:** a spec with no holding area renders byte-identically to
      how it does today, and neither flag changes that
      (`.claude/rules/negative-checks.md` rule 3).
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The agent must be able to do its whole job from the render's output. If it still
has to open `.pending.json` to find a code, phase 2's rule is a request rather
than a discipline — the file is right there and reading it is one command.
