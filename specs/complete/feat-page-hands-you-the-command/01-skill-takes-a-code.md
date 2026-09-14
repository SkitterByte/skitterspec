---
linear_issue_id: "SKS-242"
---

# Phase 1 — The skill takes a code ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-reviewed 608223` claims exactly that pass, so a pasted command
is the whole interaction — and the page has something real to offer before it
offers it.

## Tasks

- [x] Accept a **six-digit code** as a third argument shape beside a spec name
      and a tracker id. Nothing else matches `^\d{6}$`, so the parse needs no
      flag and no ambiguity survives.
- [x] On a code, resolve the spec as a **bare** invocation does — the worktree
      you are standing in, else the sole provisioned one — then claim that code
      there. The code says *which pass*; it does not say which spec.
- [x] **Skip the offer-and-confirm step.** A code pasted from the operator's own
      page is definitionally theirs; the echo existed because the agent was
      proposing a code, and here the operator supplied one. Say what was claimed
      and route on the verdict.
- [x] A code that matches nothing **refuses and names nothing**, exactly as
      `--claim` does — listing the waiting codes would hand a guesser the answer
      whichever door they came through.
- [x] **Keep the verify-by-echo path intact** for a bare invocation: the operator
      says a pass is waiting, the agent names a code back. Pasting is the faster
      path, not the only one.
- [x] Say in the skill body **why a pasted code needs no verification**, so a
      later edit does not restore the round-trip as a safety measure it is not.
- [x] Tests: the prose pins the code shape, the bare-resolution rule, the skipped
      echo and its reason, and that a wrong code names nothing; the shapes do not
      collide (`feat-x`, `SKS-227`, `608223` each route to the right one).
- [x] **Stays silent:** a bare invocation behaves exactly as it does today
      (`.claude/rules/negative-checks.md` rule 3).
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

Build this before the page half. A page that offers `/spec-reviewed 608223`
before the skill understands it hands the operator a command that fails — and
the failure would look like the paste was wrong rather than early.
