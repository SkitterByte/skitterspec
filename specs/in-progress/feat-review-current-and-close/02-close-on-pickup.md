# Phase 2 — A truthful pickup state, and a tab that closes when it is done ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the panel shown after a verdict distinguishes *still asking* from
*nobody claimed it*, spins while it asks, and closes the tab only once a claim
is confirmed — proven by driving all three `picked` values through
`drawDecided` and asserting what each renders and whether `window.close` was
called.

## Tasks

- [x] Add a waiting element to the decided panel's markup — a CSS-only spinner
      plus "Sent — waiting for Claude to pick it up…" — hidden by default.
- [x] Give the spinner a `@keyframes` rotation and a
      `@media (prefers-reduced-motion: reduce)` branch that stops the animation
      and leaves a static mark. The page ships with no network assets, so this
      is CSS and markup only.
- [x] Split `drawDecided`'s pickup rendering three ways on `decided.picked`:
      `null` shows the spinner and **hides the command** even when
      `decided.cmd` is set; `true` says Claude picked it up and shows nothing to
      run; `false` keeps today's "still waiting to be picked up" sentence and
      the `/spec-reviewed <code>` command.
- [x] Make sure a page restored from `localStorage` with a stored `picked: null`
      does not spin forever: a decision reloaded from storage is history, not a
      live poll, so treat a restored `null` as the `false` shape — command on
      screen, no spinner.
- [x] Attempt the close only from the `picked === true` branch: draw the
      confirmation, then `window.setTimeout(…)` a short beat before calling
      `window.close()` inside a `try`/`catch`.
- [x] Guard on `typeof window.close === 'function'` and swallow anything it
      throws — a refused close must leave the confirmed panel standing with no
      error and no second path (Decision 8).
- [x] Leave `sendToStore` (the published-artifact transport) untouched: it has
      no pickup confirmation to wait on, so it can never reach the closing
      branch, and it must keep saying a verdict there needs `/spec-reviewed`.
- [x] Add a `close` spy to the test shim's `window`.
- [x] Test: `picked: null` renders the spinner and no command, even when a
      command was passed.
- [x] Test: `picked: true` names no command, and calls `window.close` once.
- [x] Test (stays silent): `picked: false` renders today's sentence, keeps
      `/spec-reviewed <code>` on screen, and does **not** call `window.close` —
      the established-nobody-claimed-it case, which is where the recovery
      command matters most.
- [x] Test (stays silent): a shim whose `window.close` throws still leaves the
      confirmed panel and its text intact.
- [x] Test: the existing `watchPass` path end-to-end — a POST that returns a
      code, a poll answering `claimed`, and the page ending closed; and a poll
      that never answers ending on the command with the tab open.
- [x] Test: re-running the page over storage from a decided-with-`null` session
      shows the command rather than a spinner.
- [x] Run `node --test` from the repo root — green before the phase is done.

## Notes

`post()` already calls `markDecided(verdict, '/spec-reviewed ' + code, null)`
and then `watchPass(code, verdict)`, so the send path needs no change — this
phase only alters how `drawDecided` renders the value that call already passes.

The shim's `setTimeout` runs its callback synchronously, which is what makes
both the poll rounds and the closing beat assertable without a clock.

`watchPass` treats running out of rounds as `stop(false)` — a cannot-tell
routed to the harmless branch, deliberately. That stays exactly as it is: the
close hangs off `true` alone, so an impatient poll can never close a tab whose
pass nobody has taken.
