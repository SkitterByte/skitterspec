# Phase 1 — Decide the approach, and audit the port-touching tests ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** know how many tests carry this shape and whether a CI matrix is
warranted, with the answer written down rather than assumed.

## Tasks

- [x] Read each of the eight files that bind or kill ports and classify every
      site: does it kill/close a listener and then assert on something that
      needs the port back?
- [x] For each one found, say whether it waits, and on what — a timer, a
      liveness check, or the port itself. Only the last is sound.
- [x] Establish the actual cost of adding `macos-latest` to the matrix — the
      suite is ~22s, so measure rather than assume the doubling matters.
- [x] Record the decision in the overview Decisions section, including a
      rejected option and why.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands — green before the phase is done.

## Notes

`stopProcess` polls `isAlive` until the process is reaped, so a test using
`stopServe` is on much safer ground than one sending a raw `SIGKILL`. The audit
confirmed that distinction holds — **and found where it stops holding**: a
reaped `sh` leader does not mean the forked child has closed its listener, so
five sites that stop and re-bind the same port in one breath are latent rather
than sound. They are listed in phase 2, most severe first. None is failing
today, which is why phase 1 did not touch them.

**What the audit did NOT find is the headline.** Zero surviving sites of the
defect itself. The sweep was worth running anyway: the shape it was looking for
had already reached a release once, and "there is only one" is a fact worth
establishing rather than assuming.

**The guard is the phase's test.** An audit phase has no feature to cover, so
what `scripts/test-hygiene.test.js` covers is the finding: it fails if the bad
form comes back. Run against the real pre-fix file from git history it flags
line 662 — the exact call that cost two workflows — and nothing else in that
file, so it is proven against the incident rather than against a fixture.

**And the decision reversed the spec's own plan.** The CI matrix was the leading
candidate on the way in and is rejected on the way out (Decision 2): the ubuntu
leg already existed and already caught this. Writing the phase to *decide* rather
than to *apply* is what made that reversible on paper instead of in code.
