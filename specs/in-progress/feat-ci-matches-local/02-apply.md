# Phase 2 — Gate the tag on Linux, and close the second tier ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a release cannot be tagged off a result Linux has not produced, and the
five second-tier sites stop depending on a wait that watches the wrong thing.

Renamed from *"matrix, shared helper, or both"* — phase 1 rejected the matrix
(Decision 2) and found the real gap is **when** the tag is cut, not where the
suite runs.

## Tasks

### The release gate — the half that cost two workflows

- [x] Make `scripts/release.js` prove Linux before it tags. **The CI-lookup option was ruled out as structurally impossible**,
      not merely worse: the commit being tagged is the `chore(release):` commit
      the script creates, so no CI run for that sha can exist when the tag is
      cut. It runs the suite in a container against the exact tree instead — the
      same property, proved rather than looked up.
- [x] Route every cannot-tell to inaction and say so: no network, no `gh`, an
      API that will not answer, a repo with no CI. None is evidence that the
      commit is bad, so none may block the tag
      (`.claude/rules/negative-checks.md` rule 4).
- [x] Give it an explicit override on the record, as `--allow-empty` and
      `--skip-tests` already are — the bargain this repo uses everywhere.
- [x] Update `RELEASING.md`: the pre-tag suite runs on the releaser's platform,
      and say plainly what that does and does not prove.

### A local Linux run — the half that shortens the loop

- [x] Add a documented way to run the suite on Linux before pushing (Docker is
      present; `node:22` ran the reader suite 42/42 in ~111s against this
      worktree). A script or a documented one-liner, not a new dependency.
- [x] Say when to reach for it: a change touching ports, sockets, processes or
      paths — the three incidents so far were all in that set.

### The second tier the audit found

- [x] `stopProcess` resolves when `isAlive(leaderPid)` goes false, which on
      Linux can precede the forked child closing its listener. Decide whether it
      should additionally wait for the port, or whether the callers should.
- [x] Fix the five same-port-rebind sites, most severe first:
      `env-review-reader.test.js:802-811` (three servers through one port in a
      loop), `:637-638`, `:756-757`, `:847-871`.
- [x] `cli-spec-env-dev.test.js:128` asserts
      `assert.throws(() => process.kill(pid, 0), 'the dev process was killed')`.
      That proves the **wrapper** died, not the server — it is structurally blind
      to the exact failure this spec is about, and would pass through it. Make it
      prove the child is gone.
- [x] `env-review-server-teardown.test.js` writes **the test runner's own pid**
      into `.spec-env/pids/review-serve.pid` (`:111`, `:198`, `:211`). Harmless
      today only because nothing on the `prune`/`down` path calls `stopProcess`;
      the day one does, it sends `signalGroup(-runnerPid, …)` and kills the whole
      run. Leave a comment naming that, or stop using the real pid.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands — green before the phase is done.

## Notes

The guard added in phase 1 (`scripts/test-hygiene.test.js`) closes the door on
the defect *returning*; nothing in it addresses the second tier, which is a
different shape — the wait is present, it just watches the pid instead of the
socket.

**The gate found a bug in itself, which is the best evidence it works.** The
first version ran `docker run --rm` without `--init`, and two teardown tests
failed in the container while passing on macOS and on CI. The cause was the
container, not the code: with no real init, PID 1 is the test runner, orphans are
never reaped, a killed detached `sh` stays a **zombie**, and `process.kill(pid,
0)` keeps succeeding — so an assertion that a process is gone is false in a
container and true everywhere else. That is a **false accusation pointed at healthy code**,
the precise inverse of the bug this spec exists for and considerably more
corrosive: a gate that cries wolf gets `--skip-linux` forever. `--init` is
therefore load-bearing and has its own test.

**The second tier was fixed at the call sites, not in `stopProcess`.** The open
question asked which. `stopProcess` is generic — dev servers included — and does
not know a port, so teaching it to wait would mean inventing a port it has no
business knowing. The three sites that re-bind now use `stopServeAndWait`, which
reads the port the server actually recorded; every teardown-only call keeps the
plain form, because nothing re-binds after it and a wait there is pure delay.

**`cli-spec-env-dev.test.js` now proves the group died**, not just the wrapper.
`kill(-pid, 0)` succeeds while any process in the group lives, so it is the
probe that means what the assertion's message already claimed.

The whole suite was run through the gate's own command as the last step of this
phase: **3076/3076 on Linux**, matching macOS exactly.
