# Phase 2 — Set it out-of-band; check it from the skill ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a user sets their key with one command they run themselves, and
`/spec-linear-setup` can confirm readiness without ever handling the value.

## Tasks

- [ ] Add `spec-sync credentials <status|set|unset>` to the `cli-sync.js`
      dispatch and its usage string.
- [ ] `set`: prompt on a TTY with **echo off**, plus `--stdin` for piping.
      Reject a `--key` argument outright with a message saying why (shell
      history, `ps`). Create the directory and file `0600`; refuse to widen the
      mode of an existing file.
- [ ] `status`: report store path, mode, team, and whether a key is present with
      a masked fingerprint (last 4) and its source. **Never the value** — this is
      the command a skill runs.
- [ ] `unset`: remove this team's entry, leaving other teams intact.
- [ ] Return non-zero from every failure path and print why, per the exit-code
      convention in `cli-sync.js` (`resolveOrExit`).
- [ ] Update `/spec-linear-setup` step 8: run `credentials status`, report what
      is missing, and print the `credentials set` command for the user to run —
      never prompt for a key in the interview.
- [ ] Document the store, the command, and the precedence in `linear.config.md`.
- [ ] Add tests: `set --stdin` writes `0600`; `--key` is refused; `status` masks
      the value and names the source; `unset` leaves other teams intact; an
      asset test asserting the setup skill does **not** ask for a key.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

The asset test is the durable guard on the governing decision: prose in a skill
is what a model acts on, so "never prompt for the key" has to be pinned the same
way the tracker-free base skills are.
