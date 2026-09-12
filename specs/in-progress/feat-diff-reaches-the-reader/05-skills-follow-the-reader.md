---
linear_issue_id: "SKS-190"
---

# Phase 5 — Point the skills at the right answer ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the four skills that offer a diff offer the one that will actually open
for the reader, using the engine's `reader:` line rather than their own guess.

## Tasks

- [x] Rewrite `/spec-diff` §4 so **serve is the first answer**: the page is a
      file when you are at the machine, and `spec-env review serve` when you are
      not. Keep the file path as the local default — it costs nothing and needs
      no process.
- [x] Wire the offer wording in `/spec-next`, `/spec-bug` and `/spec-hotfix` to
      the `reader:` line the engine prints:
      - `local` → the `file://` URL, as today.
      - `remote` → say the link will not open where they are, and name the two
        that will: `serve`, or publish.
      - `unknown` → today's offer plus one line naming the alternative. **Do not
        warn** — an unknown reader is usually a local one.
- [x] **Never publish on a reader state.** Publishing stays an explicit ask in
      every one of the four skills, whatever the detection says.
- [x] Document `review.reader` and `review.servePort` in
      `packages/common/assets/core/env.config.md`, including that an explicit
      value is believed and detection is only the default.
- [x] Rebuild the composed provider skills (`scripts/build-dist.js`) and confirm
      the seam-filled copies under `packages/skitterspec-linear/assets/skills/`
      carry the new wording.
- [x] Tests: extend `packages/common/test/assets-phase-end-review.test.js` —
      which already loops all three green-reaching skills — so each carries the
      three-state wording and the never-publish-on-detection rule.
- [x] **Stays-silent tests:** no skill sniffs an environment variable itself
      (assert no `SSH_CONNECTION`, `CLAUDE_CODE_` or tty reference in any
      SKILL.md); `/spec-complete` and `/spec-to-main` still gain nothing.
- [x] Run the project's test command — green before the phase is done.

## Notes

Last, because the wording it writes depends on phases 1 and 3 both existing —
there is no point telling a skill to offer `serve` before there is a server, or
to branch on a reader state before one is reported.

The assert-no-sniffing test is the load-bearing one. Decision 7 puts detection
in the engine precisely so it is testable, and the way that decision gets undone
is a well-meaning edit teaching a skill to check `SSH_CONNECTION` itself.

## Outcome

Eleven tests appended to `assets-phase-end-review.test.js` (28 there now); full
suite **1987 pass, 0 fail**. Composed copies rebuilt and verified: all four
skills carry the reader wiring in both `packages/skitterspec` and
`packages/skitterspec-linear`.

`/spec-diff` §4 became **"Render the page — or serve it"** and a new **§4a** owns
the reader question: a three-state table, and an explicit prohibition on reading
the environment. The three green-reaching skills got the same three-state
wording next to their existing never-publish rule.

**The assert-no-sniffing test is the one that matters**, and it is written to
survive the obvious objection. It scans **every** shipped SKILL.md line by line
and fails a line mentioning `SSH_CONNECTION`, `SSH_TTY` or any `CLAUDE_CODE_*`
**unless that line also says not/never** — so naming them as forbidden stays
legal while using them does not. A blanket ban on the strings would have made
the prohibition itself unwritable, which is how this kind of guard usually dies.

**One re-wrap the project's own rules forced**, again caught by a test rather
than by review: two `**bold**` spans crossed a hard line break
(`assets-emphasis.test.js`). Third time today.

`env.config.md` documents both keys with the reasoning attached — that an
explicit `reader` is believed without sniffing, that an unrecognised value falls
through to `detect` so a typo cannot become a confident answer, and that anyone
holding the LAN URL can read every spec's diff while the server runs.
