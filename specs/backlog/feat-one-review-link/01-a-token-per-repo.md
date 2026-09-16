---
linear_issue_id: "SKS-315"
---

# Phase 1 — The token outlives the process ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a restart, a `--stop` and a reboot all leave the served URL unchanged,
proven by a test that starts a server, stops it, starts it again and asserts the
same URL.

## Tasks

- [ ] **Write that test first.** Start a server, record the URL, `--stop`, start
      again, assert the URL is identical. It is red today: `mintToken()` runs on
      every start that has no settings to read from.
- [ ] Read the token from a gitignored per-repo file under `.spec-env/`, minting
      it **once** on first use. Keep `crypto.randomBytes(6)` — 48 bits is
      unchanged; only its lifetime moves.
- [ ] **Name the blind spot beside it** (`.claude/rules/negative-checks.md`
      rule 2): what must never be done here is deriving the token from the repo
      path the way the port is. The path is guessable by anyone on the machine
      and the token is the only guard on a non-loopback bind, so that trade buys
      stability with the one property the token exists for.
- [ ] Keep the existing replace-on-same-bind token reuse. It is now redundant
      rather than wrong, and deleting it is a second change with its own risk.
- [ ] Add `spec-env review serve --rotate-token`: mint a new one, write it, and
      say plainly that every link already handed out is now dead.
- [ ] **Nothing else mints silently.** A silent mint is the bug — assert that no
      other path calls the minter, the way `env-serve-start-proof` asserts other
      structural claims about this file.
- [ ] Tests: the token survives stop/start; two repos get different tokens; a
      missing file mints once and is then stable; `--rotate-token` changes it and
      says so; a corrupt token file is replaced rather than crashing the server.
- [ ] **Stays-silent test** (rule 3): the token file is gitignored, so a repo
      that has served a review shows nothing in `git status`.
- [ ] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

The port already solved this problem and the fix is not the same one. The port is
**derived** because a port is not a secret; the token is **stored** because it
is. Writing that distinction down is most of this phase's value — the tempting
symmetry is the wrong answer.

`.spec-env/` is already gitignored wholesale, so the file needs no new ignore
rule. Confirm that rather than assuming it.
