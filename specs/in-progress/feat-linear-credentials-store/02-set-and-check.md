# Phase 2 — Set it out-of-band; check it from the skill ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a user sets their key with one command they run themselves, and
`/spec-linear-setup` can confirm readiness without ever handling the value.

## Tasks

- [x] Add `spec-sync credentials <status|set|unset>` to the `cli-sync.js`
      dispatch and its usage string.
- [x] `set`: prompt on a TTY with **echo off**, plus `--stdin` for piping.
      Reject a `--key` argument outright with a message saying why (shell
      history, `ps`). Create the directory and file `0600`; refuse to widen the
      mode of an existing file.
- [x] `status`: report store path, mode, team, and whether a key is present with
      a masked fingerprint (last 4) and its source. **Never the value** — this is
      the command a skill runs.
- [x] `unset`: remove this team's entry, leaving other teams intact.
- [x] Return non-zero from every failure path and print why, per the exit-code
      convention in `cli-sync.js` (`resolveOrExit`).
- [x] Update `/spec-linear-setup` step 8: run `credentials status`, report what
      is missing, and print the `credentials set` command for the user to run —
      never prompt for a key in the interview.
- [x] Point the no-key error at `credentials set` — Phase 1 deliberately left it
      naming only the store file, so that phase shipped without advertising a
      command that did not exist yet.
- [x] Document the store, the command, and the precedence in `linear.config.md`.
- [x] Add tests: `set --stdin` writes `0600`; `--key` is refused; `status` masks
      the value and names the source; `unset` leaves other teams intact; an
      asset test asserting the setup skill does **not** ask for a key.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

`--key` is *parsed* — it consumes its value and throws it away — rather than left
unrecognised. An unparsed flag falls through to `positional`, and the secret
would then be printed back in a usage message: refusing it while leaking it.

`status` exits non-zero when no key is set, so a skill can branch on readiness
without parsing prose.

## Notes

The asset test is the durable guard on the governing decision: prose in a skill
is what a model acts on, so "never prompt for the key" has to be pinned the same
way the tracker-free base skills are.
