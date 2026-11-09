---
github_issue_id: "#148"
---

# Phase 1 — Run the Windows job and triage its failures ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a categorised list of every windows-latest failure, written into
phases 2–3 as tasks — proven by the phase files naming each failing test.

## Tasks

- [ ] Get a windows-latest run of the current suite: the operator pushes `main`
      (or this branch) — never pushed by a skill
- [ ] Read the failures (`gh run view <id> --log-failed`, or the log pasted in)
      and list each failing test with its error
- [ ] Sort them: line endings · product (process control, shell, symlinks,
      paths) · test-only assumptions (`/tmp`, chmod, signals, separators)
- [ ] Write each product failure as a task in phase 2 and each test-only one in
      phase 3; note any that need a named Windows skip and why
- [ ] Record the counts in the Changelog; no code changes, so the ubuntu suite
      stays as it is

## Notes

`gh` is not installed on the authoring machine; install it or paste the
failing log. A failure caused purely by CRLF is expected to dominate — sort
those under line endings rather than per test.
