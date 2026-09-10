---
linear_issue_id: "SKS-128"
---

# Phase 1 — Route the four user-facing verbs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** asking `/spec-sync` about credentials, identity, teammates or the
deployment ladder reaches the right verb, proven by an assets test.

## Tasks

- [x] Add a routing row for **`credentials`** — "set / check my Linear key",
      "am I authenticated?" — pointing at `credentials <status|set|unset>`.
- [x] Add a routing row for **`whoami`** — "who am I in Linear?", "why is it
      assigning to the wrong person?" — noting `--set` for a shared or bot key.
- [x] Add a routing row for **`users`** — "who is on this team?", "find Jane's
      user id" — as the way to resolve a person without hand-typing an id.
- [x] Add a routing row for **`stage`** — "move the shipped tickets on", "what is
      on test?" — and say it writes only with `--apply`, so the dry run is the
      default (matching how the skill already frames `apply --all`).
- [x] Keep each row's phrasing in the user's words, not the engine's — the table
      exists to match what someone types, and a row that only repeats the verb
      name routes nothing that was not already obvious.
- [x] Do **not** add rows for `push`, `status`, `record`, `assign` or
      `normalize`. The first two are deliberately deferred (the skill's own
      "Defer, don't duplicate" section), and the rest are driven by another skill
      or internal — decision 3.
- [x] Extend `packages/linear/test/assets.test.js`: assert each of the four verbs
      appears in the routing table, and that the deferral of `push`/`status` is
      still stated rather than replaced by a row.
- [x] Run `pnpm test` in `packages/linear` and at the repo root — green before the
      phase is done. (This repo has no separate typecheck step.)

## Notes

`credentials` is absent from the skill entirely today — not merely from the
table — so this is four additions, not three plus a move.
