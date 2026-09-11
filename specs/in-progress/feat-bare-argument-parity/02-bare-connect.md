---
linear_issue_id: "SKS-146"
---

# Phase 2 — bare `/spec-connect` connects ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-connect` with no argument points the canonical ports at the
resolved spec, and `/spec-connect main` remains the way to hand them back.

## Tasks

- [ ] Remove `const target = specArg || 'main'` from `specEnvConnect` in
      `packages/common/src/cli.js`. Resolve a missing argument the way every
      other verb does, so `connect` reaches `resolveSpecWithWorktree` /
      `soleProvisionedSpec` and gets the standing-in-a-worktree answer.
- [ ] Keep `main` and the configured base branch as the disconnect form,
      including the literal `main` in a repo whose base is named something else
      — the same courtesy `liveGrammar` already extends.
- [ ] Let ambiguity **refuse**, not fall back. Unlike `live`, `connect` has no
      read-only report to degrade to, so several worktrees means naming them and
      stopping — which is what `soleProvisionedSpec` already prints. Do not
      invent a fallback to `main`: that would reinstate the inversion this phase
      removes, at exactly the moment the user is least sure what is connected.
- [ ] Leave the checkout-mode no-op ahead of it alone. `connect` already reports
      that it does not apply in `checkout` mode before any resolution happens,
      and that must stay the first thing it says.
- [ ] Invert the stays-silent guard in
      `packages/common/test/cli-spec-env-zero-arg.test.js` — `` `connect` with no
      spec still means main (disconnect) `` becomes the assertion that it
      connects the sole spec. Carry a comment naming
      `feat-script-only-commands` Decision 8 and why this spec supersedes it, so
      the next reader finds the reversal rather than assuming the old test was
      wrong.
- [ ] Add tests: bare connects the sole provisioned spec; bare connects the spec
      whose worktree the caller stands in; bare refuses and names the candidates
      with several worktrees; `connect main` still disconnects; `connect <base>`
      still disconnects where the base is not `main`.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done.

## Notes

**This is the phase with a muscle-memory cost.** Someone who types bare
`/spec-connect` expecting to disconnect now connects instead. It is fully
recoverable in one command, and the release note must say the old form changed
rather than only advertising the new one — a release note that describes a
reversal as an addition is how people find out by being surprised.
