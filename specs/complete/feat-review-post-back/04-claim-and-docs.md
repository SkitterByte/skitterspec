---
linear_issue_id: "SKS-221"
---

# Phase 4 — The skill claims, and the docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-diff` takes a code as readily as it takes a paste, and every
surface adopters read describes the round-trip that no longer goes through the
chat.

## Tasks

- [x] Add the claim path to `/spec-diff` §2, **ahead of** the paste path: a bare
      six-digit number in the message is a claim, and the skill runs
      `--claim <code>` rather than asking for the blob.
- [x] Route the claimed pass into the existing §2 steps unchanged — the verdict
      is read, `changes` is still the go-ahead, `discuss` still reports and waits.
      **A claim is a delivery mechanism, not a new decision**, and nothing about
      what the verdict means may differ by how it arrived.
- [x] Say what it cost: a claimed pass never entered the context, so the intake
      note in §2 ("What the intake costs") gains the one line that makes it
      concrete — pasting is proportional to the review, claiming is six digits.
- [x] Keep the paste path documented as equal, not legacy — it is the whole story
      on `file://` (Decision 7).
- [x] Report pending passes on render: `2 passes waiting — claim one with its
      code`. It is information, not a prompt, and nothing refuses over it.
- [x] Update `spec-planning.md`, the CLAUDE.md section, this repo's own CLAUDE.md
      and the docs site: the HAND BACK stage of the pipeline is now a send, with
      the paste named as the local fallback.
- [x] Keep the `/spec-diff` description inside the 500-char budget; add a claim
      trigger only if a bare code genuinely needs to route.
- [x] Tests: the skill prose pins the claim path and that it does not displace the
      paste; the docs-claims guard covers the new endpoint the way it covers
      `review.<key>`; a claimed pass and a pasted one reach the same routing.
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The interesting test is the one proving **a claim and a paste are the same pass**
once they land. If the two paths ever diverge in what they mean, the code has
stopped being a delivery mechanism and become a second kind of review.
