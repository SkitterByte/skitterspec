---
linear_issue_id: "SKS-326"
---

# Phase 2 — The page's line, and the action behind it ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the page carries one labelled live line above the verdicts, and a press
reaches the engine as an **action** that no part of the verdict machinery mistakes
for a conclusion.

## Tasks

- [x] Accept `action: 'live-on' | 'live-off'` on the pass blob in
      `validateNotesBlob`, as an alternative to `verdict` — never both in one
      pass, and neither one defaulting to the other.
- [x] Keep `VERDICTS` and `COMMITTING` untouched, and assert that in a test: an
      action must be structurally unable to clear an armed gate (decision 2).
- [x] Record it with `appendDecision`'s log as `{action, at, code}`, so the
      history distinguishes what the engine did from what the reader concluded
      (decision 9).
- [x] Render the line in `page.html` above the verdict row, from the `live` key
      the render now carries — state, the one action that changes it, and the
      running URL when there is one. Visually separate from the verdicts.
- [x] Show it on the `committing` and `midrun` sets only; `authoring` and
      `refresh` get **no line** (decision 6). On `midrun` with a dirty tree the
      action is unavailable and the line says the phase must land first
      (decision 7).
- [x] Relay a refusal verbatim on the page — the workbench held by another spec,
      a hotfix, a stateful spec, migrations, no dev server — with the engine's
      own way out, never a worked-around one (decision 5).
- [x] Move `reviewTierStack`/`reviewTierLine` from `cli.js` into
      `env/review.js`, re-exported from `cli.js` so no caller moves. The page
      payload needs the tiers and `serve.js` cannot reach into `cli.js` — it is
      the other way round.
- [x] Add `allow-network` and `allow-remote` to `ACTIONS`, **enable-only**
      (decision 11). There is no disable action: turning `network` off from a
      page reached over the network kills the page doing the turning.
- [x] Render the surfaces block from the tiers as well as the live state
      (decision 12): the live line, then each tier that is **off** with the
      press that turns it on. An `on` tier carries nothing.
- [x] Carry what `allow` dirtied back to the reader (decision 13) — it edits a
      **committed** file in the primary checkout, unlike the live actions, and a
      setting change must not land invisibly.
- [x] Tests: the blob accepts each action and rejects an action-plus-verdict;
      the block renders per state and per button set; a refusal reaches the page
      unedited; an on-tier offers no disable press.
- [x] **Stays-silent test**: a `--docs` render carries no live line and no
      explanation of why, and an `unavailable` state renders nothing.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The page can queue a pass and nothing more, and that limit is what made the open
port defensible — so this is the first control on the page that causes the engine
to *do* something beyond storing what you said. Removing that limit is what
reopens `feat-three-review-links` decision 5, and the tier presses arrived here
mid-phase for exactly that reason.

What is unchanged is the guard: the **serve token** still decides who may POST
at all, and every action is bounded — the live ones to this spec's own branch,
the tier ones to *enabling* a surface the presser can already reach. A press
can only come from someone already reading the page, which is why widening
loopback→network is not a widening anyone gained by: on a loopback-bound
server, only the machine itself can reach the page, and the command was already
available there.

Three things the tasks did not name:

- **`judgeVerdict` no longer honours a word it does not know.** Writing the
  "an action can never clear a gate" test found it passing any unrecognised
  string straight through with `honoured: true` — cannot-tell routed to the
  branch that acts, which is rule 4 inverted. Nothing reaches it today (both
  doors validate first), so this is not a fix for a live bug; it is closing the
  hole so a fifth door added later cannot reopen it.
- **The enable rows carry their own warning.** `allow` edits a *committed* file
  in the primary checkout, unlike the live actions, which move a branch and
  write a gitignored receipt. The row says so **before** the press rather than
  the render reporting it after.
- **`pageTiers` rather than `reviewTierStack`** for the page. The full stack
  needs the server's bind, the machine's addresses and any published URL; the
  page needs only which tiers are **off**, and an off tier has no URL by
  definition. `reviewTierStack` still moved into `env/review.js` as planned —
  `serve.js` could not reach into `cli.js` — and `cli.js` re-exports it, so no
  caller moved.
