# Phase 1 — Decide the approach, and audit the port-touching tests ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** know how many tests carry this shape and whether a CI matrix is
warranted, with the answer written down rather than assumed.

## Tasks

- [ ] Read each of the eight files that bind or kill ports and classify every
      site: does it kill/close a listener and then assert on something that
      needs the port back?
- [ ] For each one found, say whether it waits, and on what — a timer, a
      liveness check, or the port itself. Only the last is sound.
- [ ] Establish the actual cost of adding `macos-latest` to the matrix — the
      suite is ~22s, so measure rather than assume the doubling matters.
- [ ] Record the decision in the overview Decisions section, including a
      rejected option and why.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands — green before the phase is done.

## Notes

`stopProcess` polls `isAlive` until the process is reaped, so a test using
`stopServe` is on much safer ground than one sending a raw `SIGKILL`. The audit
should confirm that distinction holds rather than treat every site as equal.
