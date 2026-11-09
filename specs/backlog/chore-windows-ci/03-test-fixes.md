---
github_issue_id: "#150"
---

# Phase 3 — Test-only Windows assumptions ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** no test assumes POSIX where the product does not — proven by the
full suite green on windows-latest.

## Tasks

- [ ] Replace hard-coded `/tmp`, `/dev/null` and `/` separators in tests with
      `os.tmpdir()`, `path` and git's own forward-slash paths as appropriate
- [ ] Guard chmod / executable-bit and POSIX-signal assertions; where the
      feature does not apply on Windows, skip with a named reason
- [ ] Tasks added by phase 1's triage
- [ ] Tests: full suite green on windows-latest (job still non-blocking) and
      unchanged on ubuntu
