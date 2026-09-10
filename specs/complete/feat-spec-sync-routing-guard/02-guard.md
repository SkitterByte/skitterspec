---
linear_issue_id: "SKS-129"
---

# Phase 2 — The guard that keeps them routed ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a `spec-sync` verb the docs mark "used by: you" cannot ship unrouted —
the suite fails until someone routes it or reclassifies it.

## Tasks

- [x] Add the guard to `scripts/docs-claims.test.js`, beside the existing
      both-ways engine checks. It already parses the docs pages **and** the
      shipped skills tree, so neither reader is new.
- [x] Read each `spec-sync` row's **used-by cell** from `docs/linear.html` and
      require every verb whose cell contains `you` to appear in
      `spec-sync/SKILL.md`'s **routing table**. A cell naming a skill, or
      `internal`, is exempt (decision 1).
- [x] Parse the routing table specifically — the `| ask | run |` rows — never the
      whole file (decision 2). Assert the parser found the table at all, the way
      `each engine dispatch is readable` guards its own reader: a table matcher
      that silently finds nothing would make this check pass forever.
- [x] Name the blind spot in a comment beside the check: this is only as good as
      the used-by column, and a verb mis-labelled `internal` is invisible to it.
      That column is itself guarded for existence, not for being *right*.
- [x] Write the failure message so it names the fix — route it, or correct the
      used-by cell — rather than only reporting the mismatch.
- [x] Add the **stays-silent** tests (`.claude/rules/negative-checks.md` rule 3):
      a verb that is routed does not fire; a `used by: <skill>` verb such as
      `push` does not fire; a `used by: internal` verb such as `normalize` does
      not fire. Without these the guard could pass by accusing everything or
      nothing.
- [x] Prove it fires: temporarily drop a routed row and confirm the suite goes
      red, then restore it. A guard nobody has watched fail is a guard nobody
      knows works.
- [x] Run `pnpm test` in `packages/linear` and at the repo root — green before the
      phase is done.

## Notes

Scope is `spec-sync` only. `spec-env`'s verbs are reached through the lifecycle
skills and the `/spec-connect` · `/spec-live` commands, not one routing table, so
there is nothing equivalent to check against — adding a second engine here would
mean inventing a rule rather than enforcing one.
- [x] Route `doctor`, the fifth user-facing verb — found by the guard on its
      first run, not by the analysis that wrote this spec.
- [x] Widen the existing reverse guard (`every spec-sync verb the skill routes
      to is a real subcommand`) to accept both dispatch forms, so routing
      `doctor` does not trip it.
