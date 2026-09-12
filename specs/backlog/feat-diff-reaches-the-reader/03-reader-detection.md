---
linear_issue_id: "SKS-188"
---

# Phase 3 — Reader detection: three states, reported not acted on ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the engine says where it thinks the reader is, is honest when it cannot
tell, and never does anything on the strength of it.

## Tasks

- [ ] Add `review.reader` to `env.config.json` handling in `config.js`:
      `local | remote | detect`, defaulting to `detect`. An explicit value is
      **believed without sniffing** — the operator knows where they are reading.
- [ ] Implement detection, in this order, returning `local` · `remote` ·
      `unknown`:
      - `SSH_CONNECTION` / `SSH_TTY` set → `remote`.
      - `CLAUDE_CODE_BRIDGE_SESSION_ID` set → `remote`.
      - neither set → `unknown`, **not** `local`.
- [ ] **Never use `CLAUDE_CODE_ENTRYPOINT`**, and say why in a comment beside the
      check: it describes the process, not the reader, and answered `cli` for the
      bridged session this spec was written from — the exact wrong answer.
      **Never use a tty check**: stdin is never a tty under Claude Code, so it
      discriminates nothing.
- [ ] Name the blind spot beside the detection
      (`.claude/rules/negative-checks.md` rule 2): the bridge variables are
      undocumented harness internals, so their **absence proves nothing** — which
      is why the third state exists and why the default is `unknown` rather than
      `local`.
- [ ] Print a `reader:` line from `spec-env review` naming the state and the
      reason (`remote (bridge session)`, `remote (ssh)`, `local (configured)`,
      `unknown`), and add `reader` to `--json`.
- [ ] When the reader is `remote`, mark the `file://` line as such in place
      rather than suppressing it — the path is still the truth about where the
      page is, it just will not open there.
- [ ] Tests (`packages/common/test/env-review-reader.test.js`): each signal maps
      to its state with its reason; an explicit config value wins over every
      signal, in both directions.
- [ ] **Stays-silent tests:** with no signals and no config the state is
      `unknown` and the output is today's plus the `reader:` line — nothing is
      suppressed, nothing is published, no error; and `unknown` never renders the
      "will not open here" warning, which would be an accusation on a healthy
      local session.
- [ ] Run the project's test command — green before the phase is done.

## Notes

Detection chooses **wording**, never action. Nothing in this phase may publish,
serve, or refuse on the basis of a detected state; that is what keeps a wrong
guess cheap in both directions. Guessing `local` prints a dead link — the bug
this spec exists to fix. Guessing `remote` and acting on it would publish
something the tooling cannot remove, unprompted.

Tests must set and unset the environment explicitly rather than reading the
ambient one, or they pass or fail depending on where the suite is run from.
