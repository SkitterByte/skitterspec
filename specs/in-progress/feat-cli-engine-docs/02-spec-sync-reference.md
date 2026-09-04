---
linear_issue_id: "SKS-60"
---

# Phase 2 — `spec-sync` reference on linear.html ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `linear.html` documents all seventeen `spec-sync` verbs with the same
Run-by split, and the guard from Phase 1 covers this engine too.

## Tasks

- [x] Classify all seventeen verbs from the dispatch and `spec-sync --help`, cross-read
      against the `/spec-sync` skill's own intent→verb routing table. Three groups:
      **plumbing** the push path drives (9), **setup & health** (4), and
      **reporting** you'd type yourself (4).
- [x] Add the reference section to `docs/linear.html`, matching `index.html`'s
      table markup. The page had no table before, but its stylesheet already
      carried the rules (`tbody td.cmd`, line 444), so no CSS was needed.
- [x] Link `doctor`, `credentials` and `retarget` to their existing narrative
      sections (`#check`, `#fix`) from the table rather than restating them.
- [x] State that `spec-sync` is only ever reached through the provider bin
      (`pnpm exec skitterspec-linear spec-sync …`), since the CLI is never on
      `PATH` — matching what the skill already says.
- [x] Quote **real** output for `ref` and `released`, run in this worktree. Note
      honestly that `ref` exits non-zero and prints nothing when a commit has no
      ticket, rather than showing only a success case.
- [x] Register `spec-sync` in the `ENGINES` map so both guard directions cover it.
      All seventeen are documented, so the `undocumented` allowlist stays empty —
      verified by counting rather than by the suite merely passing.
- [x] Run `pnpm test` — **1263 green** — and `pnpm build`.

## Notes

`spec-sync` is the bigger surface but the easier phase: the `/spec-sync` skill
already carries a routing table from intent → verb, and much of that prose can be
adapted rather than written fresh.

The `status` collision was handled by design, not by luck: the guard keys on
engine + verb and reads each engine's own page, so `spec-env status` on
index.html and `spec-sync status` on linear.html are checked independently.

Original note — watch the `status` collision — both engines have a `status` verb and they do
unrelated things (`spec-env status` reports isolation; `spec-sync status` is the
Linear drift report). The guard must key on engine + verb, not the bare word, or
documenting one will appear to satisfy the other.
