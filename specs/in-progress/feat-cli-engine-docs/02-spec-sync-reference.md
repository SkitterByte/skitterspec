---
linear_issue_id: "SKS-60"
---

# Phase 2 — `spec-sync` reference on linear.html ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `linear.html` documents all seventeen `spec-sync` verbs with the same
Run-by split, and the guard from Phase 1 covers this engine too.

## Tasks

- [ ] Classify all seventeen verbs — `apply`, `credentials`, `doctor`,
      `init-config`, `linked`, `normalize`, `projects`, `push`, `record`, `ref`,
      `released`, `retarget`, `stage`, `stamp`, `states`, `status`, `verify` —
      from `packages/linear/src/cli-sync.js` and the `/spec-sync` skill's own
      table, which already states which are user-facing.
- [ ] Add the reference section to `docs/linear.html`, matching the page's
      existing table and section markup.
- [ ] Link the three verbs that already have narrative sections (`doctor`,
      `credentials`, `retarget`) to those sections from the table rather than
      restating them (Decision 3).
- [ ] Note the invocation these need: `spec-sync` is only ever reached through the
      provider bin (`pnpm exec skitterspec-linear spec-sync …`) because the CLI is
      never on `PATH` — the `/spec-sync` skill says exactly this and the page
      should not contradict it.
- [ ] Quote **real** output for the `you` verbs — run each and paste it.
      `ref` and `released` exit non-zero with no output when there is nothing to
      report; show that honestly rather than inventing a success case.
- [ ] Register the deliberately-internal verbs in the `UNDOCUMENTED` allowlist
      with reasons, and confirm every other verb appears on the page.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

`spec-sync` is the bigger surface but the easier phase: the `/spec-sync` skill
already carries a routing table from intent → verb, and much of that prose can be
adapted rather than written fresh.

Watch the `status` collision — both engines have a `status` verb and they do
unrelated things (`spec-env status` reports isolation; `spec-sync status` is the
Linear drift report). The guard must key on engine + verb, not the bare word, or
documenting one will appear to satisfy the other.
