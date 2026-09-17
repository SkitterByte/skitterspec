# Phase 2 — Gate the tag on Linux, and close the second tier ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a release cannot be tagged off a result Linux has not produced, and the
five second-tier sites stop depending on a wait that watches the wrong thing.

Renamed from *"matrix, shared helper, or both"* — phase 1 rejected the matrix
(Decision 2) and found the real gap is **when** the tag is cut, not where the
suite runs.

## Tasks

### The release gate — the half that cost two workflows

- [ ] Make `scripts/release.js` refuse to tag a commit that Linux has not passed.
      Options to weigh: query the GitHub checks API for the commit, or require
      the commit be pushed and named in the invocation. Prefer a **positive signal**
      — a green run for *this sha* — over "the branch looks fine".
- [ ] Route every cannot-tell to inaction and say so: no network, no `gh`, an
      API that will not answer, a repo with no CI. None is evidence that the
      commit is bad, so none may block the tag
      (`.claude/rules/negative-checks.md` rule 4).
- [ ] Give it an explicit override on the record, as `--allow-empty` and
      `--skip-tests` already are — the bargain this repo uses everywhere.
- [ ] Update `RELEASING.md`: the pre-tag suite runs on the releaser's platform,
      and say plainly what that does and does not prove.

### A local Linux run — the half that shortens the loop

- [ ] Add a documented way to run the suite on Linux before pushing (Docker is
      present; `node:22` ran the reader suite 42/42 in ~111s against this
      worktree). A script or a documented one-liner, not a new dependency.
- [ ] Say when to reach for it: a change touching ports, sockets, processes or
      paths — the three incidents so far were all in that set.

### The second tier the audit found

- [ ] `stopProcess` resolves when `isAlive(leaderPid)` goes false, which on
      Linux can precede the forked child closing its listener. Decide whether it
      should additionally wait for the port, or whether the callers should.
- [ ] Fix the five same-port-rebind sites, most severe first:
      `env-review-reader.test.js:802-811` (three servers through one port in a
      loop), `:637-638`, `:756-757`, `:847-871`.
- [ ] `cli-spec-env-dev.test.js:128` asserts
      `assert.throws(() => process.kill(pid, 0), 'the dev process was killed')`.
      That proves the **wrapper** died, not the server — it is structurally blind
      to the exact failure this spec is about, and would pass through it. Make it
      prove the child is gone.
- [ ] `env-review-server-teardown.test.js` writes **the test runner's own pid**
      into `.spec-env/pids/review-serve.pid` (`:111`, `:198`, `:211`). Harmless
      today only because nothing on the `prune`/`down` path calls `stopProcess`;
      the day one does, it sends `signalGroup(-runnerPid, …)` and kills the whole
      run. Leave a comment naming that, or stop using the real pid.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands — green before the phase is done.

## Notes

The guard added in phase 1 (`scripts/test-hygiene.test.js`) closes the door on
the defect *returning*; nothing in it addresses the second tier above, which is a
different shape — the wait is present, it just watches the pid instead of the
socket.

Phase 1 deliberately did not fix the five sites. They are latent rather than
failing: every one of them is green on Linux today, so changing them is a change
to working code and belongs behind its own verdict.
