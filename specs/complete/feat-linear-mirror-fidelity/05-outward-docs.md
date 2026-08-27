---
linear_issue_id: "SKI-27"
---

# Phase 5 — Refresh the outward-facing docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the npm README and the GitHub Pages landing page describe what the sync
actually does after Phases 2-4; proven by a grep-based assets/docs test that no
"tasks are not synced" claim survives.

## Tasks

- [x] `packages/skitterspec-linear/README.md` — the "What pushes" paragraph
      still says "Tasks are **not** synced — they stay in the repo phase
      files". Replace with the mirrored-checklist behaviour and name
      `mapping.tasks`. This is the npm package front page, so it is the most
      widely read of these surfaces.
- [x] `docs/index.html` (GitHub Pages) — three stale claims: the push section
      ("Tasks stay in the repo."), the mapping diagram row (`task checkbox` →
      `repo only` / "tasks stay in the phase file"), and the closing summary
      ("Tasks stay in the repo."). The diagram row is the load-bearing one — it
      is a visual claim about where tasks live.
- [x] `docs/index.html` — the command table lists the lifecycle skills; add
      `spec-sync stamp` where the other `spec-sync` subcommands appear, and
      check whether the `/spec-push` row still describes the id-stamping step
      accurately after Phase 4.
- [x] `packages/skitterspec-linear/README.md` — its `spec-sync` CLI bullet
      enumerates subcommands; add `stamp`.
- [x] Mention the phase-status warnings (Phase 2) wherever the README or landing
      page describes what `/spec-status` reports — it is now a second class of
      finding, not just push-drift.
- [x] Add a test that greps the shipped READMEs and `docs/index.html` for
      "tasks are not synced" / "tasks stay in the repo" and fails on a hit, so
      the claim cannot silently return. Keep it narrow enough not to fire on
      prose that legitimately says tasks are not *individually issues*.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

**The guard found a surface the hand-sweep missed.** `packages/common/README.md`
— the *base* package's front page — also said "tasks are **not** synced", and it
was not in the list this phase was written from. Written first, the grep test
caught it immediately. That is the argument for the test over a careful read.

**Deviation on the command table.** The task said to add `spec-sync stamp` to
`docs/index.html`'s command table "where the other `spec-sync` subcommands
appear". They don't appear — that table lists the lifecycle *skills*, not CLI
subcommands. `stamp` went into the README's `spec-sync` CLI bullet instead
(`normalize · push · stamp · record · status · linked`). The `/spec-push` row was
re-read after Phase 4 and is still accurate: it says "stamps IDs back", which is
what the skill now does via `stamp`.

**The guard is narrow on purpose.** "No issue is created per task" is still true
and must stay sayable, so only the "not synced / stays in the repo" framing is
forbidden. Two of its three tests exist to prove that boundary: one that the
pattern fires on the retired phrasings, one that it does not fire on the
replacements. A guard that matches nothing reads as coverage while providing
none.

Added 2026-08-27, after Phase 3, when a sweep for stale "not synced" claims found
that the fix had stopped at the package assets and never reached the npm README
or the landing page. Those are the surfaces a prospective user reads first, so a
correct engine described by a wrong README is still a wrong product.

Sequenced after Phase 4 deliberately: `spec-sync stamp` changes the same command
listings, so both land in one documentation pass rather than two.
