---
linear_issue_id: "SKS-223"
---

# Phase 1 — Record and compare the engine ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the engine can say whether a running server is current, stale, or
unanswerable — and the page says which engine drew it.

## Tasks

- [ ] Stamp `engine` into the serve settings file at startup: the version the
      server process actually loaded, read from its own package, not from the
      repo it is serving.
- [ ] Write `staleServer(recorded, running)` as a **pure** function with three
      outcomes — `current`, `stale`, `unknown`. Three states, not two
      (`.claude/rules/negative-checks.md` rule 4).
- [ ] Route every unanswerable case to `unknown`: no recorded version, an
      unreadable settings file, a version that does not parse. Name each one in a
      comment beside the check, because each is a way the lookup could be blinded.
- [ ] Report it on `spec-env review serve --status`: the engine it is running,
      and whether that differs from this one.
- [ ] Add the footer line to the page — `rendered by skitterspec <version>` —
      spliced by the engine like every other field. This is the half a reader can
      check for themselves, and the half that would have caught the original
      incident in seconds rather than by grep.
- [ ] Tests: `current` on a match; `stale` on a difference; `unknown` on each
      blinded case; the footer carries the version the render actually used.
- [ ] **Stays silent:** an `unknown` outcome exits 0, prints nothing, and accuses
      nothing — a server from before this shipped is healthy, not broken
      (`.claude/rules/negative-checks.md` rule 3).
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The comparison is deliberately **recorded vs running**, not a file mtime. An
mtime is wrong across a dev-link, a rebuild, and a `git checkout` that restores
an older file — all three are normal here, and all three would make a healthy
server read as stale.
