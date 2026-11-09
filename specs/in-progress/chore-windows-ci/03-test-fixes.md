---
github_issue_id: "#150"
---

# Phase 3 — Test-only Windows assumptions 🔄

> Spec: [00-overview.md](00-overview.md) · **Status:** In progress

**Goal:** no test assumes POSIX where the product does not — proven by the
full suite green on windows-latest.

## Tasks

- [ ] Push and read the next run through its annotations (`gh-annotations`);
      triage what remains, product first, and repeat until both Windows steps
      pass
- [ ] Symlinked `.claude/**` files check out on Windows as text files holding
      their target (`core.symlinks` is off there) — expect tests reading
      through them to fail; decide per test
- [ ] Replace hard-coded `/tmp`, `/dev/null` and `/` separators in tests with
      `os.tmpdir()`, `path` and git's own forward-slash paths as appropriate
- [ ] Guard chmod / executable-bit and POSIX-signal assertions; where the
      feature does not apply on Windows, skip with a named reason
- [ ] Tasks added by phase 1's triage
- [ ] Tests: full suite green on windows-latest (job still non-blocking) and
      unchanged on ubuntu
