---
linear_issue_id: "SKS-280"
---

# Phase 3 — The help lists every verb, and stays that way ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `--help` documents `live` and `stage`, and a test fails the next time
a verb is added to the dispatcher without being added to the help.

## Tasks

- [ ] Add `live` and `stage` to the `spec-env` subcommand list in the `HELP`
      string (`packages/common/src/cli.js`), each with a one-line description
      consistent with the dispatcher's usage string and with
      `.claude/rules/spec-planning.md`.
- [ ] Export one `SPEC_ENV_VERBS` constant and build the default-case usage
      string from it, so the two lists cannot drift apart again.
- [ ] Add `packages/common/test/cli-help-verbs.test.js`: every verb in
      `SPEC_ENV_VERBS` appears in `HELP`, **and** `HELP` names no `spec-env`
      verb the dispatcher does not handle. Both directions — a verb documented
      but not dispatched is the same class of lie as one dispatched but not
      documented.
- [ ] Assert `SPEC_ENV_VERBS` matches the `case` labels the dispatcher actually
      handles, so adding a case without adding the verb fails here rather than
      shipping.
- [ ] Run `pnpm test` from the repo root — green before the phase is done.

## Notes

`live` and `stage` went missing independently, at different times, which is what
makes this a missing constraint rather than two slips — hence the guard rather
than two added lines.

The review sub-actions (`review serve`/`arm`/`gate`/`skip`) are documented in
the dispatcher's usage string but are not top-level verbs; keep them out of
`SPEC_ENV_VERBS` and out of the assertion.
