# Knowing where you are in a diff, and knowing when it is over

> **Type:** Feature
> **Name:** feat-review-current-and-close (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-21
> **Area:** packages/common/assets/review/page.html, packages/common/test/assets-review.test.js
> **Stack:** worktree

## Problem

Two ends of the same read.

**The beginning.** The review page's sidebar lists every file in the diff, and
on a wide screen it is `position: sticky` — it stays put while the main pane
scrolls past it. It never says which of those files you are currently looking
at. On a seven-file diff that is a mild annoyance; on a thirty-file one the
sidebar becomes a map with no "you are here", and the reader loses the thread
of where they are in the change. The information is right there — the tree is
on screen, the file's card is on screen — and nothing connects them.

**The end.** Pressing a verdict is the last thing anyone does on this page, and
the page stays open afterwards. Worse, the moment a POST returns it asserts
*"It is still waiting to be picked up"* and offers `/spec-reviewed <code>` —
then, up to seven seconds later, `watchPass` corrects it to *"Claude picked
this up — there is nothing to run."* The pessimistic sentence is printed while
the page genuinely does not know yet, so the reader is told to run a command
they almost never need, and a tab they are finished with sits there wanting a
manual close.

## Decisions

1. **The current file is the topmost visible card**, found with an
   `IntersectionObserver` whose `rootMargin` weights a band near the top of the
   viewport. That is what a reader would point at and call "the file I am
   reading". *Rejected:* largest-visible-area, which reads better for one huge
   card among small ones but lags behind the eye whenever cards are short.

2. **A browser without `IntersectionObserver` gets no highlight, in silence.**
   The same shape the page already uses for `ResizeObserver` at
   `page.html:1229` — a `typeof` guard and a page that simply keeps working.

3. **The tree scrolls itself only when the current row has left its own
   scrollport**, with `block: 'nearest'`. The tree is a bounded scrollport
   (`max-height: calc(100vh - 2rem)`), so on a long list the highlight is
   worthless unless the row can be brought into view — and on a short list
   nothing ever moves. *Rejected:* always re-centre, which puts the sidebar in
   constant motion while you scroll.

4. **A left accent bar plus the name in `--accent`.** Hover already owns the
   `--panel-2` background (`.tree-file:hover`), so a filled background would
   make "current" and "the row under my finger" indistinguishable.

5. **The last current row stays lit when nothing qualifies** — scrolled above
   the first card, below the last, or with the current file hidden by the noise
   filter. Clearing it would flicker the highlight off every time a card
   boundary crossed the band, and a stale "you were here" is more use than
   nothing. On a decided page the diff is hidden entirely, so no card
   intersects and the highlight is simply cleared once.

6. **The unknown pickup state gets its own shape, with a spinner.** After a
   successful POST the page knows only that the engine holds the pass; whether
   a session claimed it is unresolved for as long as `watchPass` polls. So that
   window says so — *"Sent — waiting for Claude to pick it up…"* with a
   spinner — instead of asserting the pessimistic answer and retracting it.
   This is `.claude/rules/negative-checks.md` rule 4 applied to a sentence: the
   cannot-tell case gets the harmless branch, which here is saying nothing
   either way rather than naming a command.

7. **The tab closes only on confirmed pickup.** `window.close()` is attempted
   only where `watchPass` returned `claimed === true` — the one positive signal
   that the pass is in Claude's hands and there is provably nothing left on the
   page to read: no code to quote, no command to run, no blob to paste. Every
   other outcome (`waiting`, `unknown`, the poll failing, the rounds running
   out, a `file://` paste, a published page) leaves the page exactly as it is
   today.

8. **Confirmation renders first, then the close is attempted after a short
   beat.** Browsers refuse `window.close()` on a tab the script did not open,
   which is every tab here — so the close is best-effort by construction. A
   refused one must leave the correct ending on screen, and a successful one
   should still read as acknowledgement rather than a tab vanishing mid-press.

9. **No config key.** The trigger is narrow enough not to need one, and
   `review.*` already carries five. *Rejected:* `review.closeOnVerdict` — a key,
   a doc entry, and a test for an off path, bought before anyone has been
   annoyed by the behaviour. A key is a one-line follow-up if it turns out to be
   wanted.

10. **`packages/common/assets/review/page.html` is the only file that changes.**
    The copies under `packages/skitterspec/` and `packages/skitterspec-linear/`
    are produced by `scripts/build-dist.js` and gitignored.

## Solution overview

**Phase 1** adds an `is-current` class to one `.tree-file` at a time. An
`IntersectionObserver` over the per-file `<details>` elements keeps a set of
what is intersecting a top-weighted band; the topmost member by document order
wins, and its tree row is marked. When the marked row lies outside the tree's
own scrollport, `scrollIntoView({ block: 'nearest' })` brings it in.

**Phase 2** splits the decided panel's existing two-state pickup message into
three, matching the three values `markDecided` already carries in `picked`:

| `picked` | Panel says | Command | Closes |
|----------|-----------|---------|--------|
| `null` — still asking | spinner · "waiting for Claude to pick it up…" | hidden | no |
| `true` — confirmed claimed | "Claude picked this up — there is nothing to run." | none | **yes**, after a beat |
| `false` — established nobody did | "It is still waiting to be picked up." | `/spec-reviewed <code>` | no |

The `null` row is the new one. `post()` already calls `markDecided(verdict,
cmd, null)` before starting `watchPass`, so the waiting shape appears with no
change to the send path — only to how `drawDecided` renders that value.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Review page CSS | add | `.tree-file.is-current`, `.pickup-wait`, spinner `@keyframes` + `prefers-reduced-motion` |
| Review page JS | add | current-file observer, `setCurrent(path)`, tree follow |
| Review page JS | update | `drawDecided` — three-valued `picked` rendering |
| Review page JS | add | best-effort `window.close()` on `picked === true` |
| Test DOM shim | add | `IntersectionObserver` stub, `window.close` spy |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Highlight the current file in the tree as you scroll | ⬜ | [01-current-file.md](01-current-file.md) |
| 2 | A truthful pickup state, and a tab that closes when it is done | ⬜ | [02-close-on-pickup.md](02-close-on-pickup.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-21 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-21 — Spec created.
- 2026-09-21 — Close timing changed from a silent one-second beat to a spinner
  covering the pickup poll. The beat assumed the wait was cosmetic; it is not —
  `watchPass` runs up to 8 rounds at 900ms, and the page was filling that window
  with the pessimistic answer. Showing the wait fixes a pre-existing wart as
  well as the close.
