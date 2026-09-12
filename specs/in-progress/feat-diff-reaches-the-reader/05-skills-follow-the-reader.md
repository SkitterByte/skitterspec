---
linear_issue_id: "SKS-190"
---

# Phase 5 — Point the skills at the right answer ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the four skills that offer a diff offer the one that will actually open
for the reader, using the engine's `reader:` line rather than their own guess.

## Tasks

- [ ] Rewrite `/spec-diff` §4 so **serve is the first answer**: the page is a
      file when you are at the machine, and `spec-env review serve` when you are
      not. Keep the file path as the local default — it costs nothing and needs
      no process.
- [ ] Wire the offer wording in `/spec-next`, `/spec-bug` and `/spec-hotfix` to
      the `reader:` line the engine prints:
      - `local` → the `file://` URL, as today.
      - `remote` → say the link will not open where they are, and name the two
        that will: `serve`, or publish.
      - `unknown` → today's offer plus one line naming the alternative. **Do not
        warn** — an unknown reader is usually a local one.
- [ ] **Never publish on a reader state.** Publishing stays an explicit ask in
      every one of the four skills, whatever the detection says.
- [ ] Document `review.reader` and `review.servePort` in
      `packages/common/assets/core/env.config.md`, including that an explicit
      value is believed and detection is only the default.
- [ ] Rebuild the composed provider skills (`scripts/build-dist.js`) and confirm
      the seam-filled copies under `packages/skitterspec-linear/assets/skills/`
      carry the new wording.
- [ ] Tests: extend `packages/common/test/assets-phase-end-review.test.js` —
      which already loops all three green-reaching skills — so each carries the
      three-state wording and the never-publish-on-detection rule.
- [ ] **Stays-silent tests:** no skill sniffs an environment variable itself
      (assert no `SSH_CONNECTION`, `CLAUDE_CODE_` or tty reference in any
      SKILL.md); `/spec-complete` and `/spec-to-main` still gain nothing.
- [ ] Run the project's test command — green before the phase is done.

## Notes

Last, because the wording it writes depends on phases 1 and 3 both existing —
there is no point telling a skill to offer `serve` before there is a server, or
to branch on a reader state before one is reported.

The assert-no-sniffing test is the load-bearing one. Decision 7 puts detection
in the engine precisely so it is testable, and the way that decision gets undone
is a well-meaning edit teaching a skill to check `SSH_CONNECTION` itself.
