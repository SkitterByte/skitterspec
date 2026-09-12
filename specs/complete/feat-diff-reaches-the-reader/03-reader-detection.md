---
linear_issue_id: "SKS-188"
---

# Phase 3 — Reader detection: three states, reported not acted on ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine says where it thinks the reader is, is honest when it cannot
tell, and never does anything on the strength of it.

## Tasks

- [x] Add `review.reader` to `env.config.json` handling in `config.js`:
      `local | remote | detect`, defaulting to `detect`. An explicit value is
      **believed without sniffing** — the operator knows where they are reading.
- [x] Implement detection, in this order, returning `local` · `remote` ·
      `unknown`:
      - `SSH_CONNECTION` / `SSH_TTY` set → `remote`.
      - `CLAUDE_CODE_BRIDGE_SESSION_ID` set → `remote`.
      - neither set → `unknown`, **not** `local`.
- [x] **Never use `CLAUDE_CODE_ENTRYPOINT`**, and say why in a comment beside the
      check: it describes the process, not the reader, and answered `cli` for the
      bridged session this spec was written from — the exact wrong answer.
      **Never use a tty check**: stdin is never a tty under Claude Code, so it
      discriminates nothing.
- [x] Name the blind spot beside the detection
      (`.claude/rules/negative-checks.md` rule 2): the bridge variables are
      undocumented harness internals, so their **absence proves nothing** — which
      is why the third state exists and why the default is `unknown` rather than
      `local`.
- [x] Print a `reader:` line from `spec-env review` naming the state and the
      reason (`remote (bridge session)`, `remote (ssh)`, `local (configured)`,
      `unknown`), and add `reader` to `--json`.
- [x] When the reader is `remote`, mark the `file://` line as such in place
      rather than suppressing it — the path is still the truth about where the
      page is, it just will not open there.
- [x] Tests (`packages/common/test/env-review-reader.test.js`): each signal maps
      to its state with its reason; an explicit config value wins over every
      signal, in both directions.
- [x] **Stays-silent tests:** with no signals and no config the state is
      `unknown` and the output is today's plus the `reader:` line — nothing is
      suppressed, nothing is published, no error; and `unknown` never renders the
      "will not open here" warning, which would be an accusation on a healthy
      local session.
- [x] Run the project's test command — green before the phase is done.

## Notes

Detection chooses **wording**, never action. Nothing in this phase may publish,
serve, or refuse on the basis of a detected state; that is what keeps a wrong
guess cheap in both directions. Guessing `local` prints a dead link — the bug
this spec exists to fix. Guessing `remote` and acting on it would publish
something the tooling cannot remove, unprompted.

Tests must set and unset the environment explicitly rather than reading the
ambient one, or they pass or fail depending on where the suite is run from.

## Outcome

Fourteen tests, all green (`packages/common/test/env-review-reader.test.js`);
full suite **1967 pass, 0 fail**.

**It detected the session it was written from, correctly.** Run here, against a
local Warp CLI on the dev machine with the operator reading on a phone:

```
spec-env review: feat-diff-reaches-the-reader (uncommitted)
  reader: remote (bridge session)
  open: file:///…/feat-diff-reaches-the-reader.html   (will not open where you are reading)
  serve: skitterspec spec-env review serve --host 0.0.0.0
```

`CLAUDE_CODE_ENTRYPOINT` was `cli` for that same session. Consulting it would
have produced a confident `local` and another dead link, which is why it is
named in a comment as deliberately unused and pinned by a test that feeds
exactly that environment and asserts `unknown`.

**`detectReader(env)` takes its environment as an argument** rather than reading
`process.env`. A test that inherited the ambient environment would pass or fail
depending on whether the suite ran over ssh or from a bridged session — the very
variation under test.

**Ten of the fourteen are about not being confident.** An empty-string signal is
not a signal; no signal is `unknown` rather than `local`; an unrecognised config
value falls through to `detect`; `unknown` prints no `reader:` line and no
warning, because unknown is the ordinary state of a healthy local session and
announcing it is noise. The last test asserts the rule the whole phase rests on:
after a `remote` detection the reviews directory contains **the page and nothing
else** — no `.url`, no `.publish.html`. Detection chose wording; it chose no
action.
