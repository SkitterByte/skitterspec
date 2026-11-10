---
github_issue_id: "#150"
---

# Phase 3 — Test-only Windows assumptions ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** no test assumes POSIX where the product does not — proven by the
full suite green on windows-latest.

## Tasks

- [x] Push and read each run through its annotations, product first, until
      both Windows steps pass — seven rounds, runs 42703961942 → 42794894480;
      the last has no failure annotations at all
- [x] Product fixes found on the way, each committed `fix(...)` with a
      Release-Note where a user would notice: the review server and proxy
      start (quoted daemon paths); the credential store reads (no POSIX mode
      check on win32); one folder prints one way (canonical primary root);
      reviewers run (`sh`, tree kill); seeds work without Developer Mode
      (junction or copy); printed Windows paths use `/`; `spec-sanitise` skips
      `specs\.core`; the init manifest is `/`-keyed, read back from either
      form; `build-dist` writes `/` requires; the `file://` URL keeps its drive
- [x] Replace hard-coded `/`, `..\` and `/tmp` expectations in tests with the
      printed form (`shellPath`) or separator-agnostic patterns; canonicalise
      fixture temp dirs with `realpathSync.native`
- [x] Guard POSIX-only assertions with a named win32 skip: mode bits (`0600`),
      executable bits, and git's checkout-time `.claude` links
- [x] Symlinked `.claude/**` on Windows — git creates them before
      `node_modules` exists; `claude-links` skips there with that reason
- [x] Tests: full suite and `test:nested` green on windows-latest (run
      42794894480) and on ubuntu; locally 4662 and 167

## Notes

The CI reporter grew twice to make this possible without the log: every
failure packed into ten annotations, then the throw site and compared values
added. `cli-spec-env-stage`'s "unreadable git" test failed once locally under
a parallel nested run and has not recurred.
