---
linear_issue_id: "SKS-315"
---

# Phase 1 — The token outlives the process ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a restart, a `--stop` and a reboot all leave the served URL unchanged,
proven by a test that starts a server, stops it, starts it again and asserts the
same URL.

## Tasks

- [x] **Write that test first.** Start a server, record the URL, `--stop`, start
      again, assert the URL is identical. It is red today: `mintToken()` runs on
      every start that has no settings to read from.
- [x] Read the token from a gitignored per-repo file under `.spec-env/`, minting
      it **once** on first use. Keep `crypto.randomBytes(6)` — 48 bits is
      unchanged; only its lifetime moves.
- [x] **Name the blind spot beside it** (`.claude/rules/negative-checks.md`
      rule 2): what must never be done here is deriving the token from the repo
      path the way the port is. The path is guessable by anyone on the machine
      and the token is the only guard on a non-loopback bind, so that trade buys
      stability with the one property the token exists for.
- [x] Keep the existing replace-on-same-bind token reuse. It is now redundant
      rather than wrong, and deleting it is a second change with its own risk.
- [x] Add `spec-env review serve --rotate-token`: mint a new one, write it, and
      say plainly that every link already handed out is now dead.
- [x] **Nothing else mints silently.** A silent mint is the bug — assert that no
      other path calls the minter, the way `env-serve-start-proof` asserts other
      structural claims about this file.
- [x] Tests: the token survives stop/start; two repos get different tokens; a
      missing file mints once and is then stable; `--rotate-token` changes it and
      says so; a corrupt token file is replaced rather than crashing the server.
- [x] **Stays-silent test** (rule 3): the token file is gitignored, so a repo
      that has served a review shows nothing in `git status`.
- [x] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

The port already solved this problem and the fix is not the same one. The port is
**derived** because a port is not a secret; the token is **stored** because it
is. Writing that distinction down is most of this phase's value — the tempting
symmetry is the wrong answer.

`.spec-env/` is already gitignored wholesale, so the file needed no new ignore
rule; the stays-silent test asserts that rather than assuming it.

**A second failing case was added after the plan.** The spec was written
believing the churn was self-inflicted by restarting the server. Starting this
spec disproved that: a server had died on its own and the next render minted a
sixth token with nobody restarting anything. So there are two red tests, not
one — a `--stop`/start pair and a `SIGKILL` — and the second is the one a
restart-only fix would have passed.

**An unwriteable `.spec-env` is not fatal.** The token is still minted and
served for the life of the process; what is lost is only survival across a
restart, which is where this started. Refusing to serve would answer a read-only
directory by taking the page away.

**A malformed token file is replaced, not refused.** A truncated or empty value
cannot guard anything, and the alternative — declining to serve — spends the
page on a file nobody reads.

**One existing test had to be updated, and its old comment is why.** It pinned
`reuseToken || mintToken()` on the stated grounds that *"a cold start still
mints, because there is no link in anyone's hand to preserve"*. That premise was
false the moment the port became stable: a cold start lands on the same port with
a different token, so the link in someone's hand breaks invisibly. The reasoning
is rewritten in place rather than deleted.

**Rotation does not reach a running server**, and the message says so rather
than pretending otherwise — adoption returns the live process's token, so
rotating is `--rotate-token`, then `--stop`, then render. My first test asserted
the URL changed immediately and was wrong about the code, not the other way
round.
